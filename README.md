
![YouTube Downloader Banner](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/reademe_logo.png)

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

This application provides both a **graphical user interface (GUI)** and an **interactive command-line interface (CLI)** for downloading YouTube videos. The features include:

- Download videos at specified quality.
- Automatically merge the best available audio with video into a highly compatible MP4 file.
- Optional audio conversion to AAC format for better compatibility.
- Save audio separately as MP3 files with embedded metadata (e.g., title, artist, album).
- Download an entire playlist of videos or audio (MP3).
- Interactive CLI with a simple menu to manage downloads easily. 

Both the GUI and CLI versions offer flexible options, including the ability to specify output folders and audio bitrates.

## Download the Latest Release

You can download the latest release of the YouTube Video Downloader GUI and CLI versions from the following link:

- [Download Standalone GUI Version](https://github.com/tonywied17/youtube-downloader/releases)
- [Download Standalone CLI Version](https://github.com/tonywied17/youtube-downloader/releases)
- [Download Windows Installer](https://github.com/tonywied17/youtube-downloader/releases)

## Features

### GUI Features
- **Download YouTube videos**: Select and download videos at the best available quality.
- **Automatic AAC Conversion**: Download videos with the best audio quality and original video quality merged into a highly compatible MP4 format.
- **MP3 File Saving Option**: Save a separate MP3 copy of the video’s audio in a clean and accessible folder.
- **Settings Panel**: Easily customize audio bitrate, output folder, and other settings.
- **Standalone Executable**: Runs as a standalone application without needing external dependencies like FFmpeg (which is bundled).

### Interactive CLI Features
- **Download a New Video**: Download a specific video from YouTube.
- **Download Audio as MP3**: Extract and download only the audio of a video as an MP3 file.
- **Download an Entire Playlist (Videos)**: Download all videos in a YouTube playlist.
- **Download an Entire Playlist (Audio/MP3)**: Download all videos from a playlist as MP3 files.

## Installation

### Running the Source Code

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

   For more detailed instructions, refer to the **Interactive CLI Features** section below.

## Settings Panel

The application includes a settings panel that allows you to configure the following options:
- **Audio Bitrate**: Choose the desired audio bitrate from a predefined list.
- **Output Folder**: Set the folder where downloaded videos and MP3s will be saved. The default is a `downloads/` directory relative to the script location, but you can customize it.

Settings are stored in a `settings.json` file within the same directory as the executable.

## Interactive CLI Features

The CLI version offers an interactive menu for easy video and audio downloading. The menu options are as follows:

```python
print("
Main Menu:")
print("  [1] Download a new video")
print("  [2] Download audio as MP3")
print("  [3] Download an entire playlist (videos)")
print("  [4] Download an entire playlist (audio/mp3)")
print("  [5] View Downloads")
print("  [q] Quit")
```

1. **[1] Download a new video**: Prompts the user to enter a YouTube video URL to download the video.
2. **[2] Download audio as MP3**: Prompts the user for a video URL and extracts the audio as an MP3 file.
3. **[3] Download an entire playlist (videos)**: Prompts the user to enter a playlist URL and downloads all videos.
4. **[4] Download an entire playlist (audio/mp3)**: Prompts the user for a playlist URL and downloads all videos as MP3 files.
5. **[5] View Downloads**: Opens the folder where the downloaded files are saved.
6. **[q] Quit**: Exits the CLI tool.

## Building a New Release (Portable Executable and Installer)

To create a new release that includes both a portable executable (standalone) and an installer version of the YouTube Video Downloader, you can use the `build_release.ps1` PowerShell script. This script automates the entire build process.

### Steps to Run `build_release.ps1`

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

## Additional Notes

- **Special Character Handling**: The application replaces any special characters in filenames to prevent issues during processing.
- **FFmpeg Bundled**: FFmpeg is bundled with the application, so there is no need for separate installation or configuration.
- **Metadata for MP3 Files**: The MP3 files created from videos will include embedded metadata like title, artist, and album.

## Troubleshooting

If you encounter issues with the application:
- Ensure `yt-dlp` is installed and up-to-date by running `pip install --upgrade yt-dlp`.
- Check that the downloaded FFmpeg binary is correctly bundled with the application.

### Author
- [Tony Wiedman](https://github.com/tonywied17)
