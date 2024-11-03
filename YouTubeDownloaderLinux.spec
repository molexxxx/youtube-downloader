# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['src/ui.py'],  # Updated path to ui.py
    pathex=['src'],  # Updated to include the src directory
    binaries=[
        ("/usr/share/tcltk/tcl8.6", "tcl"),
        ("/usr/share/tcltk/tk8.6", "tk"),
    ],
    datas=[('src/icons', 'icons')],  # Updated path to icons directory
    hiddenimports=['PIL._tkinter_finder', 'PIL.ImageTk', 'PIL.Image'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='YouTube Downloader Linux',  # Name of the executable
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    target_dir='../dist'  # Set output directory to one level up
)
