/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

data = {
  name: 'codeAnalysis',
  value: function (step) {
    var packageName = C3.app().rootPkg;

    // Helper function to store the result of code analysis of the current package.
    function filePkgResultReport(step, packageName, status, errorMessage, result) {
      var pkgCodeAnalysisReport = Jarvis.Report.make({
        id: step.jarvisBuild.id + '-' + packageName + '-code-analysis-result',
        data: {
          packageName: packageName,
          status: status,
          errorMessage: errorMessage,
          result: result,
        },
        parent: step.jarvisBuild.id + '-code-analysis',
      });
      Jarvis.fileReports([pkgCodeAnalysisReport]);
    }

    try {
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

      var sourceControlSpec = getSourceControlSpec(step);

      /**
       * If a `-code-analysis-base-branch` report doesn't exist for this build, get the base branch
       * name of the pull request using APIs defined in the `baseCodeAnalyzer`. We need to retrieve this data
       * in the `codeAnalysis` step since:
       * - the `GitHubPullRequest` platform type does not capture information about the base branch
       * - this is only step before `buildSummary` that runs in the context of `baseCodeAnalyzer`, which is where
       *   we defined the `BaseCodeAnalyzer.GitHubPullRequest` type through which we can capture this information.
       */
      var baseBranchReportId = step.jarvisBuild.id + '-code-analysis-base-branch';
      var baseBranchReport = Jarvis.reportForId(baseBranchReportId);
      if (!baseBranchReport) {
        var sourceControlGadget = BaseCodeAnalyzer.getSourceControlGadget(sourceControlSpec);
        var baseBranch = sourceControlGadget.getBaseBranchName();
        var newBaseBranchReport = Jarvis.Report.make({
          id: baseBranchReportId,
          data: {
            baseBranch: baseBranch,
          },
        });
        Jarvis.fileReports([newBaseBranchReport]);
      }

      var spec = BaseCodeAnalyzer.AnalyzeCodeChangesSpec.make({
        packageName: packageName,
        sourceControlSpec: sourceControlSpec,
      });

      /**
       * Perform code analysis and store results. A 'success' status does not imply there
       * were no code analysis violations - it simply means code analysis was run successfully.
       */
      var result = BaseCodeAnalyzer.analyzeCodeChanges(spec);
      filePkgResultReport(step, packageName, 'success', null, result.toJson());
    } catch (e) {
      /**
       * Jarvis currently incorrectly tags the commit status with "Test Failures" even when
       * non-`testPackage` steps are in the `NON_FATAL_ERROR` status. Since this try block
       * is only entered due to uncaught exceptions in the baseCodeAnalyzer or Jarvis code
       * unrelated to the actual package's changes, we currently skip the step to ensure developers
       * are still able to merge their pull request in.
       */
      filePkgResultReport(step, packageName, 'error', e.toString(), null);
      return Jarvis.Step.Result.builder().step(step).status(Jarvis.Step.Status.SKIPPED).error(e.toString()).build();
    }

    return Jarvis.Step.Result.builder().step(step).status(Jarvis.Step.Status.SUCCESS).build();
  },
};
