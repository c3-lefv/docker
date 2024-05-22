/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

data = {
  name: 'codeAnalysisSummary',
  value: function (step) {
    /**
     * Function to generate the customization results based on the passed in top-level customer package and
     * the exhaustive list of customer packages to ignore.
     */
    function getCustomizationResults(topLevelCustomerPackage, customerPackages) {
      // If no top-level customer package is defined, we do not run customization analysis for this build.
      if (!topLevelCustomerPackage) return;

      var packageName = C3.app().rootPkg;
      if (topLevelCustomerPackage !== packageName) {
        /**
         * Sanity to check to ensure the Jarvis step was started for the top-level customer package.
         * If not, throw an error so that we do not compute and store incorrect results.
         */
        throw new Error(
          'Failed sanity check! codeAnalysisSummary step was not started from the defined topLevelCustomerPackage (' +
            topLevelCustomerPackage +
            ')\n' +
            'Please ensure the `topLevelCustomerPackage` exists in this repository.' +
            ')\n' +
            'If the packages exists, please reach out to the ENG-X team on the V8 Engineering Tools Community channel' +
            ' immediately for support.'
        );
      }

      if (!customerPackages || !customerPackages.length || !customerPackages.includes(topLevelCustomerPackage)) {
        throw new Error(
          'Incomplete list of customer packages provided. Please ensure the customerPackages configuration in the ' +
            'config/config.js file includes all customer packages, including the top-level customer package.\n' +
            'Please reach out to the ENG-X team on the V8 Engineering Tools Community channel for support.'
        );
      }

      return BaseCustomizationAnalyzer.analyzeCodeWithExecutionTime(customerPackages);
    }

    // Helper to store code analysis summary in a Jarvis.Report.
    function storeCodeAnalysisSummaryReport(
      step,
      restApi,
      sourceControlSpec,
      codeAnalysisResults,
      codeAnalysisStepsWithDuration,
      reportResultsToCodeAnalytics,
      topLevelCustomerPackage,
      customerPackages
    ) {
      var trimmedCodeAnalysisResults = BaseCodeAnalyzer.getTrimmedAuditResults(codeAnalysisResults);
      var customizationResults = getCustomizationResults(topLevelCustomerPackage, customerPackages);
      var codeAnalysisSummaryReport = Jarvis.Report.make({
        id: step.jarvisBuild.id + '-code-analysis-processed-results',
        data: {
          codeAnalysisResults: trimmedCodeAnalysisResults,
          customizationResults: customizationResults,
        },
      });
      Jarvis.fileReports([codeAnalysisSummaryReport]);

      /**
       * Store the processedResults in a centralized code analytics repository.
       * Only store results for the mainline branches.
       */
      var storeResultBranches = JSON.parse(Jarvis.buildConfigValue('storeResultBranches'));
      if (
        reportResultsToCodeAnalytics === 'true' &&
        restApi.type().name() === 'GitHubRestApi' &&
        storeResultBranches.includes(sourceControlSpec.branch)
      ) {
        // If a top-level customer package exits, store the customization results.
        if (topLevelCustomerPackage) {
          BaseCustomizationAnalyzer.storeCustomizationResults(
            sourceControlSpec,
            trimmedCodeAnalysisResults,
            customizationResults,
            codeAnalysisStepsWithDuration
          );
        } else {
          BaseCodeAnalyzer.storeProcessedResults(
            sourceControlSpec,
            trimmedCodeAnalysisResults,
            codeAnalysisStepsWithDuration
          );
        }
      }
    }

    try {
      // Collect the code analysis results computed in previous steps to be notified on the pull request.
      var report = Jarvis.reportForId(step.jarvisBuild.id + '-code-analysis');

      // Skip code analysis if set in the report.
      if (report.data && report.data.skipCodeAnalysis) {
        return Jarvis.Step.Result.builder().step(step).status(Jarvis.Step.Status.SKIPPED).build();
      }

      function getSourceControlSpec(step) {
        var restApi = Jarvis.sourceControlRestApi();
        var restInst = restApi.restInst;
        var repositoryName = restApi.sourceControlRepoName;
        var organizationName = restApi.organizationName;
        var auth = restInst.auth;
        var url = restInst.url;
        var commitSha = step.jarvisBuild.sha;
        var prUrl = step.jarvisBuild.prUrl || '';
        var packagesPath = step.jarvisBuild.packagesPath;
        var branch = step.jarvisBuild.branch;
        var backupSourceControlTokens = JSON.parse(Jarvis.branchGroupSecretValue('backupSourceControlTokens')) || [];

        return BaseCodeAnalyzer.SourceControlGadget.Spec.make({
          auth: auth,
          url: url,
          commitSha: commitSha,
          restApi: restApi,
          prUrl: prUrl,
          packagesPath: packagesPath,
          branch: branch,
          repositoryName: repositoryName,
          organizationName: organizationName,
          backupSourceControlTokens: backupSourceControlTokens,
        });
      }

      var results = report.updates
        .filter((childReport) => childReport.data.status == 'success')
        .map((childReport) => childReport.data.result);

      /**
       * Jarvis does not support non-string values in build configs in 8.3.3.
       * Parse the value to an integer until this feature is available in 8.4.
       * If parsing fails, set to the default value of 10.
       *
       * TODO: ENGR-19375 - Revert to using integer values in 8.4.
       */
      var maxCodeAnalyzerCommentCount = Jarvis.buildConfigValue('maxCodeAnalyzerCommentCount');
      try {
        maxCodeAnalyzerCommentCount = parseInt(maxCodeAnalyzerCommentCount);
      } catch (e) {
        maxCodeAnalyzerCommentCount = 10;
      }

      var baseBranchResults = step.input.baseBranchResults;
      var codeAnalysisStepsWithDuration = step.input.codeAnalysisStepsWithDuration;
      var sourceControlSpec = getSourceControlSpec(step);
      var spec = BaseCodeAnalyzer.NotifyPullRequestSpec.make({
        sourceControlSpec: sourceControlSpec,
        results: results,
        isCodeAnalysisComplete: step.input.isCodeAnalysisComplete,
        baseBranchResults: baseBranchResults,
        maxCodeAnalyzerCommentCount: maxCodeAnalyzerCommentCount,
      });

      // If the jarvis build doesn't have a PR URL, store the results summary without trying to notify a PR.
      var restApi = Jarvis.sourceControlRestApi();
      var reportResultsToCodeAnalytics = step.input.reportResultsToCodeAnalytics;
      var topLevelCustomerPackage = Jarvis.buildConfigValue('topLevelCustomerPackage');
      var customerPackages = JSON.parse(Jarvis.buildConfigValue('customerPackages'));
      if (!step.jarvisBuild.prUrl) {
        storeCodeAnalysisSummaryReport(
          step,
          restApi,
          sourceControlSpec,
          results,
          codeAnalysisStepsWithDuration,
          reportResultsToCodeAnalytics,
          topLevelCustomerPackage,
          customerPackages
        );
        BaseCodeAnalyzer.notifyNonPullRequestCommit(sourceControlSpec);
      } else {
        var processedResults = BaseCodeAnalyzer.notifyPullRequest(spec);
        storeCodeAnalysisSummaryReport(
          step,
          restApi,
          sourceControlSpec,
          processedResults,
          codeAnalysisStepsWithDuration,
          reportResultsToCodeAnalytics,
          topLevelCustomerPackage,
          customerPackages
        );
      }
    } catch (e) {
      // Update status check to notify of error and transition to a final-state if the code above fails.
      var restApi = Jarvis.sourceControlRestApi();

      /**
       * We need to resolve these in the custom lambda since doing so through logic the in baseCodeAnalyzer
       * would require us to go over the same steps as those that would have failed in the `try` block.
       */
      if (restApi.type().name() === 'GitHubRestApi') {
        restApi.restInst.createCommitStatus(
          restApi.orgWithSrcCtrlRepoName,
          step.jarvisBuild.sha,
          'error',
          BaseCodeAnalyzer.SourceControlGadget.CODE_ANALYZER_COMMIT_STATUS_NAME,
          BaseCodeAnalyzer.SourceControlGadget.CODE_ANALYZER_ERROR_COMMIT_STATUS_MSG
        );
      }

      return Jarvis.Step.Result.builder()
        .step(step)
        .status(Jarvis.Step.Status.NON_FATAL_ERROR)
        .error(e.toString())
        .build();
    }

    return Jarvis.Step.Result.builder().step(step).status(Jarvis.Step.Status.SUCCESS).build();
  },
};
