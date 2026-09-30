# Publish the three app forks

The publishing script creates these repositories under **bclonan**, retaining each upstream repository's history and license:

| App | MIT upstream | New fork |
| --- | --- | --- |
| CSV Rescue | [mholt/PapaParse](https://github.com/mholt/PapaParse) | bclonan/csv-rescue-chatgpt |
| Pocket PDF | [Hopding/pdf-lib](https://github.com/Hopding/pdf-lib) | bclonan/pocket-pdf-chatgpt |
| Instant Slides | [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS) | bclonan/instant-slides-chatgpt |

Each app lives in `chatgpt-app/` on a new branch named `chatgpt-app`. The script does not change the default branch or create pull requests.

## Requirements

- Node.js 22 or newer and npm on Linux, macOS, or Windows Subsystem for Linux (WSL).
- Git and the [GitHub CLI](https://cli.github.com/).
- GitHub CLI authentication on github.com as **bclonan**, with permission to create and push repositories.
- Network access to npm and GitHub.

Run `gh auth login --hostname github.com` if needed. The publisher uses gh's credential helper without putting tokens into command arguments, files, or repository URLs.

## Validate first

From the bundle repository root:

```sh
node productivity-lab/scripts/publish-forks.mjs
```

The default is a dry run. It assembles all three standalone apps in a fresh temporary directory, copies their shared runtime into `src/`, installs dependencies with `npm install --ignore-scripts`, and runs each app's tests. It prints the planned fork names and retains the temporary directory for inspection. No GitHub repository is created or changed.

This validation requires npm network access and uses temporary disk space. Any npm or test failure stops the script. The runtime and app tests have to pass in your environment; source review alone is not a test result.

## Publish

```sh
node productivity-lab/scripts/publish-forks.mjs --publish
```

Publish mode assembles and tests every app again before making any repository changes. It then verifies the authenticated account, MIT license metadata, destination names, and expected fork parents. It creates real GitHub forks, makes a full Git clone of each, adds the standalone app under `chatgpt-app/`, and commits/pushes only the new `chatgpt-app` branch. Generated lockfiles are included. No force push is used.

Existing repositories are accepted only when they are confirmed forks of the specified direct parent and the app branch is absent. Existing app branches cause the script to stop. Branch checks are repeated immediately before each push; GitHub operations can still fail if another process changes the repository concurrently. Avoid running multiple publishers at once.

The script never deletes a repository or an existing local directory. It keeps its own temporary clones and prints each successful app URL. If publishing stops partway through, already created forks or pushed branches remain in place. Existing forks without the app branch can be resumed; a branch already published must be reviewed manually before rerunning.

## Start a published app

Open its printed branch URL, or clone and select its branch:

```sh
gh repo clone bclonan/csv-rescue-chatgpt
cd csv-rescue-chatgpt
git switch chatgpt-app
cd chatgpt-app
npm ci --ignore-scripts
npm test
npm start
```

For the other apps, substitute `pocket-pdf-chatgpt` or `instant-slides-chatgpt`. Follow each app README for environment variables, hosting, and its MCP endpoint.

Creating a fork does not deploy a server or submit an app to the ChatGPT directory. Connect a hosted HTTPS MCP endpoint in ChatGPT developer mode to try the app, subject to your plan and workspace settings. Public directory submission is a separate review process.

## License and authorship

The fork keeps upstream source and license files intact. App code and notices are added in a separate directory. Keep the upstream attribution and MIT license notices when distributing either codebase; your fork is an adaptation, not a claim of authorship over the original library.
