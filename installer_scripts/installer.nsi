!include "nsDialogs.nsh"

Name "YouTube Downloader"
OutFile "GUI_Installer.exe"
InstallDir "$APPDATA\YouTube Downloader"  ; Set installation directory to %AppData%
Icon "..\icons\yt-ico.ico"
RequestExecutionLevel user


; Custom page to select shortcut options
Var /GLOBAL StartMenuShortcut
Var /GLOBAL DesktopShortcut
Var /GLOBAL TaskbarShortcut

Page custom ShortcutOptionsPage ShortcutOptionsPageLeave

; Standard installation page
Page instfiles

; Custom page functions
Function ShortcutOptionsPage
    nsDialogs::Create 1018
    Pop $0

    ; Display a message
    ${NSD_CreateLabel} 10u 10u 100% 12u "Select which shortcuts to create:"
    Pop $1

    ; Checkbox for Start Menu Shortcut
    ${NSD_CreateCheckbox} 10u 30u 100% 10u "Create Start Menu Shortcut"
    Pop $StartMenuShortcut
    ${NSD_SetState} $StartMenuShortcut ${BST_CHECKED}  ; Default to checked

    ; Checkbox for Desktop Shortcut
    ${NSD_CreateCheckbox} 10u 50u 100% 10u "Create Desktop Shortcut"
    Pop $DesktopShortcut
    ${NSD_SetState} $DesktopShortcut ${BST_CHECKED}  ; Default to checked

    ; Checkbox for Taskbar Shortcut
    ${NSD_CreateCheckbox} 10u 70u 100% 10u "Create Taskbar Shortcut"
    Pop $TaskbarShortcut
    ${NSD_SetState} $TaskbarShortcut ${BST_CHECKED}  ; Default to checked

    nsDialogs::Show
FunctionEnd

Function ShortcutOptionsPageLeave
    ; Capture the state of each checkbox
    ${NSD_GetState} $StartMenuShortcut $0
    StrCpy $StartMenuShortcut $0
    ${NSD_GetState} $DesktopShortcut $0
    StrCpy $DesktopShortcut $0
    ${NSD_GetState} $TaskbarShortcut $0
    StrCpy $TaskbarShortcut $0
FunctionEnd

; Section for installing
Section "Install YouTube Downloader"
    ; Set the installation directory
    SetOutPath "$INSTDIR"

    ; Copy application files
    File "..\dist\YouTube Downloader.exe"
    File "..\dist\settings.json"

    ; Add application to Add/Remove Programs
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YouTube Downloader" "DisplayName" "YouTube Downloader"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YouTube Downloader" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YouTube Downloader" "InstallLocation" "$INSTDIR"
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Create shortcuts based on user selection
    ; Start Menu Shortcut
    ${If} $StartMenuShortcut == ${BST_CHECKED}
        CreateDirectory "$SMPROGRAMS\YouTube Downloader"
        CreateShortCut "$SMPROGRAMS\YouTube Downloader\YouTube Downloader.lnk" "$INSTDIR\YouTube Downloader.exe" "" "$INSTDIR\yt-ico.ico"
    ${EndIf}

    ; Desktop Shortcut
    ${If} $DesktopShortcut == ${BST_CHECKED}
        CreateShortCut "$DESKTOP\YouTube Downloader.lnk" "$INSTDIR\YouTube Downloader.exe" "" "$INSTDIR\yt-ico.ico"
    ${EndIf}

    ; Taskbar Shortcut
    ${If} $TaskbarShortcut == ${BST_CHECKED}
        CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\YouTube Downloader.lnk" "$INSTDIR\YouTube Downloader.exe" "" "$INSTDIR\yt-ico.ico"
    ${EndIf}

    ; Notify user of completion
    MessageBox MB_OK "Installation Complete!"
SectionEnd

; Section for uninstalling the application
Section "Uninstall"
    ; Remove files and registry entries
    Delete "$INSTDIR\YouTube Downloader.exe"
    Delete "$INSTDIR\yt-ico.ico"
    Delete "$INSTDIR\settings.json"
    Delete "$INSTDIR\Uninstall.exe"

    ; Remove Start Menu and Desktop shortcuts
    Delete "$SMPROGRAMS\YouTube Downloader\YouTube Downloader.lnk"
    Delete "$DESKTOP\YouTube Downloader.lnk"
    Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\YouTube Downloader.lnk"

    ; Remove installation directory and uninstaller
    RMDir "$INSTDIR"

    ; Remove registry keys
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YouTube Downloader"

    ; Notify user of uninstallation completion
    MessageBox MB_OK "Uninstallation Complete!"
SectionEnd
