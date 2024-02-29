# GitHub Adapter CLI Tool

## Overview

The GitHub Adapter CLI Tool simplifies GitHub repository management by providing a command-line interface for common tasks such as fetching repository information, managing files, and handling branches. This tool is ideal for automating GitHub interactions in scripts or development workflows.

## Installation

To get started, clone the repository and build the CLI tool:

```bash
git clone [https://gith/github-adapter.git](https://github.com/bclonan/go-save-plugin.git)
cd github-adapter
go build -o githubadaptercli ./cmd/githubadaptercli
```

## Configuration

Before using the tool, you must generate a GitHub access token with the appropriate permissions for the operations you intend to perform (e.g., repo access for repository modifications). Store this token securely and use it with the `--access-token` parameter.

## Usage

The GitHub Adapter CLI supports several operations. Below are examples of how to use each command.

### Fetching Repository Information

Retrieve detailed information about a repository:

```bash
./githubadaptercli get-repo-info --access-token <token> --owner <owner> --repo <repo>
```

### Deleting a File

Delete a specific file from a repository:

```bash
./githubadaptercli delete-file --access-token <token> --owner <owner> --repo <repo> --path <path/to/file> --message "Commit message for deletion"
```

### Creating a Branch

Create a new branch based on an existing base branch:

```bash
./githubadaptercli create-branch --access-token <token> --owner <owner> --repo <repo> --branch-name <new-branch> --base-branch <existing-branch>
```

### Saving a File

To save (or update) a file in a repository, including CSV files:

```bash
./githubadaptercli save-file --access-token <token> --owner <owner> --repo <repo> --path <path/to/file.csv> --message "Commit message" --content "name,age\nJohn Doe,30"
```

**Note:** For binary files or files with complex content, ensure your content is appropriately encoded (e.g., base64) before passing it to the `--content` parameter.

### Watching a File

To watch a file for changes : 

```bash
./githubadaptercli watch-file --access-token <token> --owner <owner> --repo <repo> --watch-path <local/path/to/watched/file.csv> --repo-path <path/in/repo/file.csv> --message "Commit message"
```

### Using the File Watch Adapter

The GitHub Adapter CLI Tool now includes the ability to watch a specified file for changes and automatically update the file in the specified GitHub repository when changes are detected. This functionality is ideal for real-time syncing of changes without manual intervention.

#### Setting Up File Watching

To set up file watching, you need to specify the file path to watch, along with the usual parameters for saving a file (repository owner, repository name, file path within the repository, etc.). Here's how to use this feature:

```bash
./githubadaptercli watch-file --access-token <token> --owner <owner> --repo <repo> --watch-path <local/path/to/watched/file.csv> --repo-path <path/in/repo/file.csv> --message "Commit message"
```

- `--watch-path` specifies the local file path to watch for changes.
- `--repo-path` specifies the path within the GitHub repository where the file should be saved or updated.
- Other parameters (`--access-token`, `--owner`, `--repo`, and `--message`) function as described in previous sections.

#### Example Bash Script for File Watching

If you prefer to set up file watching through a bash script that utilizes the GitHub Adapter CLI for continuous synchronization, you could structure it as follows:

```bash
#!/bin/bash

# Configuration
TOKEN="your_github_access_token"
OWNER="repo_owner"
REPO="repo_name"
WATCH_PATH="local/path/to/watched/file.csv"
REPO_PATH="path/in/repo/file.csv"
COMMIT_MESSAGE="Automatically update file"

# Start watching the file and automatically update GitHub repository on change
./githubadaptercli watch-file --access-token $TOKEN --owner $OWNER --repo $REPO --watch-path $WATCH_PATH --repo-path $REPO_PATH --message "$COMMIT_MESSAGE"
```

Make this script executable with `chmod +x` and run it to start watching for changes.


## Advanced Usage: Saving a CSV File to a Repository

To use this tool as a utility for saving a CSV file to a target GitHub repository, you can either directly pass the CSV content via the `--content` parameter as shown above or first encode a larger CSV file's content.

1. **Prepare the CSV Content**: Ensure your CSV content is ready. For larger files, you might want to read the content into a variable and encode it if necessary.

2. **Execute the Save File Command**: Use the `save-file` command with the appropriate parameters. For large or complex files, consider scripting the file reading and encoding process before invoking the command.

### Example Script for Saving a CSV

Here's a simple bash script example that reads a CSV file, encodes its content, and uses the CLI tool to save it to GitHub:

```bash
#!/bin/bash

# Replace these variables with your actual values
TOKEN="your_github_access_token"
OWNER="repo_owner"
REPO="repo_name"
FILE_PATH="path/to/your/file.csv"
COMMIT_MESSAGE="Update CSV file"
CSV_CONTENT=$(cat yourfile.csv | base64)

./githubadaptercli save-file --access-token $TOKEN --owner $OWNER --repo $REPO --path $FILE_PATH --message "$COMMIT_MESSAGE" --content "$CSV_CONTENT"
```

## Advanced Usage: Automatically Saving Changes to a Repository

For scenarios where you want to automatically save changes to a file (e.g., a CSV file) to your GitHub repository whenever it is modified, you can use a file watcher in combination with the GitHub Adapter CLI Tool. This section provides a basic example using a simple bash script and `inotifywait`, a tool for filesystem monitoring that triggers commands upon file events.

### Setting Up Automatic File Watching and Saving

This setup requires `inotify-tools` on Linux. If you're using macOS, you can achieve similar functionality with `fswatch`.

#### 1. Install `inotify-tools`:

On Ubuntu/Debian systems, install `inotify-tools` with:

```bash
sudo apt-get install inotify-tools
```

#### 2. Create a Bash Script to Watch and Save the File:

Create a script named `watch_and_save.sh`:

```bash
#!/bin/bash

# Configuration variables
TOKEN="your_github_access_token"
OWNER="repo_owner"
REPO="repo_name"
WATCHED_FILE="path/to/your/watched_file.csv"
FILE_PATH="path/in/repo/watched_file.csv"
COMMIT_MESSAGE="Automatically update file"

# Watch for changes and upload to GitHub
while inotifywait -e close_write "$WATCHED_FILE"; do
    CSV_CONTENT=$(cat "$WATCHED_FILE" | base64)
    ./githubadaptercli save-file --access-token $TOKEN --owner $OWNER --repo $REPO --path $FILE_PATH --message "$COMMIT_MESSAGE" --content "$CSV_CONTENT"
    echo "Changes saved to GitHub."
done
```

Make sure to adjust `TOKEN`, `OWNER`, `REPO`, `WATCHED_FILE`, and `FILE_PATH` to match your configuration.

#### 3. Run the Script:

Make the script executable and start it:

```bash
chmod +x watch_and_save.sh
./watch_and_save.sh
```

The script will monitor the specified file for any changes and automatically upload the new content to your GitHub repository every time the file is saved.

### Chaining Commands for Advanced Workflows

In some workflows, you might want to perform additional actions upon detecting file changes, such as running tests, compiling code, or deploying updates. You can extend the `watch_and_save.sh` script with custom logic to chain these commands.

For example, after saving the file to GitHub, you might want to trigger a CI/CD pipeline:

```bash
# After saving changes to GitHub
curl -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github.v3+json" \
     https://api.github.com/repos/$OWNER/$REPO/dispatches \
     -d '{"event_type": "update-event"}'
```




**Note:** This script assumes you're encoding the CSV content in base64 to handle multiline content. Adjust the script as needed based on your file's content and size.

## Contributing

Contributions to the GitHub Adapter CLI are welcome! Please feel free to fork the repository, make your changes, and submit a pull request.