YouTube Downloader GUI


![YouTube Downloader Banner](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/reademe_logo.png)

## Features

### Video Saving Feature
The application allows you to save videos by choosing the desired quality, combining it with the highest available audio, and optionally converting the audio to AAC for maximum compatibility if it uses another codec such as Opus.

### MP3 Saving Feature

The application allows you to save audio from videos as MP3 files separately. When you check the "Save MP3 Separately" option, the application will create an mp3s/ folder within the downloaded channel's media folder (e.g., output_folder/uploader_name/mp3s/). The MP3 file will be named using the video title, ensuring that special characters are sanitized to prevent file system issues.

##

The application includes a settings panel that allows you to configure the following options:
- **FFmpeg Path**: Specify the path to your FFmpeg installation.
- **Video Bitrate**: Choose the desired video bitrate from a predefined list.
- **Audio Bitrate**: Choose the desired audio bitrate from a predefined list.
- **Conversion Preset**: Select the encoding speed for FFmpeg (fast, medium, slow).
- **Output Folder**: Set the folder where downloaded videos and MP3s will be saved. The default is a downloads/ directory relative to the script location, but you can customize it.

## Requirements

- **FFmpeg**: Required for both GUI and CLI versions.

You can download FFmpeg from the [Official Website](https://ffmpeg.org/download.html) or with [Scoop](https://scoop.sh/#/apps?q=ffmpeg&id=33a9b876d8473b87c35e7f3f35c4595c1f08574c).

## Installation Options

The latest release includes three installation options for flexibility and ease of use:

- **Installer Version**: This option unpacks the application, allowing you to install it with shortcuts in the Start Menu and on the Desktop. It integrates with your system, making the application easily accessible from familiar locations.

- **Standalone Executable `.zip`** (Windows): A single-file version that includes everything needed to run the application without installation. Ideal for portability, this version allows you to launch the application directly, making it easy to move and store across different directories or devices.

- **Linux `.tar.gz` Archive** (Standalone): A compressed archive containing the Linux version of the application. Simply extract the contents of the `.tar.gz` file and run the executable within. This option is ideal for Linux users who prefer a standalone application that can be run directly after extraction.

**Full Changelog**: https://github.com/tonywied17/youtube-downloader/commits/release