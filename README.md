# YouTube Video Downloader and Converter

This script downloads YouTube videos at specified qualities and offers optional audio conversion to AAC for compatibility. The script automatically detects available GPU encoders (NVIDIA or AMD) and falls back to CPU encoding if no GPU is found.

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

Run the script by specifying a YouTube URL as input. You can either pass the URL as a command-line argument or enter it when prompted:

```powershell
python download.py
```

Or, pass the URL directly:

```powershell
python download.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

The script will:
1. Display available video qualities.
2. Prompt you to choose a quality for download.
3. Detect and use GPU encoding if available (NVIDIA or AMD), falling back to CPU if no GPU is detected.
4. Optionally, convert the audio to AAC for compatibility.

## Additional Notes

- **Special Character Handling**: The script replaces any special characters in filenames to prevent issues during processing.
- **FFmpeg Encoding**: The script checks for GPU encoders (`h264_nvenc` for NVIDIA or `h264_amf` for AMD). Ensure your GPU drivers are up to date if you wish to utilize GPU encoding.

## Troubleshooting

If you encounter issues with the script:
1. Ensure `python`, `ffmpeg`, and `yt-dlp` are installed and accessible from the command line.
2. For GPU encoding, verify that you have the appropriate drivers installed (NVIDIA or AMD).
3. Update `yt-dlp` if needed using `pip install --upgrade yt-dlp`.
