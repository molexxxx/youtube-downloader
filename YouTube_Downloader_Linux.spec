# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['src/ui.py'],
    pathex=[],
    binaries=[('/home/molex/clone/youtube-downloader/ffmpeg/ffmpeg', 'ffmpeg')],
    datas=[('src/icons', 'icons')],
    hiddenimports=['PIL._tkinter_finder', 'customtkinter', 'CTkMessagebox', 'ffmpeg', 'googleapiclient.discovery', 'googleapiclient.errors', 'googleapiclient.http'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='YouTube Downloader GUI',
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
    icon=['src/icons/yt-multi-size.ico'],
)
