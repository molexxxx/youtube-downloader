#@ ----- Global Configuration ----- @#
#* Define paths for directories, files, and build options
$distFolder = "dist"
$buildFolder = "build"
$oneDirFolder = "$distFolder\YouTube Downloader"
$internalZipPath = "$oneDirFolder\_internal.zip"
$settingsFilePath = "$oneDirFolder\settings.json"
$oneFileExePath = "$distFolder\YouTube Downloader.exe"
$oneFileZipPath = "$distFolder\(WINDOWS) YouTube_Downloader_GUI.zip"
$cliOneFilePath = "$distFolder\yt-cli.exe"
$cliOneFileZipPath = "$distFolder\(WINDOWS) YouTube_Downloader_CLI.zip"
$innoScriptPath = "installer_scripts\installer.iss"
$isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$installerExePath = "installer_scripts\win_Installer.exe"
$uiScript = "src\ui.py"
$cliScript = "src\cli.py"
$iconPath = "src\icons\yt-multi-size.ico"
$iconsData = "src\icons;icons"
$ffmpegBinaryPath = "C:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\ffmpeg\ffmpeg.exe"
$hiddenImports = @(
    "customtkinter",
    "CTkMessagebox",
    "ffmpeg",
    "rich",
    "googleapiclient.discovery",
    "googleapiclient.errors",
    "googleapiclient.http"
)
#@ -------------------------------- @#


#@ ----- Helper Functions ----- @#
function Create-DirectoryIfNeeded($path) {
    if (-not (Test-Path $path)) {
        New-Item -Path $path -ItemType Directory -Force
    }
}

function Remove-DirectoryIfExists($path) {
    if (Test-Path $path) {
        Remove-Item -Recurse -Force $path
    }
}

#@ ----- Build Process ----- @#

#* Clean previous build artifacts
Write-Output "Cleaning previous build artifacts..."
Remove-DirectoryIfExists $distFolder
Remove-DirectoryIfExists $buildFolder

#* Create required directories
Create-DirectoryIfNeeded $distFolder
Create-DirectoryIfNeeded $oneDirFolder

#* Build the one-directory app with PyInstaller
Write-Output "Building the one-directory app..."
pyinstaller `
    --name "YouTube Downloader" `
    --onedir `
    --windowed `
    --noconsole `
    --icon=$iconPath `
    --add-data $iconsData `
    --noconfirm `
    --add-binary "$ffmpegBinaryPath;ffmpeg.exe" `
    $(ForEach ($import in $hiddenImports) { "--hidden-import=$import" }) `
    $uiScript

#* Check if _internal directory exists, and compress it
if (Test-Path "$oneDirFolder\_internal") {
    Write-Output "Waiting briefly before compressing _internal directory..."
    Start-Sleep -Seconds 10
    Write-Output "Compressing _internal directory..."
    try {
        Compress-Archive -Path "$oneDirFolder\_internal" -DestinationPath $internalZipPath -Force
        Write-Output "Compression completed successfully."
    } catch {
        Write-Output "Error occurred during compression: $_"
    }
} else {
    Write-Output "The '_internal' directory does not exist."
}

#* Create settings.json file
$settingsContent = @"
{
    "audio_bitrate": "256k",
    "output_folder": "%APPDATA%\\YouTube Downloader\\downloads"
}
"@
$settingsContent | Out-File -FilePath $settingsFilePath -Encoding UTF8 -NoNewline -Force

Write-Output "One-directory build with _internal compression and settings.json creation completed successfully."

#* Build the standalone one-file executable for GUI
Write-Output "Building the standalone one-file GUI executable..."
pyinstaller `
    --name "YouTube Downloader" `
    --onefile `
    --windowed `
    --noconsole `
    --icon=$iconPath `
    --add-data $iconsData `
    --noconfirm `
    --add-binary "$ffmpegBinaryPath;ffmpeg.exe" `
    $(ForEach ($import in $hiddenImports) { "--hidden-import=$import" }) `
    $uiScript

#* Compress the one-file executable into a zip
if (Test-Path $oneFileExePath) {
    Write-Output "Compressing standalone GUI executable..."
    Compress-Archive -Path $oneFileExePath -DestinationPath $oneFileZipPath -Force
} else {
    Write-Output "The one-file GUI executable does not exist."
}

Write-Output "Standalone one-file GUI build and compression completed successfully."

#* Build the standalone one-file executable for CLI
Write-Output "Building the standalone one-file CLI executable..."
pyinstaller `
    --name "yt-cli" `
    --onefile `
    --noconfirm `
    --console `
    --icon=$iconPath `
    --add-binary "$ffmpegBinaryPath;ffmpeg.exe" `
    $(ForEach ($import in $hiddenImports) { "--hidden-import=$import" }) `
    $cliScript

#* Compress the CLI one-file executable into a zip
if (Test-Path $cliOneFilePath) {
    Write-Output "Compressing standalone CLI executable..."
    Compress-Archive -Path $cliOneFilePath -DestinationPath $cliOneFileZipPath -Force
} else {
    Write-Output "The one-file CLI executable does not exist."
}

Write-Output "Standalone one-file CLI build and compression completed successfully."

#* Build the Inno Setup installer
if (Test-Path $installerExePath) {
    Write-Output "Removing existing installer.exe..."
    Remove-Item $installerExePath -Force
}

if (Test-Path $isccPath) {
    Write-Output "Compiling Inno Setup installer..."
    & $isccPath $innoScriptPath
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Inno Setup installer compiled successfully."
    } else {
        Write-Output "Failed to compile the Inno Setup installer."
    }
} else {
    Write-Output "ISCC.exe not found. Ensure Inno Setup is installed and ISCC.exe is in your PATH or update the script with the correct path."
}

#@ ------------------------- @#
