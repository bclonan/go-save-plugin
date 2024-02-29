package githubadapter

import (
	"github.com/fsnotify/fsnotify"
)

// IRepositoryService is the interface for GitHub repository operations, updated to use structured parameters
type IRepositoryService interface {
	GetRepositoryInfo(params RepositoryQueryParams) (*RepositoryInfo, error)
	SaveFileToRepo(params SaveFileParams) error
	DeleteFile(params DeleteFileParams) error
	CreateBranch(params CreateBranchParams) error
	BranchExists(params BranchExistsParams) (bool, error)
	StartFileWatch(params FileWatchParams) error // New method for starting a file watch
}

// RepositoryInfo holds information about a GitHub repository
type RepositoryInfo struct {
	FullName    string
	Description string
	CloneURL    string
	Stars       int
	Forks       int
}

// RepositoryQueryParams holds parameters for querying a repository
type RepositoryQueryParams struct {
	AccessToken string
	Owner       string
	Repo        string
}

// DeleteFileParams holds parameters for the delete-file command
type DeleteFileParams struct {
	AccessToken string
	Owner       string
	Repo        string
	Path        string
	Message     string
}

// CreateBranchParams holds parameters for the create-branch command
type CreateBranchParams struct {
	AccessToken string
	Owner       string
	Repo        string
	BranchName  string
	BaseBranch  string
}

// SaveFileParams holds parameters for the save-file command
type SaveFileParams struct {
	AccessToken string
	Owner       string
	Repo        string
	Path        string
	Message     string
	Content     string
}

// BranchExistsParams holds parameters to check if a branch exists
type BranchExistsParams struct {
	AccessToken string
	Owner       string
	Repo        string
	BranchName  string
}

// FileWatchParams holds parameters for watching a file or directory
type FileWatchParams struct {
	Path     string // Path to the file or directory to watch
	OnChange func() // Callback function to execute when a change is detected
}

// FileWatcher encapsulates file watching functionality
type FileWatcher struct {
	Watcher *fsnotify.Watcher
}
