package main

import (
	"flag"
	"fmt"
	"github-adapter/pkg/githubadapter"
	"log"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: githubadaptercli <command> [arguments]")
		os.Exit(1)
	}

	command := os.Args[1]
	args := os.Args[2:]

	switch command {
	case "delete-file":
		handleDeleteFile(args)
	case "create-branch":
		handleCreateBranch(args)
	case "save-file":
		handleSaveFile(args)
	case "watch-file":
		handleWatchFile(args)
	default:
		fmt.Printf("Unknown command: %s\n", command)
		os.Exit(1)
	}
}

func handleDeleteFile(args []string) {
	// Set up flags for the delete-file command
	cmd := flag.NewFlagSet("delete-file", flag.ExitOnError)
	accessToken := cmd.String("access-token", "", "GitHub access token")
	owner := cmd.String("owner", "", "Repository owner")
	repo := cmd.String("repo", "", "Repository name")
	path := cmd.String("path", "", "File path")
	message := cmd.String("message", "", "Commit message")
	cmd.Parse(args)

	// Implement the deletion logic using the GitHubService
	service := githubadapter.NewGitHubService(*accessToken)
	err := service.DeleteFile(*owner, *repo, *path, *message)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error deleting file: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("File deleted successfully")
}

// Implement handleCreateBranch and handleSaveFile similarly, parsing args and calling the respective service methods.
func handleCreateBranch(args []string) {
	// Set up flags for the create-branch command
	cmd := flag.NewFlagSet("create-branch", flag.ExitOnError)
	accessToken := cmd.String("access-token", "", "GitHub access token")
	owner := cmd.String("owner", "", "Repository owner")
	repo := cmd.String("repo", "", "Repository name")
	branchName := cmd.String("branch-name", "", "New branch name")
	baseBranch := cmd.String("base-branch", "", "Base branch name")
	cmd.Parse(args)

	// Implement the branch creation logic using the GitHubService
	service := githubadapter.NewGitHubService(*accessToken)
	err := service.CreateBranch(*owner, *repo, *branchName, *baseBranch)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating branch: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Branch created successfully")
}

func handleSaveFile(args []string) {
	// Set up flags for the save-file command
	cmd := flag.NewFlagSet("save-file", flag.ExitOnError)
	accessToken := cmd.String("access-token", "", "GitHub access token")
	owner := cmd.String("owner", "", "Repository owner")
	repo := cmd.String("repo", "", "Repository name")
	path := cmd.String("path", "", "File path")
	message := cmd.String("message", "", "Commit message")
	content := cmd.String("content", "", "File content")
	cmd.Parse(args)

	// Implement the file saving logic using the GitHubService
	service := githubadapter.NewGitHubService(*accessToken)
	err := service.SaveFileToRepo(*owner, *repo, *path, *message, *content)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error saving file: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("File saved successfully")
}

// New handler for watch-file command
func handleWatchFile(args []string) {
	cmd := flag.NewFlagSet("watch-file", flag.ExitOnError)
	accessToken := cmd.String("access-token", "", "GitHub access token")
	owner := cmd.String("owner", "", "Repository owner")
	repo := cmd.String("repo", "", "Repository name")
	filePath := cmd.String("file-path", "", "Path to the file to watch")
	commitMessage := cmd.String("commit-message", "", "Commit message for changes")
	cmd.Parse(args)

	// Validate required flags
	if *accessToken == "" || *owner == "" || *repo == "" || *filePath == "" {
		log.Fatal("All flags (access-token, owner, repo, file-path) are required.")
	}

	// Initialize GitHub service
	service := githubadapter.NewGitHubService(*accessToken)

	// Initialize and start the file watcher
	err := service.WatchFileAndPush(*owner, *repo, *filePath, *commitMessage)
	if err != nil {
		log.Fatalf("Error setting up file watcher: %v", err)
	}

	fmt.Printf("Watching %s for changes...\n", *filePath)
	// The application will continue running and watching the file in the background
}
