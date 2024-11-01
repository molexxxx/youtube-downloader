[Setup]
AppName=YouTube Downloader
AppVersion=1.0
DefaultDirName={userappdata}\YouTube Downloader
DefaultGroupName=YouTube Downloader
OutputDir=.
OutputBaseFilename=win_Installer
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
SetupIconFile=..\icons\yt-ico.ico

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Additional icons:"
Name: "startmenuicon"; Description: "Create a Start Menu shortcut"; GroupDescription: "Additional icons:"

[Dirs]
Name: "{app}\downloads"

[Files]
Source: "..\dist\YouTube Downloader\YouTube Downloader.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\YouTube Downloader\settings.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\YouTube Downloader\_internal.zip"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "unzip.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\YouTube Downloader"; Filename: "{app}\YouTube Downloader.exe"; Tasks: startmenuicon
Name: "{userdesktop}\YouTube Downloader"; Filename: "{app}\YouTube Downloader.exe"; Tasks: desktopicon

[Run]
Filename: "{tmp}\unzip.exe"; Parameters: """{tmp}\_internal.zip"" -d ""{app}"""; Flags: runhidden skipifsilent
Filename: "{app}\YouTube Downloader.exe"; Description: "Launch YouTube Downloader"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\settings.json"
Type: files; Name: "{app}\_internal\*"
Type: dirifempty; Name: "{app}\downloads"
Type: dirifempty; Name: "{app}\_internal"
Type: dirifempty; Name: "{app}"
