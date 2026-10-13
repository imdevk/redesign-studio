# Security

Redesign Studio is a **local tool**. It listens on `127.0.0.1` only and is not meant to be hosted on the internet.

## What it protects against
- Pointing it at internal addresses (SSRF): private ranges, localhost and redirects to them are refused unless `ALLOW_PRIVATE_URLS=true`.
- Other websites calling the local server: Host, Origin and content-type are checked.
- Hostile HTML from the AI: scripts, frames, submitting forms and remote files are stripped, the preview iframe is sandboxed, and PNG export runs with JavaScript off and the network blocked.
- Path traversal: stored files use an allow-list of names and 12-hex run ids.

## Known gaps
- Requests made by the page while it loads are not individually checked, and DNS can change between the check and the visit.
- Screenshots and page text are sent to OpenAI when you create a design.

## Reporting
Please open a GitHub issue for low-risk problems. For anything serious, contact the maintainer privately through the email on their GitHub profile.
