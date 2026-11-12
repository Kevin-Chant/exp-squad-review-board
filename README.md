# experiment-squad PR review board

Daily triage board for GrowthBook `experiment-squad` pull requests.

## What it shows

- PR title (links to GitHub)
- Date opened
- Status: draft, ready to review, in review, merged
- Assignees
- Reviewers (requested + anyone who commented or submitted a review)
- Review-load summary across people involved on ready / in-review PRs

This first version is **read-only**. Update assignees and reviewers on GitHub via the PR link.

## Live sync

Set a `GITHUB_TOKEN` secret with:

- `repo` (or public_repo) for pull request reads
- `read:org` for `experiment-squad` membership

Without the token, the app serves bundled sample data and labels it clearly.

## Local development

```bash
npm install
npm run dev
```

Optional live local sync:

```bash
export GITHUB_TOKEN="$(gh auth token)"
npm run dev
```
