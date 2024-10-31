; Define the installer properties
[Setup]
AppName=YouTube Downloader
AppVersion=1.0
DefaultDirName={userappdata}\YouTube Downloader
DefaultGroupName=YouTube Downloader
OutputDir=.
OutputBaseFilename=GUI-Installer
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
SetupIconFile=..\icons\yt-ico.ico

; Setup tasks for user shortcut options
[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Additional icons:"
Name: "startmenuicon"; Description: "Create a Start Menu shortcut"; GroupDescription: "Additional icons:"

; Define directories to create
[Dirs]
Name: "{app}\downloads"

; Define files to install
[Files]
Source: "..\dist\YouTube Downloader.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\settings.json"; DestDir: "{app}"; Flags: ignoreversion

; Define icons (shortcuts) to create based on tasks selected
[Icons]
Name: "{group}\YouTube Downloader"; Filename: "{app}\YouTube Downloader.exe"; Tasks: startmenuicon
Name: "{userdesktop}\YouTube Downloader"; Filename: "{app}\YouTube Downloader.exe"; Tasks: desktopicon

; Define uninstallation behavior
[UninstallDelete]
Type: files; Name: "{app}\settings.json"
Type: dirifempty; Name: "{app}\downloads"

; Run section for post-install actions
[Run]
Filename: "{app}\YouTube Downloader.exe"; Description: "Launch YouTube Downloader"; Flags: nowait postinstall skipifsilent
