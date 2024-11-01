#* Define paths for directories and files
$distFolder = "dist"
$buildFolder = "build"
$oneDirFolder = "dist\YouTube Downloader"
$internalZipPath = "$oneDirFolder\_internal.zip"
$settingsFilePath = "$oneDirFolder\settings.json"
$oneFileExePath = "dist\YouTube Downloader.exe"
$oneFileZipPath = "dist\YouTube_Downloader_Standalone.zip"
$innoScriptPath = "installer_scripts\installer.iss"
$isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$installerExePath = "installer_scripts\win_Installer.exe"

#! Remove existing "dist" and "build" folders for a clean build
if (Test-Path $distFolder) {
    Remove-Item -Recurse -Force $distFolder
}
if (Test-Path $buildFolder) {
    Remove-Item -Recurse -Force $buildFolder
}

#@ Step 1: Build the one-directory app
pyinstaller --name "YouTube Downloader" --onedir --windowed --icon=icons/yt-ico.ico --add-data "icons;icons" ui.py

#@ Step 2: Compress only the "_internal" directory within the one-directory app
Compress-Archive -Path "$oneDirFolder\_internal" -DestinationPath $internalZipPath -Force

#@ Step 3: Generate settings.json within the one-directory folder
$settingsContent = @"
{
    "video_bitrate": "10M",
    "audio_bitrate": "192k",
    "conversion_preset": "slow",
    "ffmpeg_path": "ffmpeg",
    "output_folder": "%APPDATA%\\YouTube Downloader\\downloads"
}
"@
$settingsContent | Out-File -FilePath $settingsFilePath -Encoding UTF8 -NoNewline -Force

Write-Output "One-directory build with _internal compression and settings.json creation completed successfully."

#@ Step 4: Build the standalone one-file executable as the final output
pyinstaller --name "YouTube Downloader" --onefile --windowed --icon=icons/yt-ico.ico --add-data "icons;icons" ui.py

#@ Step 5: Zip the standalone one-file executable for portable distribution
Compress-Archive -Path $oneFileExePath -DestinationPath $oneFileZipPath -Force

Write-Output "Standalone one-file build and compression completed successfully."

#@ Step 6: Delete existing installer executable if it exists
if (Test-Path $installerExePath) {
    Remove-Item $installerExePath -Force
}

#@ Step 7: Compile the Inno Setup installer script if ISCC.exe is available
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