package main

import (
	"fmt"
	"github-adapter/pkg/githubadapter"
	"github-adapter/pkg/storage"
	"log"
	"os"
	"path/filepath"
)

func main() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: githubadaptercli <access_token> <owner> <repo>")
		os.Exit(1)
	}

	accessToken := os.Args[1]
	owner := os.Args[2]
	repo := os.Args[3]

	service := githubadapter.NewGitHubService(accessToken)
	repoInfo, err := service.GetRepositoryInfo(owner, repo)
	if err != nil {
		log.Fatalf("Failed to get repository info: %v", err)
	}

	fmt.Printf("Repository Info: %+v\n", repoInfo)

	// Assuming you want to save the data to a file
	filePath := filepath.Join(".", fmt.Sprintf("%s_info.json", repo))
	fileStorage := storage.NewFileStorage(filePath)
	if err := fileStorage.Save(repoInfo); err != nil {
		log.Fatalf("Failed to save repository info: %v", err)
	}

	fmt.Println("Repository info saved successfully")
}
