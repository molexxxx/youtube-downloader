# Define paths for directories, files, and build options
$distFolder = "dist"
$buildFolder = "build"
$oneDirFolder = "$distFolder\YouTube Downloader"
$internalZipPath = "$oneDirFolder\_internal.zip"
$settingsFilePath = "$oneDirFolder\settings.json"
$oneFileExePath = "$distFolder\YouTube Downloader.exe"
$oneFileZipPath = "$distFolder\YouTube_Downloader_GUI.zip"
$innoScriptPath = "installer_scripts\installer.iss"
$isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$installerExePath = "installer_scripts\win_Installer.exe"
$uiScript = "src\ui.py"
$iconPath = "src\icons\yt-multi-size.ico"
$iconsData = "src\icons;icons"
$ffmpegBinaryPath = "ffmpeg\ffmpeg.exe"

# Helper function to create directories if they do not exist
function Create-DirectoryIfNeeded($path) {
    if (-not (Test-Path $path)) {
        New-Item -Path $path -ItemType Directory
    }
}

# Helper function to remove directories if they exist
function Remove-DirectoryIfExists($path) {
    if (Test-Path $path) {
        Remove-Item -Recurse -Force $path
    }
}

# Clean previous build artifacts
Remove-DirectoryIfExists $distFolder
Remove-DirectoryIfExists $buildFolder

# Create required directories
Create-DirectoryIfNeeded $distFolder
Create-DirectoryIfNeeded $oneDirFolder

# Build the one-directory app with PyInstaller
Write-Output "Building the one-directory app..."
pyinstaller `
    --name "YouTube Downloader" `
    --onedir `
    --windowed `
    --icon=$iconPath `
    --add-data $iconsData `
    --add-binary "$ffmpegBinaryPath;ffmpeg\ffmpeg.exe" `
    $uiScript

# Compress internal directory if exists
if (Test-Path "$oneDirFolder\_internal") {
    Compress-Archive -Path "$oneDirFolder\_internal" -DestinationPath $internalZipPath -Force
} else {
    Write-Output "The '_internal' directory does not exist."
}

# Create settings.json
$settingsContent = @"
{
    "audio_bitrate": "256k",
    "output_folder": "%APPDATA%\\YouTube Downloader\\downloads"
}
"@
$settingsContent | Out-File -FilePath $settingsFilePath -Encoding UTF8 -NoNewline -Force

Write-Output "One-directory build with _internal compression and settings.json creation completed successfully."

# Build the standalone one-file executable
Write-Output "Building the standalone one-file executable..."
pyinstaller `
    --name "YouTube Downloader" `
    --onefile `
    --windowed `
    --icon=$iconPath `
    --add-data $iconsData `
    --add-binary "$ffmpegBinaryPath;ffmpeg\ffmpeg.exe" `
    $uiScript

Compress-Archive -Path $oneFileExePath -DestinationPath $oneFileZipPath -Force
Write-Output "Standalone one-file build and compression completed successfully."

# Build the CLI version
Write-Output "Building the YouTube Downloader CLI version..."
pyinstaller YouTube_Downloader_CLI.spec

Compress-Archive -Path "$distFolder\YouTube Downloader CLI.exe" -DestinationPath "$distFolder\YouTube_Downloader_CLI.zip" -Force
Write-Output "YouTube Downloader CLI build and compression completed successfully."

# Build the Inno Setup installer
if (Test-Path $installerExePath) {
    Remove-Item $installerExePath -Force
}

if (Test-Path $isccPath) {
    & $isccPath $innoScriptPath
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Inno Setup installer compiled successfully."
    } else {
        Write-Output "Failed to compile the Inno Setup installer."
    }
} else {
    Write-Output "ISCC.exe not found. Ensure Inno Setup is installed and ISCC.exe is in your PATH or update the script with the correct path."
}
