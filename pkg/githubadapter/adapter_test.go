func TestCreateBranch(t *testing.T) {
	// Create a mock GitHub client
	mockClient := &github.Client{}

	// Create a mock GitHubService instance
	service := &GitHubService{
		client: mockClient,
	}

	// Mock the GetRef method to return a base branch reference
	mockClient.Git.GetRefFunc = func(ctx context.Context, owner, repo, ref string) (*github.Reference, *github.Response, error) {
		if ref == "refs/heads/baseBranch" {
			return &github.Reference{
				Object: &github.GitObject{
					SHA: github.String("baseBranchSHA"),
				},
			}, nil, nil
		}
		return nil, nil, fmt.Errorf("unexpected ref: %s", ref)
	}

	// Mock the GetRef method to return an error for the branchName ref
	mockClient.Git.GetRefFunc = func(ctx context.Context, owner, repo, ref string) (*github.Reference, *github.Response, error) {
		if ref == "refs/heads/branchName" {
			return nil, nil, fmt.Errorf("branch already exists")
		}
		return nil, nil, fmt.Errorf("unexpected ref: %s", ref)
	}

	// Mock the CreateRef method to return a success response
	mockClient.Git.CreateRefFunc = func(ctx context.Context, owner, repo string, ref *github.Reference) (*github.Reference, *github.Response, error) {
		if *ref.Ref == "refs/heads/branchName" && *ref.Object.SHA == "baseBranchSHA" {
			return nil, nil, nil
		}
		return nil, nil, fmt.Errorf("unexpected ref: %s", *ref.Ref)
	}

	// Call the CreateBranch method
	err := service.CreateBranch("owner", "repo", "branchName", "baseBranch")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}