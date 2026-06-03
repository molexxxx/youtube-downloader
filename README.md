<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/logo.svg">
  <img alt="YouTube Downloader" src=".github/assets/logo.svg" width="500">
</picture>

<br/>

**Fast, modern desktop downloader for YouTube - powered by yt-dlp & FFmpeg**

<a href="https://github.com/tonywied17/youtube-downloader/actions/workflows/ci.yml"><img src="https://raw.githubusercontent.com/tonywied17/tonywied17/main/.github/badges/youtube-downloader-ci-ytdl.svg" alt="CI" /></a>
<a href="https://github.com/tonywied17/youtube-downloader/actions/workflows/build.yml"><img src="https://raw.githubusercontent.com/tonywied17/tonywied17/main/.github/badges/youtube-downloader-build-ytdl.svg" alt="build" /></a>
<a href="https://github.com/tonywied17/youtube-downloader/releases"><img src="https://raw.githubusercontent.com/tonywied17/tonywied17/main/.github/badges/youtube-downloader-release-ytdl.svg" alt="release" /></a>
<a href="LICENSE"><img src="https://raw.githubusercontent.com/tonywied17/tonywied17/main/.github/badges/youtube-downloader-license-ytdl.svg" alt="license" /></a>
<a href="https://github.com/tonywied17/youtube-downloader/releases"><img src="https://raw.githubusercontent.com/tonywied17/tonywied17/main/.github/badges/youtube-downloader-downloads-ytdl.svg" alt="downloads" /></a>

<br/>

[Download](#install) · [Features](#features) · [Quick Start](#quick-start) · [Contributing](#contributing) · [Report a Bug](https://github.com/tonywied17/youtube-downloader/issues/new?template=bug_report.yml) · [Request a Feature](https://github.com/tonywied17/youtube-downloader/issues/new?template=feature_request.yml)

</div>

---

## Screenshots

<div align="center">

<a href=".github/assets/main-window.png"><img src=".github/assets/main-window.png" alt="Main window" width="860"></a>

<br/>
<br/>

<table>
  <tr>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/1-youtube-search.png"><img src=".github/assets/thumbs/1-youtube-search.png" alt="YouTube Search" width="200"></a>
      <br/><sub><b>YouTube Search</b></sub>
    </td>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/2-video-download-details.png"><img src=".github/assets/thumbs/2-video-download-details.png" alt="Video Download Details" width="200"></a>
      <br/><sub><b>Video Download Details</b></sub>
    </td>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/3-playlist-download-details.png"><img src=".github/assets/thumbs/3-playlist-download-details.png" alt="Playlist Download Details" width="200"></a>
      <br/><sub><b>Playlist Download Details</b></sub>
    </td>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/4-download-history.png"><img src=".github/assets/thumbs/4-download-history.png" alt="Download History" width="200"></a>
      <br/><sub><b>Download History</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/5-view-logs.png"><img src=".github/assets/thumbs/5-view-logs.png" alt="View Logs" width="200"></a>
      <br/><sub><b>View Logs</b></sub>
    </td>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/6-settings-top.png"><img src=".github/assets/thumbs/6-settings-top.png" alt="Settings - Top" width="200"></a>
      <br/><sub><b>Settings - Top</b></sub>
    </td>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/7-settings-middle.png"><img src=".github/assets/thumbs/7-settings-middle.png" alt="Settings - Middle" width="200"></a>
      <br/><sub><b>Settings - Middle</b></sub>
    </td>
    <td align="center" width="215">
      <a href=".github/assets/thumbs/8-settings-bottom.png"><img src=".github/assets/thumbs/8-settings-bottom.png" alt="Settings - Bottom" width="200"></a>
      <br/><sub><b>Settings - Bottom</b></sub>
    </td>
  </tr>
</table>

</div>

---

## Features

### Download & Resolve

- **YouTube Downloads** - Paste a link or search YouTube right from the URL bar (no API key)
- **Videos, Playlists & Channels** - Smart URL detection: a `watch?v=…&list=…` link prompts you to grab just the video or the whole list, while `playlist?list=…`, channels, and Mixes resolve as collections; full or partial selection with "load more" paging past the fetch limit
- **Video Formats** - "Best quality (auto)" with automatic video + best-audio merge, or hand-pick a specific resolution / fps / codec from the enumerated format list (up to 4K when available)
- **Containers** - Output to **MP4** or **MKV**
- **Audio Extraction** - Pull audio-only as **MP3**, **M4A**, **Opus**, **FLAC**, or **WAV** with selectable bitrate (320K / 256K / 192K / 128K / 96K)
- **6 Quick Presets** - Best MP4, 1080p MP4, 720p MP4, Best MKV, Audio MP3, and Audio FLAC - one click applies format, container, and resolution cap
- **Playlist Picker** - Per-item checkboxes with toggle-all; only the selected subset is downloaded
- **Search** - Type keywords to search YouTube via `ytsearch` and resolve any result with a click (thumbnail, title, duration)

### Post-Processing

- **Embed Thumbnail** - Cover art written into the output file
- **Embed Metadata** - Title, uploader, and date written to file tags
- **Embed Chapters** - YouTube chapter markers preserved
- **Subtitles** - Optionally download subtitle files with configurable language codes
- **SponsorBlock** - Automatically strip sponsor / intro / outro segments
- **Download Archive** - Skip already-downloaded items on re-run via an archive file
- **Cookie Support** - Import cookies from your browser (auto-detect or pick one) for age-gated, private, or members-only content, with automatic retry on auth failures

### Queue, Progress & History

- **Concurrent Queue** - Configurable 1–8 simultaneous downloads with per-job cancellation and de-duplication of identical requests
- **Live Progress** - Real-time percent, speed, and ETA per download with desktop notifications on completion or failure
- **History** - Persistent record of every download (title, kind, URL, status, output path, timestamp) with one-click "Show in folder" and clear controls
- **Logs** - Filterable real-time log viewer (debug / info / warn / error) with tail-follow and copy-all

### App & UI

- **Zero Setup** - yt-dlp and FFmpeg are downloaded automatically on first launch, with a guided bootstrap (checking → downloading → extracting → verifying)
- **Binary Manager** - View yt-dlp / FFmpeg versions and update them on demand, or let them auto-update on launch
- **Auto-Updater** - Check / download / install app updates straight from GitHub Releases with live progress
- **System Tray** - Live download count and average progress in the tooltip; optional close-to-tray
- **Frameless UI** - Custom titlebar, native right-click context menu, and a polished animated empty state
- **Themes** - System, Dark, or Light
- **Desktop Notifications** - Click-to-focus alerts when a download finishes

---

## Install

Grab the latest release for your platform:

| Platform | Download | Format |
|----------|----------|--------|
| **Windows** | [Latest Release](https://github.com/tonywied17/youtube-downloader/releases/latest) | `.exe` (NSIS installer) |
| **macOS** | [Latest Release](https://github.com/tonywied17/youtube-downloader/releases/latest) | `.dmg` installer (Intel & Apple Silicon) |
| **Linux** | [Latest Release](https://github.com/tonywied17/youtube-downloader/releases/latest) | `.deb` / `.rpm` installer |

> yt-dlp and FFmpeg are downloaded automatically on first launch - no manual setup required.

---

## Quick Start

```bash
# Clone & install
git clone https://github.com/tonywied17/youtube-downloader.git
cd youtube-downloader
npm install

# Development (hot-reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Package for distribution
npm run package          # Current platform
npm run package:win      # Windows
npm run package:mac      # macOS
npm run package:linux    # Linux
```

---

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **React 19** - UI with functional components and hooks
- **TypeScript** - Full type safety across main and renderer
- **electron-vite** - Vite build tooling for main / preload / renderer
- **Tailwind CSS v4** - Utility-first styling
- **Zustand** - Lightweight state management
- **Framer Motion** - Animations and transitions
- **Lucide React** - Icon library
- **electron-store** - Persistent configuration
- **electron-updater** - App auto-update from GitHub Releases
- **electron-builder** - Packaging & distribution
- **youtube-dl-exec** - yt-dlp wrapper for resolving and downloading
- **Vitest** - Unit and integration testing

---

## Feedback & Issues

Found a bug or have an idea?

- [**Report a Bug**](https://github.com/tonywied17/youtube-downloader/issues/new) - Something isn't working as expected
- [**Request a Feature**](https://github.com/tonywied17/youtube-downloader/issues/new) - Suggest a new feature or enhancement
- [**Browse Open Issues**](https://github.com/tonywied17/youtube-downloader/issues) - See what's already been reported

Please search existing issues before opening a new one to avoid duplicates.

---

## Contributing

Contributions are welcome! Fork the repo, create a feature branch, and open a pull request. Run `npm run lint`, `npm test`, and `npm run build` before submitting.

---

## License

[MIT](LICENSE) - build cool things with it.

---

<div align="center">
<sub>Downloads are your responsibility - respect the terms of service of the sites you use and the rights of content creators.</sub>
</div>
