---
name: prepare-release
description: Prepare a release branch for merging to main — version bump via chore PR, then release PR to main
---

# Prepare Release

Prepare the current `release/*` branch for merging to main. The `release/*` branch is protected (PR required), so the version bump must go through a separate chore branch first.

## Steps

1. Verify current branch is `release/*`, extract version from branch name (e.g. `release/v1.1.0` → `1.1.0`)
2. Create a new branch `chore/bump-v{version}` off the release branch
3. Update `package.json` `version` field to the extracted version
4. Run `npm install --package-lock-only` to sync `package-lock.json`
5. Commit both changes: `chore: bump version to {version}`
6. Push and create PR targeting the release branch with title `chore: bump version to {version}` (squash merge)
7. After the bump PR is merged, open a second PR from `release/v{version}` → `main` with title `release: v{version}` (merge commit) to trigger the Release workflow
