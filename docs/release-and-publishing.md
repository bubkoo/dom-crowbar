# Release and Publishing

## CI/CD Overview

This repository includes two GitHub Actions workflows:

- Release Please: `.github/workflows/release-please.yml`
  - Trigger: push to `main`/`master`
  - Behavior: analyze conventional commits and open/update a Release PR
  - On merge of Release PR: updates `package.json` and `package-lock.json`, creates `vX.Y.Z` tag and GitHub Release

- CI: `.github/workflows/ci.yml`
  - Trigger: push to `main`/`master`, and pull requests
  - Steps: install dependencies, run tests, run production build
  - Output: uploads `dist/` as an artifact

- Publish Chrome Extension: `.github/workflows/publish-chrome-web-store.yml`
  - Trigger: manual run (`workflow_dispatch`) or tag push (`v*`)
  - Steps: test, build, package extension zip and dist zip, upload to Chrome Web Store, publish
  - Tag-only extra steps: create GitHub Release with detailed notes and attach `extension.zip` + `dist.zip`
  - Output: uploads workflow artifacts and (on tag) publishes a GitHub Release page

## Required GitHub Repository Secrets

Before using publish workflow, configure these repository secrets:

- `CHROME_EXTENSION_ID`: extension ID from Chrome Web Store item page
- `CWS_CLIENT_ID`: OAuth client ID with Chrome Web Store API access
- `CWS_CLIENT_SECRET`: OAuth client secret
- `CWS_REFRESH_TOKEN`: OAuth refresh token for publisher account

## Chrome Web Store Publish Process

1. Ensure the extension has been created at least once in Chrome Web Store Developer Dashboard.
2. In GitHub, open Actions and choose Publish Chrome Extension.
3. Click Run workflow and choose publish target:
   - `default`: publish to all users
   - `trustedTesters`: publish only to trusted testers
4. Wait for completion and review action logs for upload and publish responses.

## Optional Release Strategy

- Preferred: merge Release PR created by Release Please.
- Alternative: manually push semantic tags such as `v1.0.1` to trigger publishing.
- Keep `workflow_dispatch` for controlled manual releases.

## Release Please Configuration

Release Please is configured by:

- `config/release-please-config.json`
- `config/release-please-manifest.json`

Initial baseline version is `v1.0.0` via manifest.

Version bump behavior (Conventional Commits):

- `major`: commit subject includes `!` or body contains `BREAKING CHANGE`
- `minor`: commit type `feat`
- `patch`: commit types like `fix`, `perf`, `refactor`, `docs`, `chore`, etc.

## End-to-End Flow

1. Push commits to `master`/`main`
2. Release Please opens/updates a Release PR
3. Merge Release PR
4. Release Please creates new tag and GitHub Release
5. Tag triggers `.github/workflows/publish-chrome-web-store.yml`
6. Publish workflow uploads to Chrome Web Store and updates release page assets

## Tag Release Flow

When pushing a tag like `v1.0.1`, the publish workflow will:

1. Build and package extension artifacts (`extension.zip`, `dist.zip`)
2. Upload and publish to Chrome Web Store
3. Create a GitHub Release for that tag
4. Populate release notes with:
  - publish target
  - extension ID
  - Chrome Web Store link
  - workflow run link
5. Attach `extension.zip` and `dist.zip` to the release page
