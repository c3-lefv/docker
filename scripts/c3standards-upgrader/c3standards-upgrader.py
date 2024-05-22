# Copyright 2009-2024 C3 AI (www.c3.ai). All Rights Reserved.
# This material, including without limitation any software, is the confidential trade secret and proprietary
# information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
# strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
# This material may be covered by one or more patents or pending patent applications.


# pylint: disable=line-too-long, consider-using-f-string, broad-exception-raised, broad-exception-caught
import json
import os
import subprocess
import sys
import re
import requests

GITHUB_TOKEN = str(os.environ["GITHUB_TOKEN"])
GITHUB_CONTEXT = os.environ["GITHUB_CONTEXT"]


def invoke_https_request(url, headers, body):
    """
    Execute a HTTPS request

    Inputs:
    - url: the request endpoint
    - headers: the request headers
    - body: the request body. If empty, a GET request will be invoked.

    Outputs:
    - the JSON response of the request
    """
    if body is None:
        response = requests.get(url=url, headers=headers, timeout=15)
    else:
        response = requests.post(url=url, headers=headers, json=body, timeout=15)
    if response.status_code == 200:
        return response.json()
    raise Exception(f"Request to {url} failed with code of {response.status_code}. {response.content}")


def sh_cwd(command, cwd, print_output=True) -> str:
    """
    Execute a shell command

    Inputs:
    - command: the command to run in the shell
    - print_output: boolean to indicate whether to print the output of the command

    Outputs:
    - the response string of the command
    """
    if not isinstance(command, list):
        command = command.split(" ")

    print(f"\n[Executing shell command]: `{' '.join(command)}` in {cwd}")

    try:
        response = subprocess.check_output(command, stderr=subprocess.STDOUT, cwd=cwd)
        response_str = response.decode("utf-8")

        if print_output:
            print(f"{response_str}")

        return response_str
    except subprocess.CalledProcessError as e:
        print(f"[Exit Code {e.returncode}]:\n {e.output}")
        raise e


def sh(command, print_output=True) -> str:
    """
    Execute a shell command

    Inputs:
    - command: the command to run in the shell
    - print_output: boolean to indicate whether to print the output of the command

    Outputs:
    - the response string of the command
    """
    if not isinstance(command, list):
        command = command.split(" ")

    print(f"\n[Executing shell command]: `{' '.join(command)}`")
    response = subprocess.run(command, capture_output=True, check=False)

    if response.returncode == 0:
        response_str = response.stdout.decode("utf-8")
    else:
        response_str = response.stderr.decode("utf-8")

    if print_output:
        print(f"{response_str}")

    return response_str


def fetch_checkout_pull(branch, cwd=None):
    """
    Checkouts and updates the ref of the provided branch

    Inputs:
    - branch: the branch to checkout

    Outputs:
    - the ref of the head of the provided branch
    """
    if cwd:
        sh_cwd(f"git checkout {branch}", cwd)
        sh_cwd(f"git reset --hard origin/{branch}", cwd)
        sh_cwd(f"git pull origin {branch}", cwd)
        sh_cwd("git status", cwd)
        return sh_cwd("git rev-parse HEAD", cwd)
    else:
        sh(f"git checkout {branch}")
        sh(f"git reset --hard origin/{branch}")
        sh(f"git pull origin {branch}")
        sh("git status")
        return sh("git rev-parse HEAD")


def get_unsuccessful_patch_pull_request_body(source_sha, patch_failures):
    """
    Returns the body to post in the pull request description when the auto-patch was unsuccessful.

    Inputs:
    - source_sha: the SHA from which the diff patch is being merged
    - patch_failures: the list of files patches that failed to be applied automatically

    Outputs:
    - the body of the pull request to be posted
    """
    patch_failures = "\n".join([f"  - `{patch_failure}`" for patch_failure in patch_failures])
    message = [
        "",
        f"We encountered some errors when trying to upgrade c3standards from `{source_sha}` to the latest `master` in your repository.",
        "- Rejected patches",
        f"{patch_failures}",
        "",
        "",
        "Please go through the following steps to resolve the conflicts:",
        "- Checkout this branch to your local machine",
        "- Resolve patching errors manually",
        "   - Look for `.rej` files in this branch",
        "   - These files describe how each of the patches is intended to be applied",
        "- Apply delete patches manually",
        "   - If there are fewer `.rej` files than the list shown above, it means that the upgraded had trouble deleting files that exist in your repo but not in c3standards",
        "   - This usually occurs because of a minor difference in the file contents - a change in the copyright header's year, for instance",
        "   - Delete these files in your repository",
        "- Delete all `.rej` files",
        "- Push your changes to this branch and merge into the target branch",
        "",
    ]
    return "\n".join(message)


def get_successful_patch_pull_request_body(source_sha):
    """
    Returns the body to post in the pull request description when the auto-patch was successful.

    Inputs:
    - source_sha: the SHA from which the diff patch is being merged

    Outputs:
    - the body of the pull request to be posted
    """
    message = [
        "",
        f"We successfully upgraded c3standards from `{source_sha}` to the latest `master` in your repository.",
        "Please review the changes and merge them to your target branch.",
        "",
    ]
    return "\n".join(message)


def graphql_request(query):
    """
    Executes the provided GraphQL query

    Inputs:
    - query: the GraphQL query to execute

    Outputs:
    - the response of the GraphQL query
    """
    headers = {"Authorization": "Bearer " + GITHUB_TOKEN}
    response = invoke_https_request("https://api.github.com/graphql", headers, {"query": query})
    return response


def get_repository_node_id(repo):
    """
    Fetches the repository GraphQL node id

    Inputs:
    - repo: the name of the repo - c3base

    Outputs:
    - the GraphQL node id of the repository
    """
    query = """
    query {{
        repository(owner:"c3-e", name:"{}") {{
            id
        }}
    }}
    """.format(
        repo
    )
    response = graphql_request(query)
    print(response)
    return response["data"]["repository"]["id"]


def create_pull_request(repo, title, head, base, body):
    """
    Creates a pull request using the provided pull request parameters

    Inputs:
    - repo: the name of the repo to post the pull request to
    - title: the title of the pull request
    - head: the branch being merged in
    - base: the base branch to merge into
    - body: the body of the pull request

    Outputs:
    - the response from the pull request query
    """
    repo_node_id = get_repository_node_id(repo)

    print("Creating pull request for:")
    print(f"repo: {repo}")
    print(f"repo_node_id: {repo_node_id}")
    print(f"title: {title}")
    print(f"head: {head}")
    print(f"base: {base}")
    print(f"body:\n{body}")

    mutation = """
    mutation {{
        createPullRequest(input: {{
            repositoryId: "{}",
            baseRefName: "{}",
            title: "{}",
            headRefName: "{}"
            body: "{}"
        }}) {{
            pullRequest {{
                body
                title
            }}
        }}
    }}
    """.format(
        repo_node_id, base, title, head, body
    )
    response = graphql_request(mutation)
    print(f"Create pull request response:\n{response}")
    return response


def read_rcfile(filename):
    """
    Returns the contents of the provided file

    Inputs:
    - filename: the name of the file to read contents from

    Outputs:
    - the response from the pull request query
    """
    if os.path.exists(filename):
        try:
            with open(filename, "r") as file:
                file_contents = file.read()
            return json.loads(file_contents)
        except Exception as e:
            print(e)
            raise e

    return None


def delete_file(filename):
    """
    Deletes the contents of the provided file

    Inputs:
    - filename: the name of the file to delete
    """
    if os.path.exists(filename):
        # Delete the file
        os.remove(filename)
        print(f"{filename} has been deleted successfully.")
        return
    print(f"The file {filename} does not exist.")


def write_file(filename, content):
    """
    Writes the provided contents to the provided file

    Inputs:
    - filename: the name of the file to write the contents to
    - content: the string contents to write
    """
    with open(filename, "w") as file:
        # Write new contents to the file
        file.write(content)
    print("File contents have been overwritten successfully.")


def perform_patch_upgrade(
    repo,
    upgrade_patch_filename,
    current_c3standards_sha,
    latest_c3standards_sha,
    rcfile_contents,
    target_branch,
    always_create_pr,
):
    """
    Given the patch filename, performs the following:
    - Applies the patch
    - Deletes the upgrade patch file
    - Updates the .c3standardsrc file to store the new commit
    - Commits the changes and pushes

    Inputs:
    - repo: the name of the repo in which c3standards in being upgraded
    - upgrade_patch_filename: the file containing the patch information
    - current_c3standards_sha: the current c3standards SHA on which this repository is on
    - latest_c3standards_sha: the latest c3standards SHA
    - rcfile_contents: the rcfile contents to update
    - target_branch: the target branch to which the patches are being applied
    - always_create_pr: boolean to indicate whether the c3standards upgrader should always create a PR to merge to
      `target_branch`. If false, the patched changes are merged automatically into the `target_branch`.
    """
    sh(f"git apply {upgrade_patch_filename}", False)
    delete_file(upgrade_patch_filename)

    if rcfile_contents is not None:
        rcfile_contents["sha"] = latest_c3standards_sha
    else:
        rcfile_contents = {"sha": latest_c3standards_sha}

    write_file(".c3standardsrc", json.dumps(rcfile_contents))

    # If `always_create_pr` is True, create a PR notifying the reviewers of the patch.
    if always_create_pr:
        print(f"Always create PR is configured to {always_create_pr}. Creating PR with successful automatic patch.")
        pull_request_title = "Review and merge automatic patch changes from c3standards"
        pull_request_body = get_successful_patch_pull_request_body(current_c3standards_sha)
        generate_pull_request(repo, target_branch, latest_c3standards_sha, pull_request_title, pull_request_body)
        return

    print(
        f"Always create PR is configured to {always_create_pr}. Pushing successful automatic patch directly into {target_branch}."
    )

    # If false, commit changes to the target branch and push
    sh("git add .")
    sh(
        [
            "git",
            "commit",
            "-m",
            f'"Automated chore: Upgraded c3standards to latest master ({latest_c3standards_sha})"',
            "--no-verify",
            "--no-edit",
        ]
    )
    sh("git push")


def generate_pull_request(repo, target_branch, latest_c3standards_sha, pull_request_title, pull_request_body):
    """
    Function to create a new branch and pull request to merge changes to the `target_branch`

    Inputs:
    - repo: the name of the repo to post the pull request to
    - target_branch: the base branch for the pull request
    - latest_c3standards_sha: the latest c3standards SHA
    - pull_request_title: the title fo the pull request
    - pull_request_body: the body fo the pull request
    """
    pull_request_branch = f"{target_branch}-{latest_c3standards_sha}"

    # If a branch of the same name already exists, delete it and create a new one
    remote_check_response = sh(f"git ls-remote --exit-code --heads origin {pull_request_branch}")
    if len(remote_check_response) > 0:
        sh(f"git branch -D {pull_request_branch}")
        sh(f"git push origin --delete {pull_request_branch}")

    sh(f"git checkout -b {pull_request_branch}")
    sh("git add .")
    sh(
        [
            "git",
            "commit",
            "-m",
            f'"Automated chore: Upgraded c3standards to latest master ({latest_c3standards_sha})"',
            "--no-verify",
            "--no-edit",
        ]
    )
    sh(f"git push --set-upstream origin {pull_request_branch}")

    create_pull_request(
        repo,
        pull_request_title,
        pull_request_branch,
        target_branch,
        pull_request_body,
    )


def perform_partial_patch_upgrade(
    repo,
    upgrade_patch_filename,
    rcfile_contents,
    current_c3standards_sha,
    latest_c3standards_sha,
    patch_failures,
    target_branch,
):
    """
    Given the patch filename, performs the following:
    - Applies the patch with the --reject flag
    - Deletes the upgrade patch file
    - Updates the .c3standardsrc file to store the new commit
    - Create a new branch with failures when attempting to patch
    - Commits the changes and pushes
    - Creates a pull request for a human reviewer to manually merge the changes

    Inputs:
    - repo: the name of the repo in which c3standards in being upgraded
    - upgrade_patch_filename: the file containing the patch information
    - current_c3standards_sha: the current c3standards SHA on which this repository is on
    - latest_c3standards_sha: the latest c3standards SHA
    - patch_failures: the files on which applying the patch failed
    - target_branch: the target branch to which the patches are being applied
    """
    sh(f"git apply --reject {upgrade_patch_filename}", False)
    delete_file(upgrade_patch_filename)

    if rcfile_contents is not None:
        rcfile_contents["sha"] = latest_c3standards_sha
    else:
        rcfile_contents = {"sha": latest_c3standards_sha}

    write_file(".c3standardsrc", json.dumps(rcfile_contents))

    pull_request_title = "Resolve automatic patch changes from c3standards"
    pull_request_body = get_unsuccessful_patch_pull_request_body(current_c3standards_sha, patch_failures)
    generate_pull_request(repo, target_branch, latest_c3standards_sha, pull_request_title, pull_request_body)


def get_patch_failures(response):
    """
    Extract the list of file names where the patch failed

    Inputs:
    - response: the response from which to get the list of patch failures

    Outputs:
    - the list of patch failures
    """
    pattern = r"error: patch failed: (\S+)"
    return re.findall(pattern, response)


def remove_included_files(response):
    """
    If applying patches for a file that already exists in the repository, it likely
    means it is stale and needs to be overridden by the version in c3standards.

    Inputs:
    - response: the response from which to get the list of patch failures
    """
    # Define a regular expression pattern to match lines containing "already exists in working directory"
    pattern = r"error: (.+?): already exists in working directory"

    # Find all matches in the error messages
    matches = re.findall(pattern, response)

    # Print the extracted file names
    for match in matches:
        delete_file(match)


def check_can_auto_apply_patch(upgrade_patch_filename):
    """
    Checks if the patch can be applied automatically. If not, also returns the list of files
    for which auto-applying the patch is not possible.

    Inputs:
    - upgrade_patch_filename: the file containing the patch information

    Outputs:
    - boolean to indicate whether the patch can be auto-applied
    - the list of patch failures, if any
    """
    sh(f"git apply --stat {upgrade_patch_filename}")
    apply_patch_check_response = sh(f"git apply --check {upgrade_patch_filename}", False)

    print(f"Check returned: {apply_patch_check_response}")

    error_count = apply_patch_check_response.count("error:")
    if error_count > 0:
        print(f"Cannot auto-apply patch. Found {error_count} errors!")
        remove_included_files(apply_patch_check_response)
        patch_failures = get_patch_failures(apply_patch_check_response)
        return False, patch_failures

    print(f"Can auto-apply patch!")
    return True, None


def upgrade_c3standards(repo, target_branch, always_create_pr, workspace):
    """
    Performs the following operations:

    - Check difference between .c3standardsrc commit and c3standards/master
      - if no changes, return
    - If changes, check if patch can be applied directly
      - Push changes to target branch
    - If patch cannot be applied directly
      - Run with the `--reject` flag, create a pull request with the patches that failed and assign to code owners

    Inputs:
    - repo: the repo to which to auto-apply the patches
    - target_branch: the target branch onto which to apply the patches
    - always_create_pr: boolean to indicate whether the c3standards upgrader should always create a PR to merge to
      `target_branch`. If false, the patched changes are merged automatically into the `target_branch`.
    - workspace: the workspace path
    """
    fetch_checkout_pull(target_branch)
    fetch_checkout_pull("master", f"{workspace}/c3standards")

    rcfile_contents = read_rcfile(".c3standardsrc")
    current_c3standards_sha = rcfile_contents["sha"] if rcfile_contents else None
    latest_c3standards_sha = sh_cwd("git rev-parse master", f"{workspace}/c3standards")
    latest_c3standards_sha = latest_c3standards_sha.strip()

    # If there have been no new changes since the current commit, return
    if current_c3standards_sha == latest_c3standards_sha:
        print(f"No changes since last upgrade to c3standards sha: {current_c3standards_sha}")
        return

    if not current_c3standards_sha:
        current_c3standards_sha_str = sh_cwd("git rev-list --max-parents=0 master", f"{workspace}/c3standards", False)
        current_c3standards_sha = current_c3standards_sha_str.strip()
        print(
            f"No c3standards sha found in the rcfile. Attempting to patch all changes from {current_c3standards_sha} to {current_c3standards_sha}"
        )
    else:
        print(f"Attempting to upgrade from c3standards sha {current_c3standards_sha} to {latest_c3standards_sha}")

    upgrade_patch_filename = f"c3standards.upgrade.{latest_c3standards_sha}".strip()
    diff_patch = sh_cwd(
        f"git diff {current_c3standards_sha}..{latest_c3standards_sha}",
        f"{workspace}/c3standards",
        False,
    )

    write_file(upgrade_patch_filename, diff_patch)

    can_auto_apply_patch, patch_failures = check_can_auto_apply_patch(upgrade_patch_filename)
    if can_auto_apply_patch:
        print(f"Proceeding with auto-applying patch {upgrade_patch_filename}")
        perform_patch_upgrade(
            repo,
            upgrade_patch_filename,
            current_c3standards_sha,
            latest_c3standards_sha,
            rcfile_contents,
            target_branch,
            always_create_pr,
        )
        return

    print(f"Performing patch upgrade for {upgrade_patch_filename}")
    perform_partial_patch_upgrade(
        repo,
        upgrade_patch_filename,
        rcfile_contents,
        current_c3standards_sha,
        latest_c3standards_sha,
        patch_failures,
        target_branch,
    )


if __name__ == "__main__":
    github_context = json.loads(GITHUB_CONTEXT)
    target_branch = sys.argv[1]
    always_create_pr = sys.argv[2]
    workspace = sys.argv[3]

    # The boolean values configured in `c3standards-upgrader.yml` are converted to a string value when passed into
    # the Python script. We infer a truthy value if the string is configured to be "true" in yml.
    always_create_pr = always_create_pr == "true"

    upgrade_c3standards(github_context["event"]["repository"]["name"], target_branch, always_create_pr, workspace)
