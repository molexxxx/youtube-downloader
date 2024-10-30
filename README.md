# YouTube Video Downloader and Converter

This application provides a graphical user interface (GUI) for downloading YouTube videos at specified qualities and offers optional audio conversion to AAC for better compatibility. The app automatically detects available GPU encoders (NVIDIA or AMD) and falls back to CPU encoding if no GPU is found.

## Requirements

- **Python** (installed via [Scoop](https://scoop.sh/))
- **FFmpeg** (installed via Scoop)
- **yt-dlp** Python package for downloading YouTube videos

## Setup Guide (Windows)

### Step 1: Install Scoop

If you haven't already, install Scoop to manage packages on Windows. Open PowerShell and run:

```powershell
iwr -useb get.scoop.sh | iex
```

This installs Scoop in your user profile. You may need to allow script execution by running:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Step 2: Install Python and FFmpeg

1. **Install Python**:

   ```powershell
   scoop install python
   ```

2. **Install FFmpeg**:

   ```powershell
   scoop install ffmpeg
   ```

Scoop will install Python and FFmpeg and add them to your PATH, making them available from any terminal.

### Step 3: Install `yt-dlp` Package

With Python installed, use `pip` (Python's package manager) to install `yt-dlp`:

```powershell
pip install yt-dlp
```

### Step 4: Clone the Repository and Install Requirements

1. **Clone the Repository**:

   ```powershell
   git clone https://github.com/tonywied17/youtube-downloader.git
   ```

2. **Navigate to the Project Directory**:

   ```powershell
   cd youtube-downloader
   ```

3. **Install Python Requirements**:

   ```powershell
   pip install -r requirements.txt
   ```

### Step 5: Run the Script

You can run the application using the executable generated in the `dist` folder:

```powershell
cd dist
.\YouTube_Stealer.exe
```

Alternatively, you can run the script from the command line by specifying a YouTube URL as input:

```powershell
python cli.py
```

Or, pass the URL directly:

```powershell
python cli.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

The application will:
1. Display available video qualities in the GUI.
2. Prompt you to choose a quality for download.
3. Detect and use GPU encoding if available (NVIDIA or AMD), falling back to CPU if no GPU is detected.
4. Optionally, convert the audio to AAC for compatibility.

## Settings Panel

The application includes a settings panel that allows you to configure the following options:
- **FFmpeg Path**: Specify the path to your FFmpeg installation.
- **Video Bitrate**: Choose the desired video bitrate from a predefined list.
- **Audio Bitrate**: Choose the desired audio bitrate from a predefined list.
- **Conversion Preset**: Select the encoding speed for FFmpeg (fast, medium, slow).

### Settings Storage

The settings are stored in a `settings.json` file within the same directory as the executable. The application will load these settings at startup, allowing you to customize the behavior of the downloader.

## Additional Notes

- **Special Character Handling**: The application replaces any special characters in filenames to prevent issues during processing.
- **FFmpeg Encoding**: The application checks for GPU encoders (`h264_nvenc` for NVIDIA or `h264_amf` for AMD). Ensure your GPU drivers are up to date if you wish to utilize GPU encoding.

## Troubleshooting

If you encounter issues with the application:
1. Ensure `python`, `ffmpeg`, and `yt-dlp` are installed and accessible from the command line.
2. For GPU encoding, verify that you have the appropriate drivers installed (NVIDIA or AMD).
3. Update `yt-dlp` if needed using `pip install --upgrade yt-dlp`.
