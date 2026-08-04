# Security policy

## Supported versions

YouTube Downloader ships as a desktop app with auto-update built in, so only the
latest release receives security fixes. Older versions are not patched.

| Version | Supported |
| ------- | --------- |
| Latest release (currently 1.4.x) | Yes |
| Anything earlier | No, update to the latest release |

If you are running an older build, the in-app updater will move you to the
current release.

## Reporting a vulnerability

Report privately through GitHub, not in a public issue. Open the
[Security tab](https://github.com/molexxxx/youtube-downloader/security/advisories/new)
and use "Report a vulnerability". That opens a private advisory visible only to
the maintainer.

Helpful things to include:

- The app version, shown in Settings under About, and your operating system
- What an attacker gains, not only what misbehaves
- Steps to reproduce, ideally with a URL or file that triggers it
- Relevant lines from `app.log`, which lives in the app's user data folder under
  `logs/`. On Windows that is `%APPDATA%\YouTube Downloader\logs\app.log`.

Please do not open a public issue, post a proof of concept publicly, or test
against machines you do not own until a fix has shipped.

This is a hobby project maintained by one person, so expect a response measured
in days rather than hours. You will get an acknowledgement either way, including
when a report turns out not to be a vulnerability.

## Scope

In scope:

- The Electron app itself: main, preload, and renderer code in `src/`
- IPC surface between renderer and main, and anything crossing the context bridge
- Download, extraction, and file-writing paths, including archive handling
- The bundled Discord bot, its token handling, and its voice pipeline
- The auto-update and release-signing path
- Dependency vulnerabilities that are actually reachable from app code

Out of scope:

- `yt-dlp` and `ffmpeg`. These are third-party binaries fetched at runtime and
  are not vendored in this repository. Report issues in them to their own
  projects.
- YouTube itself, its rate limits, or its terms of service
- Findings that require an attacker to already have local code execution or
  administrator rights on the user's machine
- Dependency advisories with no reachable call path from this app, though a
  report explaining why a path is reachable is welcome
- Anything about downloading copyrighted material, which is a licensing matter
  rather than a security one

## Disclosure

Once a fix is ready it ships in the next release, and the advisory is published
with credit to the reporter unless anonymity is preferred. If a report is
declined as out of scope you will get an explanation, and you are free to
disclose it publicly at that point.
