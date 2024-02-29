package storage

import "github-adapter/pkg/githubadapter"

// ITargetStorage defines methods to save repository data
type ITargetStorage interface {
	Save(data *githubadapter.RepositoryInfo) error
}
