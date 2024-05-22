/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

data = {
  name: 'codeAnalysisInstError',
  value: function (step) {
    /**
     * This custom step is triggered if there is an error while trying to instantiate the `codeAnalysis` step
     * in the `testPackage` step for a package. We triggered a new build to ensure `testPackage` errors, if any,
     * are not inadvertently overridden.
     */
    var errorMessage = step.input.errorMessage;
    return Jarvis.Step.Result.builder()
      .step(step)
      .status(Jarvis.Step.Status.NON_FATAL_ERROR)
      .error(errorMessage)
      .build();
  },
};
