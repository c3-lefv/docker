/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

data = {
  name: 'noCodeAnalysisAlert',
  value: function (step) {
    // Get error message to notify user of packages that require a dependency to be added to `baseToolkit`.
    function getErrorMessage(noCodeAnalysisDepPkgs) {
      var noCodeAnalysisMessage =
        'The following packages that were built for this commit were not able to run code analysis:';
      var noCodeAnalysisDepPkgsStr = noCodeAnalysisDepPkgs.map((pkgName) => '- ' + pkgName).toString('\n');
      var noCodeAnalysisInstructions =
        'To benefit from having your PR being reviewed by the C3 AI Code Analyzer, simply add an upstream \n' +
        'dependency to the `baseToolkit` package from c3base for each of these packages.';
      var lines = [noCodeAnalysisMessage, noCodeAnalysisDepPkgsStr, '', noCodeAnalysisInstructions];

      return lines.join('\n');
    }

    try {
      var noCodeAnalysisDepPkgs = step.input.noCodeAnalysisDepPkgs;

      // This condition should never evaluate to true but has been added in as a failsafe.
      if (!noCodeAnalysisDepPkgs || !noCodeAnalysisDepPkgs.length) {
        return Jarvis.Step.Result.builder()
          .step(step)
          .status(Jarvis.Step.Status.SKIPPED)
          .error('Skipping step since no packages with missing code analysis dependencies were found.')
          .build();
      }

      // Post a commit status directing the user to navigate to this step's logs in the Jarvis UI to see the error.
      var commitStatusMessage =
        'Could not complete code analysis. Please see details of the noCodeAnalysisAlert step for more information.';
      var restApi = Jarvis.sourceControlRestApi();
      if (restApi.type().name() === 'GitHubRestApi') {
        restApi.restInst.createCommitStatus(
          restApi.orgWithSrcCtrlRepoName,
          step.jarvisBuild.sha,
          'error',
          'C3 AI Code Analyzer',
          commitStatusMessage
        );
      }

      // Fail with a non-fatal error to ensure other steps complete.
      var jarvisStepErrorMessage = getErrorMessage(noCodeAnalysisDepPkgs);
      return Jarvis.Step.Result.builder()
        .step(step)
        .status(Jarvis.Step.Status.NON_FATAL_ERROR)
        .error(jarvisStepErrorMessage)
        .build();
    } catch (e) {
      /**
       * Jarvis currently incorrectly tags the commit status with "Test Failures" even when
       * non-`testPackage` steps are in the `NON_FATAL_ERROR` status. Since this try block
       * is only entered due to uncaught exceptions in the baseCodeAnalyzer or Jarvis code
       * unrelated to the actual package's changes, we currently skip the step to ensure developers
       * are still able to merge their pull request in.
       */
      return Jarvis.Step.Result.builder().step(step).status(Jarvis.Step.Status.SKIPPED).error(e.toString()).build();
    }
  },
};
