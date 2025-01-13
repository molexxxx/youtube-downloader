
![YouTube Downloader Banner](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/reademe_logo_new.png)

![GitHub](https://img.shields.io/github/license/tonywied17/bin-scripts?style=for-the-badge)
![GitHub repo size](https://img.shields.io/github/repo-size/tonywied17/youtube-downloader?style=for-the-badge)
![Github code size](https://img.shields.io/github/languages/code-size/tonywied17/youtube-downloader?style=for-the-badge)
![GitHub language count](https://img.shields.io/github/languages/top/tonywied17/youtube-downloader?style=for-the-badge)
![GitHub last commit](https://img.shields.io/github/last-commit/tonywied17/youtube-downloader?style=for-the-badge)
<br />
![GitHub watchers](https://img.shields.io/github/watchers/tonywied17/youtube-downloader?style=flat-square)
![GitHub stars](https://img.shields.io/github/stars/tonywied17/youtube-downloader?style=flat-square)
![GitHub forks](https://img.shields.io/github/forks/tonywied17/bin-scripts?style=flat-square)

# YouTube Video Downloader and Converter

This application provides both a **command line interface (CLI)** and an **graphical user interface (GUI)** for downloading YouTube videos. The features include:

- Download videos at specified quality.
- Automatically merge the best available audio with video into a highly compatible MP4 file.
- Automatic audio conversion to AAC format for better compatibility.
- Save audio separately as MP3 files with embedded metadata (e.g., title, artist, album).
- Download a playlist of videos or audio (MP3).
- Interactive CLI with a simple menu to manage downloads easily. 

# Download the Latest Release

You can download the latest release of the YouTube Video Downloader GUI and CLI versions from the following link:

- [Download Windows Standalone](https://github.com/tonywied17/youtube-downloader/releases)
- [Download Linux Standalone](https://github.com/tonywied17/youtube-downloader/releases)
- [Download GUI/CLI Bundles](https://github.com/tonywied17/youtube-downloader/releases)

# Automatic Browser Cookie Import (New Feature)
This application will attempt to import browser cookies required for youtube downloads as well as private and paid videos. 
<br>
## Please ensure that you have...
 - Logged into your youtube account in your browser
 - After logging into youtube, **close all browser windows and tabs**
 - Run the application and it will automatically import the cookies required from your browser to a `cookies.txt` file in your download output folder.

**If you are getting an error message about cookies, please delete any cookies.txt in your output folder and re-follow the steps above.**

**Manually Import:**
 If cookies are not auto-imported, you can manually import them by exporting with a browser extension such as [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) and navigate to youtube.com and login, then export/save the cookies to a `cookies.txt` file in the output folder using the extension.

# Interactive CLI Features

## CLI Commands Documentation

`yt-cli` is a compiled command-line application to download YouTube videos and playlists, with both interactive and programmatic options.

| **Command**                                    | **Description**                                                                 |
|------------------------------------------------|---------------------------------------------------------------------------------|
| `./yt-cli [URL]`                           | Download a single video from the specified YouTube URL.                         |
| `./yt-cli [URL] --playlist`                | Download an entire playlist from the specified playlist URL.                    |
| `./yt-cli [URL] --audio`                   | Download audio only (MP3 format) from the specified video or playlist URL.      |
| `./yt-cli --search "keywords"`             | Search YouTube using keywords and choose a video to download.                   |
| `./yt-cli [URL] --selective`               | Selectively download videos from the specified playlist URL.                    |
| `./yt-cli --open-downloads`                   | Open the downloads folder in the file explorer.                                 |
| `./yt-cli --quit`                          | Quit the application immediately.                                               |

### Examples
- **Download a single video**:
  ```bash
  ./yt-cli https://www.youtube.com/watch?v=example_video
  ```

- **Download a playlist**:
  ```bash
  ./yt-cli https://www.youtube.com/playlist?list=example_playlist --playlist
  ```

- **Download audio from a video**:
  ```bash
  ./yt-cli https://www.youtube.com/watch?v=example_video --audio
  ```

- **Search YouTube and download a video**:
  ```bash
  ./yt-cli --search "coding tutorials"
  ```

- **Selectively download videos from a playlist**:
  ```bash
  ./yt-cli https://www.youtube.com/playlist?list=example_playlist --selective
  ```

- **Open downloads folder**:
  ```bash
  ./yt-cli --open-downloads
  ```


![YouTube Downloader CLI](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/yt-cli-main-menu.png)
- **Download a New Video**: Download a specific video from YouTube.
- **Download Audio as MP3**: Extract and download only the audio of a video as an MP3 file.
- **Download an Entire Playlist (Videos)**: Download all videos in a YouTube playlist.
- **Download an Entire Playlist (Audio/MP3)**: Download all videos from a playlist as MP3 files.
- **Selectively Download from a Playlist**: Choose specific videos/mp3s from a playlist to download.
- **Search YouTube Videos**: Search for videos on YouTube and download the desired video.

![YouTube Downloader CLI Search](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/yt-cli-search.png)
![YouTube Downloader CLI Playlist](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/yt-cli-select-playlist.png)


# GUI Features
![YouTube Downloader GUI](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/yt-gui-windows.png)
- **Download YouTube videos**: Select and download videos at the best available quality.
- **Automatic AAC Conversion**: Download videos with the best audio quality and original video quality merged into a highly compatible MP4 format.
- **MP3 File Saving Option**: Save a separate MP3 copy of the video’s audio in a clean and accessible folder.
- **Settings Panel**: Easily customize audio bitrate, output folder, and other settings.
- **Standalone Executable**: Runs as a standalone application without needing external dependencies like FFmpeg (which is bundled).

![YouTube Downloader GUI Select Quality](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/yt-gui-select-quality.png)
![YouTube Downloader GUI Downloading](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/yt-gui-downloading.png)
![YouTube Downloader GUI Completed](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/yt-gui-completed.png)

# Installation

## Running the Source Code

If you prefer to run the application from the source code, follow the steps below.

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/tonywied17/youtube-downloader.git
   ```

2. **Navigate to the Project Directory**:

   ```bash
   cd youtube-downloader
   ```

3. **Install Python and Dependencies**:

   Install the required Python libraries:

   ```bash
   pip install -r requirements.txt
   ```

4. **Run the Interactive CLI Version**:

   Navigate to the `src` directory and run the CLI script:

   ```bash
   cd src/
   python cli.py
   ```

   You can also provide a video URL as an argument:

   ```bash
   python cli.py "https://www.youtube.com/watch?v=VIDEO_ID"
   ```

5. **Run the GUI Version**:

   Navigate to the `src` directory and run the GUI script:

   ```bash
   cd src/
   python gui.py
   ```

   For more detailed instructions, refer to the **Interactive CLI Features** section below.

# Building a New Release (Portable Executable and Installer)

To create a new release that includes both a portable executable (standalone) and an installer version of the YouTube Video Downloader, you can use the `build_release.ps1` PowerShell script. This script automates the entire build process.

## Steps to Run `build_release.ps1`

1. Open PowerShell in the root project directory.
2. Execute the `build_release.ps1` script:

   ```bash
   ./build_release.ps1
   ```

The script performs the following tasks:
1. **Clean Build**: Removes existing `dist` and `build` folders to ensure a fresh build.
2. **One-Directory Build**: Generates the one-directory executable with dependencies in the `dist\YouTube Downloader` folder.
3. **Internal Compression**: Compresses the `_internal` directory within the one-directory build for optimized distribution.
4. **Generate `settings.json`**: Creates a default `settings.json` file in the one-directory build with preset configurations.
5. **One-File Executable**: Builds the standalone executable, packaging it as a single file in `dist\YouTube Downloader.exe`.
6. **Portable Zip Creation**: Compresses the one-file executable for a portable release in `dist\YouTube_Downloader_Standalone.zip`.
7. **Installer Creation**: If **Inno Setup** is available, compiles the Inno Setup script to generate a Windows installer in the `installer_scripts` folder.

# Additional Notes

- **Special Character Handling**: The application replaces any special characters in filenames to prevent issues during processing.
- **FFmpeg Bundled**: FFmpeg is bundled with the application, so there is no need for separate installation or configuration.
- **Metadata for MP3 Files**: The MP3 files created from videos will include embedded metadata like title, artist, and album.

# Troubleshooting

If you encounter issues with the application:
- Ensure `yt-dlp` is installed and up-to-date by running `pip install --upgrade yt-dlp`.
- Check that the downloaded FFmpeg binary is correctly bundled with the application.

# Author
- [Tony Wiedman](https://github.com/tonywied17)
