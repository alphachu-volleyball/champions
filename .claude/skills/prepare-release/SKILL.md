---
name: prepare-release
description: Prepare a release branch for merging to main — version bump, commit, and PR
---

# Prepare Release

Prepare the current `release/*` branch for merging to main.

## Steps

1. Verify current branch is `release/*`, extract version from branch name (e.g. `release/v1.1.0` → `1.1.0`)
2. Update `package.json` `version` field to the extracted version
3. Run `npm install --package-lock-only` to sync `package-lock.json`
4. Commit both changes: `chore: bump version to {version}`
5. Push and create PR targeting `main` with title `release: v{version}`