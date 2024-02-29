package githubadapter

import (
	"context"
	"fmt"

	"github.com/fsnotify/fsnotify"
	"github.com/google/go-github/github"
	"golang.org/x/oauth2"
)

// GitHubService implements IRepositoryService for GitHub
type GitHubService struct {
	client *github.Client
}

// NewGitHubService creates a new instance of GitHubService
func NewGitHubService(accessToken string) *GitHubService {
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: accessToken},
	)
	tc := oauth2.NewClient(context.Background(), ts)
	client := github.NewClient(tc)
	return &GitHubService{client: client}
}

// GetRepositoryInfo gets the repository's details from GitHub
func (s *GitHubService) GetRepositoryInfo(params RepositoryQueryParams) (*RepositoryInfo, error) {
	ghRepo, _, err := s.client.Repositories.Get(context.Background(), params.Owner, params.Repo)
	if err != nil {
		return nil, err
	}

	return &RepositoryInfo{
		FullName:    *ghRepo.FullName,
		Description: *ghRepo.Description,
		CloneURL:    *ghRepo.CloneURL,
		Stars:       *ghRepo.StargazersCount,
		Forks:       *ghRepo.ForksCount,
	}, nil
}

// SaveFileToRepo saves a given file content to a repository path using structured parameters
func (s *GitHubService) SaveFileToRepo(params SaveFileParams) error {
	ctx := context.Background()

	options := &github.RepositoryContentFileOptions{
		Message: &params.Message,
		Content: []byte(params.Content), // Assume content is appropriately prepared (e.g., base64 encoded if necessary)
	}

	_, _, err := s.client.Repositories.CreateFile(ctx, params.Owner, params.Repo, params.Path, options)
	if err != nil {
		return fmt.Errorf("error creating or updating file in the repository: %w", err)
	}

	return nil
}

// DeleteFile deletes a file in a repository
func (s *GitHubService) DeleteFile(params DeleteFileParams) error {
	ctx := context.Background()

	// Get the file's SHA needed to delete it
	fileContent, _, _, err := s.client.Repositories.GetContents(ctx, params.Owner, params.Repo, params.Path, &github.RepositoryContentGetOptions{})
	if err != nil {
		return err
	}

	options := &github.RepositoryContentFileOptions{
		Message: &params.Message,
		SHA:     fileContent.SHA,
	}

	_, _, err = s.client.Repositories.DeleteFile(ctx, params.Owner, params.Repo, params.Path, options)
	if err != nil {
		return fmt.Errorf("error deleting file from the repository: %w", err)
	}

	return nil
}

// CreateBranch creates a new branch if it doesn't exist
// CreateBranch creates a new branch if it doesn't exist using structured parameters
func (s *GitHubService) CreateBranch(params CreateBranchParams) error {
	ctx := context.Background()
	// Get the SHA of the base branch to branch from
	baseBranchRef, _, err := s.client.Git.GetRef(ctx, params.Owner, params.Repo, "refs/heads/"+params.BaseBranch)
	if err != nil {
		return fmt.Errorf("error getting base branch: %w", err)
	}

	// Check if the branch already exists
	_, _, err = s.client.Git.GetRef(ctx, params.Owner, params.Repo, "refs/heads/"+params.BranchName)
	if err == nil {
		// Branch already exists, no need to create a new one
		return nil
	}

	// Create the new branch ref
	newBranchRef := &github.Reference{Ref: github.String("refs/heads/" + params.BranchName), Object: &github.GitObject{SHA: baseBranchRef.Object.SHA}}
	_, _, err = s.client.Git.CreateRef(ctx, params.Owner, params.Repo, newBranchRef)
	if err != nil {
		return fmt.Errorf("error creating new branch: %w", err)
	}

	return nil
}

// BranchExists checks if a branch exists in the repository
func (s *GitHubService) BranchExists(params BranchExistsParams) (bool, error) {
	ctx := context.Background()
	_, _, err := s.client.Git.GetRef(ctx, params.Owner, params.Repo, "refs/heads/"+params.BranchName)
	if err != nil {
		// Assuming error means branch does not exist. In practice, check error type.
		return false, nil
	}
	return true, nil
}

// StartFileWatch starts watching a file or directory for changes using the provided parameters
func (s *GitHubService) StartFileWatch(params FileWatchParams) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer watcher.Close()

	// Start listening for events
	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Write == fsnotify.Write {
					params.OnChange()
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				// Handle errors
				fmt.Println("error:", err)
			}
		}
	}()

	err = watcher.Add(params.Path)
	if err != nil {
		return err
	}

	// Block until the watcher is closed; remove if you have a different mechanism to keep the process alive
	<-make(chan struct{})
	return nil
}
