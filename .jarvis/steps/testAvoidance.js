/*
 * Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

data = {
  name: 'testAvoidance',
  hookStep: 'stashRepo',
  hookStrategy: 'blocking',
  value: function (step) {
    /**
     * Traverses the upstream package dependencies until the specified depth.
     * @param packages
     *            The array of downstream packages to start the upstream traversal.
     * @param pkgDecls
     *            The array of package declaration fields including dependencies.
     * @param depth
     *           The depth (number of tiers) to traverse. If not specified, or <= -1, all tiers will be traversed.
     * @return an array of the affected package names.
     */
    function upstreamDependencies(packages, pkgDecls, depth) {
      if (depth == 0) {
        return packages;
      }

      var upstreamPackages = packages;
      var currentTier = Array.from(packages);
      var currentDepth = 0;
      do {
        var nextTier = [];
        pkgDecls.forEach(function (pkgDecl) {
          var dependencies = pkgDecl.dependencies;
          var pkgName = pkgDecl.name;
          currentTier.forEach(function (cur) {
            if (
              dependencies &&
              dependencies.indexOf(cur) >= 0 &&
              nextTier.indexOf(pkgName) < 0 &&
              upstreamPackages.indexOf(pkgName) < 0 &&
              currentTier.indexOf(pkgName) < 0
            ) {
              nextTier.push(pkgName);
            }
          });
        });

        currentTier = nextTier;
        currentDepth++;
        upstreamPackages = upstreamPackages.concat(currentTier);
      } while ((depth <= -1 || currentDepth < depth) && nextTier.length > 0);

      return upstreamPackages;
    }

    var jarvisBuild = step.jarvisBuild;

    // Only enable test avoidance for feature branches
    if (jarvisBuild.branch.includes('feature/') || jarvisBuild.branch.includes('task/')) {
      var restApi = Jarvis.sourceControlRestApi();
      const modifiedPackages = new Set();

      // Test avoidance is only possible with GitHub currently
      if (restApi.type().name() === 'GitHubRestApi') {
        var gitHub = restApi.restInst;

        // Determine the branch to compare to (default will be "develop")
        var baseBranch = 'develop';
        var branchGroup = jarvisBuild.branchGroups && jarvisBuild.branchGroups[0];
        if (branchGroup) {
          baseBranch = branchGroup.baseBranch;
        }

        var compareResult = gitHub.compare(restApi.orgWithSrcCtrlRepoName, baseBranch, jarvisBuild.sha);
        var repoDir = jarvisBuild.packagesPath;

        // The comparison result will only show up to 300 files so test all packages if we reach this limit
        var fileLimit = 300;

        // Using the comparison result, collect the names of packages with modified files
        if (compareResult.files.length < fileLimit) {
          compareResult.files.each(function (file) {
            var filename = file.filename;
            if (filename.indexOf(repoDir) === 0) {
              var path = filename.replace(repoDir + '/', '');
              if (path.indexOf('/') > -1) {
                modifiedPackages.add(path.split('/').shift());
              }
            }
          });
        }
      }

      if (modifiedPackages.size > 0) {
        // Get all Pkg.Decl objects from repository
        var pkgPaths = JarvisExecutor.Helper.SourceControlManager.pkgPaths(step);
        var pkgDecls = Array.from(
          pkgPaths.map((pkgPath) => Pkg.Decl.fromJsonString(File.fromString(pkgPath).readString()))
        );

        // Find all packages that depend on the modified packages
        var packages = Array.from(modifiedPackages);

        // Set the packagesToInclude config value so that only affected packages will be built and tested
        var affectedPackages = upstreamDependencies(packages, pkgDecls, -1);

        // Set the packagesToInclude config value so that only affected packages will be built and tested
        Jarvis.setBuildConfigValue('packagesToInclude', JSON.stringify(affectedPackages));
      }
    }

    return Jarvis.Step.Result.builder().step(step).status(Jarvis.Step.Status.SUCCESS).build();
  },
};
