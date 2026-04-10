---
name: pr
description: Create a pull request following the branch conventions (feat/fix → release squash, release → main merge)
---

# Create Pull Request

Create a pull request for the current branch following the project's branch workflow.

## Base Branch Rules

- `feat/*` or `fix/*` → target the current `release/*` branch
- `release/*` → target `main`

## Steps

1. Run `git branch --show-current` to identify the current branch
2. Determine the base branch using the rules above
   - For `feat/*` / `fix/*`: find the active `release/*` branch (`git branch -a | grep release/`)
3. Push the current branch to remote if not already pushed (`git push -u origin <branch>`)
4. Create the PR using `gh pr create`:
   - Title: concise, under 70 characters, conventional commit style
   - Body: summary bullets + test plan
   - Do NOT set merge method (rulesets enforce squash or merge commit)
5. Return the PR URL
