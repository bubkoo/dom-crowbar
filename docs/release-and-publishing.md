# Release and Publishing

## CI/CD Overview

This repository includes two GitHub Actions workflows:

- CI: `.github/workflows/ci.yml`
  - Trigger: push to `main`/`master`, and pull requests
  - Steps: install dependencies, run tests, run production build
  - Output: uploads `dist/` as an artifact

- Publish Chrome Extension: `.github/workflows/publish-chrome-web-store.yml`
  - Trigger: manual run (`workflow_dispatch`) or tag push (`v*`)
  - Steps: test, build, package extension zip, upload to Chrome Web Store, publish
  - Output: uploads `extension.zip` as an artifact

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

- Use semantic tags such as `v1.0.1` to auto-trigger publishing.
- Keep `workflow_dispatch` for controlled manual releases.
