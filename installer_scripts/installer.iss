[Setup]
AppName=YouTube Downloader
AppVersion=0.3
DefaultDirName={userappdata}\YouTube Downloader
DefaultGroupName=YouTube Downloader
OutputDir=.
OutputBaseFilename=YouTube_Downloader-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
SetupIconFile=..\src\icons\yt-multi-size.ico
UninstallDisplayIcon=..\src\media\bmps\wizard-icon.bmp
WizardImageFile=..\src\media\bmps\wizard-left.bmp
WizardSmallImageFile=..\src\media\bmps\wizard-icon.bmp

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Additional icons:"
Name: "startmenuicon"; Description: "Create a Start Menu shortcut"; GroupDescription: "Additional icons:"

[Dirs]
Name: "{app}\downloads"

[Files]
Source: "..\dist\YouTube Downloader\YouTube Downloader.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\YouTube Downloader\settings.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\YouTube Downloader\_internal.zip"; DestDir: "{tmp}";
Source: "..\dist\yt-cli.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "7z.exe"; DestDir: "{tmp}";

[Icons]
Name: "{group}\YouTube Downloader"; Filename: "{app}\YouTube Downloader.exe"; Tasks: startmenuicon
Name: "{group}\YouTube Downloader CLI"; Filename: "{app}\yt-cli.exe"; Tasks: startmenuicon
Name: "{userdesktop}\YouTube Downloader"; Filename: "{app}\YouTube Downloader.exe"; Tasks: desktopicon
Name: "{userdesktop}\YouTube Downloader CLI"; Filename: "{app}\yt-cli.exe"; Tasks: desktopicon

[Run]
Filename: "{tmp}\7z.exe"; Parameters: "x ""{tmp}\_internal.zip"" -o""{app}"" -y > ""{app}\7z_log.txt"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated
;Filename: "{app}\YouTube Downloader.exe"; Description: "Launch YouTube Downloader GUI"; Flags: nowait postinstall skipifsilent
;Filename: "{app}\yt-cli.exe"; Description: "Launch YouTube Downloader CLI"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\_internal"
Type: files; Name: "{app}\settings.json"
Type: dirifempty; Name: "{app}\downloads"
Type: dirifempty; Name: "{app}"
