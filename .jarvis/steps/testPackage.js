/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

data = {
  name: 'testPackage',
  value: function (step) {
    /**
     * When code coverage is enabled, the `testPackage` step mutates the input to place the
     * instrumented artifact in the `rootPkgArtifact` input parameter. We pluck out the uninstrumented
     * artifact before calling the testPackage function to ensure we're always using the uninstrumented artifact.
     */
    var uninstrumentedArtifact = JarvisExecutor.Helper.ArtifactManager.artifactFor(step);
    var packageName = JarvisExecutor.Helper.stepInputTextFor(step, 'pkgName');

    // This custom step will override the testPackage step. First, we need to run the tests as usual.
    var result = JarvisExecutor.Helper.testPackage(step);

    /**
     * Helper function to store the result of code analysis of the current package in case it's being skipped
     * or if there's an error while instantiating the codeAnalysis step.
     */
    function filePkgResultReport(step, packageName, status, errorMessage) {
      var pkgCodeAnalysisReport = Jarvis.Report.make({
        id: step.jarvisBuild.id + '-' + packageName + '-code-analysis-result',
        data: {
          packageName: packageName,
          status: status,
          errorMessage: errorMessage,
        },
        parent: step.jarvisBuild.id + '-code-analysis',
      });
      Jarvis.fileReports([pkgCodeAnalysisReport]);
    }

    try {
      /**
       * If this package depends on the baseCodeAnalyzer package, we store the reference to the
       * artifact in the build's Jarvis.Report so that it can be used to spin up an app in the
       * notifyPullRequest step.
       */
      var baseCodeAnalyzerArtifactReportId = step.jarvisBuild.id + '-code-analysis';
      var baseCodeAnalyzerArtifactReport = Jarvis.reportForId(baseCodeAnalyzerArtifactReportId);

      /**
       * Function to determine if code analysis should be step. Should return an object containing
       * the `skipCodeAnalysis` and the optional `skipCodeAnalysisReason` fields.
       */
      function getCodeAnalysisCheckInfo(step) {
        /**
         * By default, code analysis is only run on Jarvis builds that have an associated PRs. However,
         * the stable/mainline branches for repositories will have usually never have an associated PR but
         * should still run code analysis.
         *
         * The branches listed below will be treated as mandatory for code analysis and jarvis builds on
         * all commits will generate a code analysis report.
         *
         * TODO: ENGR-19026 - Add mandatoryAnalysisBranches to Jarvis branch config.
         */
        var mandatoryAnalysisBranches = ['develop', 'release', 'master'];

        /**
         * Skip code analysis if the commit doesn't have a pull request, unless it is one of
         * the protected branches - in which case we always run code analysis.
         */
        if (!step.jarvisBuild.prUrl && !mandatoryAnalysisBranches.includes(step.jarvisBuild.branch)) {
          return {
            skipCodeAnalysis: true,
          };
        }

        // Return false by default.
        return {
          skipCodeAnalysis: false,
        };
      }

      // Determine if code analysis should be skipped.
      var codeAnalysisCheckInfo = getCodeAnalysisCheckInfo(step);

      /**
       * If a report with the '<jarvisBuild.id>-code-analysis' id doesn't already exists, create one.
       * If it exists and the `topLevelCustomerPackage` build configuration is defined, we override the report to
       * enable the `codeAnalysisSummary` step to be started with this package so that customization analysis can
       * be performed.
       */
      var topLevelCustomerPackage = Jarvis.buildConfigValue('topLevelCustomerPackage');
      if (!baseCodeAnalyzerArtifactReport || topLevelCustomerPackage === packageName) {
        var buildCodeAnalysisReport = Jarvis.Report.make({
          id: baseCodeAnalyzerArtifactReportId,
          data: {
            rootPkgArtifact: uninstrumentedArtifact,
            skipCodeAnalysis: codeAnalysisCheckInfo.skipCodeAnalysis,
          },
        });
        Jarvis.fileReports([buildCodeAnalysisReport]);
      }

      var targetApp = JarvisExecutor.Helper.AppManager.startApp(step);
      var baseCodeAnalyzerType = targetApp.callJson('C3', 'type', null, ['BaseCodeAnalysis', false]);

      // We only perform code analysis if the current package depends on but is not the baseCodeAnalyzer package.
      if (!baseCodeAnalyzerType) {
        filePkgResultReport(
          step,
          packageName,
          'no-dependency',
          'Code analysis cannot be run on this package since it has no upstream dependency on baseToolkit.'
        );
        return result;
      }

      // Do not add code analysis step if codeAnalysisCheckInfo() determines it should be skipped.
      if (codeAnalysisCheckInfo.skipCodeAnalysis) {
        filePkgResultReport(step, packageName, 'skipped');
        return result;
      }

      // Add a new step to the pipeline with all the necessary input.
      var semanticVersion = uninstrumentedArtifact.semanticVersion;
      var codeAnalysisStep = Jarvis.Step.builder()
        .id(step.id.replace('testPackage', 'codeAnalysis'))
        .name('codeAnalysis')
        .input(step.input.with('customPkgName', packageName).with('customPkgVersion', semanticVersion))
        .next(step.next)
        .jarvisBuild(step.jarvisBuild)
        .maxRetries(3)
        .build();
      Jarvis.addSteps([codeAnalysisStep]);
    } catch (e) {
      var errorMessage =
        'Failed to instantiate code analysis step for ' +
        packageName +
        ' because of the following error.\n' +
        e.toString();

      /**
       * Store the error message in the code analysis report for this package and
       * create a new Jarvis step to surface the instantiation error on the Jarvis UI.
       */
      filePkgResultReport(step, packageName, 'error', errorMessage);

      var codeAnalysisInstErrorStep = Jarvis.Step.builder()
        .id(step.id.replace('testPackage', 'codeAnalysisInstError'))
        .name('codeAnalysisInstError')
        .input(step.input.with('errorMessage', errorMessage))
        .next(step.next)
        .jarvisBuild(step.jarvisBuild)
        .maxRetries(3)
        .build();
      Jarvis.addSteps([codeAnalysisInstErrorStep]);
    }

    // Return the result of the actual testPackage step.
    return result;
  },
};
