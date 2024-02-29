package storage

import (
	"encoding/json"
	"github-adapter/pkg/githubadapter"
	"os"
)

// FileStorage implements ITargetStorage for saving data to a file
type FileStorage struct {
	FilePath string
}

// NewFileStorage creates a new instance of FileStorage
func NewFileStorage(filePath string) *FileStorage {
	return &FileStorage{FilePath: filePath}
}

// Save writes the repository info to a JSON file
func (f *FileStorage) Save(data *githubadapter.RepositoryInfo) error {
	file, err := os.Create(f.FilePath)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "    ")
	return encoder.Encode(data)
}
