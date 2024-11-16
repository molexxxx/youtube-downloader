![YouTube Downloader Banner](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/reademe_logo.png)

![GitHub license](https://img.shields.io/github/license/tonywied17/youtube-downloader)
![GitHub repo size](https://img.shields.io/github/repo-size/tonywied17/youtube-downloader)
![GitHub language count](https://img.shields.io/github/languages/top/tonywied17/youtube-downloader)
![GitHub last commit](https://img.shields.io/github/last-commit/tonywied17/youtube-downloader)
<br />
![GitHub stars](https://img.shields.io/github/stars/tonywied17/youtube-downloader?style=social)
![GitHub forks](https://img.shields.io/github/forks/tonywied17/youtube-downloader?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/tonywied17/youtube-downloader?style=social)

# YouTube Video Downloader and Converter

This application provides a graphical user interface (GUI) for downloading YouTube videos at specified qualities and offers optional audio conversion to AAC for better compatibility.

## Download the GUI Executable

You can download the latest release of the YouTube Video Downloader GUI from the following link:

![Download Release](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/gui_overview.png)

[Download YouTube Downloader](https://github.com/tonywied17/youtube-downloader/releases)

## Requirements

- **FFmpeg**: Required for both GUI and CLI versions.

## Installing FFmpeg and Running the GUI Application

You can easily install FFmpeg using Scoop, a package manager for Windows.

### Step 1: Install Scoop (Optional for Package Management)

If you haven't already, install Scoop to manage packages on Windows. Open PowerShell and run:

```bash
iwr -useb get.scoop.sh | iex
```

This installs Scoop in your user profile. You may need to allow script execution by running:

```bash
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Step 2: Install FFmpeg

1. **Add the main bucket**:

   ```bash
   scoop bucket add main
   ```

2. **Install FFmpeg**:

   ```bash
   scoop install main/ffmpeg
   ```

Alternatively, if you do not want to use Scoop, you can download and install FFmpeg from the official website:

[FFmpeg Download Page](https://ffmpeg.org/download.html)

### Step 3: Run the GUI Application

You can run the application extracting the standalone `.zip` in the `dist` folder:


### Settings Panel

The application includes a settings panel that allows you to configure the following options:
- **FFMPEG Location**: Set the path to the FFmpeg executable. The application will attempt to auto-detect the FFmpeg path, but you can manually set it here.
- **Audio Bitrate**: Choose the desired audio bitrate from a predefined list.
- **Output Folder**: Set the folder where downloaded videos and MP3s will be saved. The default is a `downloads/` directory relative to the script location, but you can customize it.

### MP3 Saving Feature

- The application allows you to save audio from videos as MP3 files separately in both the GUI and CLI versions.
- This will create an `mp3s/` folder within the downloaded channel's media folder (e.g., `output_folder/uploader_name/mp3s/`) and also apply metadata to the track.
- The MP3 file will be named using the video title, ensuring that special characters are sanitized to prevent file system issues.
- Metadata such as the title, artist, and album will be embedded in the MP3 file.
- The application uses the `ffmpeg` library to convert the audio to AAC format for better compatibility.

![Download Release](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/convert_aac_1.png)

### Settings Storage

The settings are stored in a `settings.json` file within the same directory as the executable. The application will load these settings at startup, allowing you to customize the behavior of the downloader. For the CLI version you modify the settings of the `cli.py` by directly modifying the values of the Global Configuration Variables.


## Installing Requirements for the Interactive CLI

If you wish to run the Interactive CLI version, you will need to install Python and the necessary dependencies.

### Step 1: Install Python

1. **Add the main bucket**:

   ```bash
   scoop bucket add main
   ```

2. **Install Python**:

   ```bash
   scoop install python
   ```

### Step 2: Clone the Repository and Install Requirements

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/tonywied17/youtube-downloader.git
   ```

2. **Navigate to the Project Directory**:

   ```bash
   cd youtube-downloader
   ```

3. **Install Python Requirements**:

   ```bash
   pip install -r requirements.txt
   ```

### Step 3: Running the Interactive CLI Script

To launch the Interactive CLI version, first navigate to the `src` directory:

```bash
cd src/
```

Then, run the following command in your terminal:

```bash
python cli.py
```
![Step 3 Example](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/step3_a.png)


You can also supply the video URL as an argument to the script:

```bash
python cli.py "https://www.youtube.com/watch?v=VIDEO_ID"
```
![Step 3 Example](https://raw.githubusercontent.com/tonywied17/youtube-downloader/refs/heads/main/src/media/repo_assets/step3_b.png)


## Building a New Executable (Extra)

If you need to rebuild the portable standalone version of the executable, ensure you have the necessary packages installed, and then use the following command in your terminal within the project directory:

```bash
pyinstaller "YouTube Downloader.spec"
```

This will create a new portable standalone executable in the `dist` folder.

For a full new build, including the one-directory version and installer, refer to the **Build New Release (Portable Executable and Installer)** section below.

### Build New Release (Portable Executable and Installer)

To create a new release that includes both a portable executable (standalone) and an installer version of the YouTube Video Downloader, you can use the `build_release.ps1` script. This PowerShell script automates the entire process from the root project directory.

#### Prerequisites
- **Inno Setup**: Required for generating the installer. [Download Inno Setup](https://jrsoftware.org/isdl.php).
  - Ensure `ISCC.exe` (the Inno Setup Compiler) is accessible at the specified path or update the script with the correct path to your installation.

#### Steps to Run `build_release.ps1`

1. Open PowerShell in the root project directory.
2. Execute the `build_release.ps1` script to automate the following steps:

```bash
.\build_release.ps1
```

#### Script Overview
The `build_release.ps1` script performs the following tasks:

1. **Clean Build**: Removes existing `dist` and `build` folders to ensure a fresh build.
2. **One-directory Build**: Generates the one-directory executable with dependencies in the `dist\YouTube Downloader` folder.
3. **Internal Compression**: Compresses the `_internal` directory within the one-directory build for optimized distribution.
4. **Generate `settings.json`**: Creates a default `settings.json` file in the one-directory build with preset configurations.
5. **One-file Executable**: Builds the standalone executable, packaging it as a single file in `dist\YouTube Downloader.exe`.
6. **Portable Zip Creation**: Compresses the one-file executable for a portable release in `dist\YouTube_Downloader_Standalone.zip`.
7. **Installer Creation**: If `ISCC.exe` is available, compiles the Inno Setup script to generate a Windows installer in the `installer_scripts` folder.


## Additional Notes

- **Special Character Handling**: The application replaces any special characters in filenames to prevent issues during processing.

## Troubleshooting

If you encounter issues with the application:
- Ensure `ffmpeg` is installed and accessible from the command line.
- Update `yt-dlp` if needed using `pip install --upgrade yt-dlp` (only for the CLI version).

### Author
- [Tony Wiedman](https://github.com/tonywied17)
.