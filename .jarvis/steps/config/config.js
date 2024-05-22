/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// TODO: ENGR-19375 - Update jarvis branch config values to use the primitive types instead of strings.

data = {
  configValues: {
    /**
     * By default, the code analyzer posts a maximum of 10 inline comments on a pull request.
     * The maximum comment count can be configured to be any number greater than 0.
     */
    maxCodeAnalyzerCommentCount: '10',

    /**
     * By default, the code analyzer does not push the results of the code analysis to a centralized repository
     * for code analytics. Setting this value to true pushes the changes to a centralized repository for
     * observability.
     *
     * If this configuration is turned on for customer repositories, the `topLevelCustomerPackage` and the
     * `customerPackages` configurations HAVE to be provided.
     */
    reportResultsToCodeAnalytics: 'false',

    /**
     * By default, customization analysis is not performed in Jarvis builds. Customer repositories in the c3-e
     * organization can send encrypted usage analytics to the centralized code analytics repository for analysis
     * that could help improve the base product.
     *
     * Set this configuration to point to the name of the top-level package in the customer repository that is
     * ultimately deployed to prod. If this configuration is non-null, please ensure the `customerPackages`
     * configuration is configured appropriately and `reportResultsToCodeAnalytics` is set to true.
     */
    topLevelCustomerPackage: null,

    /**
     * By default, customization analysis is not performed in Jarvis builds. Customer repositories in the c3-e
     * organization can send encrypted usage analytics to the centralized code analytics repository for analysis
     * that could help improve the base product.
     *
     * Set this configuration to point to the list of all packages defined in customer repositories. This should
     * include the `topLevelCustomerPackage` and any packages that might have been defined in other customer
     * repositories on which this repository belongs. If this configuration is non-null, please ensure the
     * `topLevelCustomerPackage` configuration is configured appropriately and `reportResultsToCodeAnalytics`
     * is set to true.
     */
    customerPackages: JSON.stringify([]),

    /**
     * The code analyzer stores the code analysis results in a centralized code analytics repository to enable
     * stakeholders to monitor and audit the health of their code. The configuration defaults to point to
     * mainline branches.
     *
     * Modify this list to add other relevant mainline branches for your repository (support branches, for instance).
     */
    storeResultBranches: JSON.stringify(['develop', 'release', 'master']),

    /**
     * By default, in 8.3, the app being tested is restarted on failure. This causes test coverage
     * results for tools like Canonical Tester to be lost. To prevent this, set this value to false.
     * In 8.4, this value is set to false by default.
     */
    restartAppOnFailure: false,
  },
  secretValues: {
    /**
     * By default, the code analyzer uses the token of the user who created the Jarvis branch configuration
     * in Studio. An increased usage of this token could trigger secondary rate limits and it is suggested
     * that at least one backup token be provided to allow the C3 AI Code Analyzer to perform automated
     * reviews without interruptions.
     *
     * IMPORTANT: Please do not set the value here. Run the following in your jarvisservice application to
     * set your tokens:
     * ```
     * Jarvis.setBranchGroupSecretValue(
     *  '<your_branchGroupId>', 'backupSourceControlTokens', JSON.stringify(['<your_tokens>'])
     * )
     * ```
     */
    backupSourceControlTokens: JSON.stringify([]),
  },
};
