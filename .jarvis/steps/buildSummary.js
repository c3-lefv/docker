/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

data = {
  name: 'buildSummary',
  value: function (step) {
    // This custom step will override the buildSummary step. First, we need to run the build summary as usual.
    var result = JarvisExecutor.Helper.buildSummary(step);

    /**
     * Helper function to get the execution times for code analysis steps.
     */
    function getCodeAnalysisStepDurations(step) {
      var codeAnalysisSteps =
        Jarvis.accessData('JarvisService.Step', 'fetch', {
          filter: Filter.eq('jarvisBuild', step.jarvisBuild.id).and().eq('name', 'codeAnalysis'),
        }).objs || [];

      var stepsWithDuration = codeAnalysisSteps.map(function (codeAnalysisStep) {
        var durationString = Jarvis.WithStateHistory.make({
          state: codeAnalysisStep.state,
          stateHistory: codeAnalysisStep.stateHistory,
        }).duration();
        var duration = Duration.fromString(durationString);
        return {
          id: codeAnalysisStep.id,
          durationString: durationString,
          duration: duration,
        };
      });
      return stepsWithDuration;
    }

    /**
     * Helper function to get the list of packages in this build for which code analysis couldn't be run
     * because they didn't have an upstream dependency on `baseToolkit`.
     */
    function getNoDependencyPkgs(step) {
      var noCodeAnalysisDepPkgs = [];
      var report = Jarvis.reportForId(step.jarvisBuild.id + '-code-analysis');
      report.updates.each(function (pkgResultReport) {
        if (_.get(pkgResultReport, 'data.status') == 'no-dependency') {
          noCodeAnalysisDepPkgs.push(_.get(pkgResultReport, 'data.packageName'));
        }
      });
      return noCodeAnalysisDepPkgs;
    }

    /**
     * Helper function to get the latest processed report for the base branch.
     * This function fetches the last 5 most recently completed builds for the base branch to account for
     * non-"success" final states and picks the processed results report for the most recently completed build.
     */
    function getBaseBranchResultsInfo(step) {
      var baseBranchReportId = step.jarvisBuild.id + '-code-analysis-base-branch';
      var baseBranchReport = Jarvis.reportForId(baseBranchReportId);
      var baseBranch = baseBranchReport && baseBranchReport.data.baseBranch;

      var baseBranchBuilds = Jarvis.accessData('JarvisService.Build', 'fetch', {
        filter: Filter.intersects('branch', baseBranch).and().eq('state', Jarvis.State.DONE),
        include: 'id',
        order: 'descending(meta.created)',
        limit: 5,
      });

      var codeAnalysisReports = [];

      // Only attempt to get the processed results if there are any builds corresponding to the base branch.
      if (baseBranchBuilds.count) {
        var baseBranchBuildIds = (baseBranchBuilds.objs || []).map((build) => build.id);
        codeAnalysisReports = Jarvis.accessData('JarvisService.Report', 'fetch', {
          filter: Filter.intersects('jarvisBuild', baseBranchBuildIds)
            .and()
            .contains('id', '-code-analysis-processed-results'),
          include: 'id, data',
          order: 'descending(meta.created)',
        });
        codeAnalysisReports = codeAnalysisReports.objs;
      }

      return {
        baseBranch: baseBranch,
        baseBranchResults: _.get(codeAnalysisReports, '[0].data.results'),
      };
    }

    try {
      var nextSteps = [];

      // Add the no dependency alert step if any of the package results status are tagged as 'no-dependency'.
      var noCodeAnalysisDepPkgs = getNoDependencyPkgs(step);
      var codeAnalysisStepsWithDuration = getCodeAnalysisStepDurations(step);
      if (noCodeAnalysisDepPkgs.length) {
        var noCodeAnalysisAlertStep = Jarvis.Step.builder()
          .id(step.id + '-noCodeAnalysisAlert')
          .name('noCodeAnalysisAlert')
          .input(step.input.with('noCodeAnalysisDepPkgs', noCodeAnalysisDepPkgs))
          .next(step.next)
          .jarvisBuild(step.jarvisBuild)
          .maxRetries(3)
          .build();
        nextSteps.push(noCodeAnalysisAlertStep);
      }

      /**
       * No reports of this id implies that there were no packages artifacts generated in this
       * Jarvis.Build that include `baseCodeAnalyzer`. In this case, no code analysis was conducted and
       * no results have to be notified.
       */
      var buildCodeAnalysisReport = Jarvis.reportForId(step.jarvisBuild.id + '-code-analysis');
      var rootPkgArtifact = buildCodeAnalysisReport && buildCodeAnalysisReport.data.rootPkgArtifact;
      if (rootPkgArtifact) {
        var pkgName = rootPkgArtifact.name;
        var semanticVersion = rootPkgArtifact.semanticVersion;

        // Set to true when there are no package that have a 'no-dependency' status.
        var isCodeAnalysisComplete = !noCodeAnalysisDepPkgs || noCodeAnalysisDepPkgs.length == 0;

        // Get base branch results to get comparison values.
        var baseBranchResultsInfo = getBaseBranchResultsInfo(step);

        // Add a step to notify users of the code analysis results.
        var reportResultsToCodeAnalytics = Jarvis.buildConfigValue('reportResultsToCodeAnalytics');
        var codeAnalysisSummaryStep = Jarvis.Step.builder()
          .id(step.id + '-codeAnalysisSummary')
          .name('codeAnalysisSummary')
          .input(
            step.input
              .with('baseBranch', baseBranchResultsInfo.baseBranch)
              .with('baseBranchResults', baseBranchResultsInfo.baseBranchResults)
              .with('isCodeAnalysisComplete', isCodeAnalysisComplete)
              .with('codeAnalysisStepsWithDuration', codeAnalysisStepsWithDuration)
              .with('rootPkgArtifact', rootPkgArtifact)
              .with('customPkgName', pkgName)
              .with('customPkgVersion', semanticVersion)
              .with('reportResultsToCodeAnalytics', reportResultsToCodeAnalytics)
          )
          .next(step.next)
          .jarvisBuild(step.jarvisBuild)
          .maxRetries(3)
          .build();
        nextSteps.push(codeAnalysisSummaryStep);
      }

      Jarvis.addSteps(nextSteps);
    } catch (e) {
      /**
       * Update status check to notify of error and transition to a final-state if the code above fails.
       *
       * We need to resolve these in the custom lambda since doing so through the logic in `baseCodeAnalyzer`
       * would require us to go over the same steps as those that would have failed in the `try` block.
       */
      var restApi = Jarvis.sourceControlRestApi();
      if (restApi.type().name() === 'GitHubRestApi') {
        restApi.restInst.createCommitStatus(
          restApi.orgWithSrcCtrlRepoName,
          step.jarvisBuild.sha,
          'error',
          'C3 AI Code Analyzer',
          'There was an error in reporting your code analysis results.'
        );
      }

      // Add the code analysis instantiation error step to surface the error to the user.
      var errorMessage =
        'Failed to instantiate notify code analysis step for because of the following error.\n' + e.toString();
      var codeAnalysisInstErrorStep = Jarvis.Step.builder()
        .id(step.jarvisBuild.id + '-codeAnalysisSummaryInstError')
        .name('codeAnalysisInstError')
        .input(step.input.with('errorMessage', errorMessage))
        .jarvisBuild(step.jarvisBuild)
        .maxRetries(3)
        .build();
      Jarvis.addSteps([codeAnalysisInstErrorStep]);
    }

    return result;
  },
};
