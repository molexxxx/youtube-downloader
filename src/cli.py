r'''
File: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src\cli.py
Project: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src
Created Date: Monday November 25th 2024
Author: Tony Wiedman
-----
Last Modified: Tue November 26th 2024 4:42:27 
Modified By: Tony Wiedman
-----
Copyright (c) 2024 MolexWorks
'''


#@ ----- Imports and Dependencies ----- #
"""
Module for downloading videos or audio from YouTube using yt-dlp, FFmpeg, and Python utilities.
Supports interactive CLI functionality for downloading and managing content.
"""
import yt_dlp
import os
import re
import subprocess
import argparse
import ffmpeg
import sys
import platform
#@ ------------------------------------ @#


#@ ----- Global Configuration ----- @#
"""
Global settings for the application, including output folder and audio bitrate.
"""
CONFIG = {
    "audio_bitrate": "256k",
    "output_folder": os.path.join(os.getcwd(), 'downloads')
}
#@ -------------------------------- @#


#@ ----- Initialization Functions ----- @#
"""
Functions for initializing environment settings and verifying dependencies.
"""
def initialize_downloads_folder():
    """
    Ensure the downloads folder exists on application start.

    :return: None
    """
    os.makedirs(CONFIG['output_folder'], exist_ok=True)

def get_ffmpeg_binary():
    """
    Determine the correct FFmpeg binary based on the operating system.

    :return: Path to the FFmpeg binary as a string.
    :raises FileNotFoundError: If the FFmpeg binary cannot be found.
    :raises OSError: If the operating system is unsupported.
    """
    try:
        base_path = sys._MEIPASS 
    except AttributeError:
        base_path = os.path.dirname(os.path.abspath(__file__))

    project_root = os.path.dirname(base_path)

    if platform.system() == 'Windows':
        if os.path.exists(os.path.join(base_path, '_internal', 'ffmpeg.exe', 'ffmpeg.exe')):
            base_path = os.path.join(base_path, '_internal', 'ffmpeg.exe')
            ffmpeg_binary = os.path.join(base_path, 'ffmpeg.exe')
        else:
            ffmpeg_binary = os.path.join(base_path, 'ffmpeg.exe') 
            if not os.path.exists(ffmpeg_binary):
                ffmpeg_binary = os.path.join(project_root, 'ffmpeg', 'ffmpeg.exe')
    elif platform.system() == 'Linux':
        ffmpeg_binary = os.path.join(base_path, 'ffmpeg')
    else:
        raise OSError("Unsupported operating system. Only Windows and Linux are supported.")

    if not os.path.exists(ffmpeg_binary):
        raise FileNotFoundError(f"FFmpeg binary not found at {ffmpeg_binary}. Please include the correct binary.")
    
    return ffmpeg_binary

"""
Set the FFmpeg path for the application
"""
ffmpeg_path = get_ffmpeg_binary()
os.environ['FFMPEG_BINARY'] = ffmpeg_path

#@ -------------------------------------- @#


#@ ----- Utility Functions ----- @#
"""
Helper functions for file sanitization, path management, and basic operations.
"""
def sanitize_filename(filename):
    """
    Replace special characters in filenames with underscores.

    :param filename: Original filename as a string.
    :return: Sanitized filename as a string.
    """
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)

def open_in_explorer(path):
    """
    Open the file explorer to the specified path.

    :param path: Folder or file path to open.
    :return: None
    """
    print(f"Opening folder: {path}")
    try:
        if platform.system() == "Windows":
            subprocess.run(["explorer", os.path.normpath(path)])
        elif platform.system() == "Linux":
            subprocess.run(["xdg-open", path])
        else:
            print(f"Opening downloads folder is not supported on {platform.system()}.")
    except Exception as e:
        print(f"Error opening folder: {e}")

def is_playlist(url):
    """
    Check if the URL corresponds to a playlist.

    :param url: YouTube URL as a string.
    :return: True if the URL is a playlist, False otherwise.
    """
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        return 'entries' in info 

#@ ------------------------------ @#


#@ ----- Video and Audio Handling Functions ----- @#
"""
Core functions for downloading videos, extracting audio, and converting formats.
"""
def list_available_qualities(url):
    """
    Fetch and display available video qualities for a given YouTube URL.

    :param url: YouTube URL as a string.
    :return: A list of available qualities, each represented as a dictionary.
    """
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        seen_qualities = {}

        print("\nAvailable Qualities:")
        for f in formats:
            resolution = f.get('resolution', 'unknown')
            fps = f.get('fps', 'unknown')
            seen_qualities[(resolution, fps)] = {
                'format_id': f['format_id'],
                'resolution': resolution,
                'fps': fps,
                'ext': f.get('ext', 'webm')
            }

        available_qualities = list(seen_qualities.values())
        for idx, quality in enumerate(available_qualities, start=1):
            print(f"{idx}: {quality['resolution']} at {quality['fps']} fps")
        
        return available_qualities

def download_video(url):
    """
    Download video from URL in selected quality and save to output folder.

    :param url: YouTube URL as a string.
    :return: Path to the folder where the video is saved.
    """
    available_qualities = list_available_qualities(url)
    
    while True:
        try:
            selected_index = int(input("\nEnter the number for your desired quality: ")) - 1
            if selected_index < 0 or selected_index >= len(available_qualities):
                raise ValueError("Invalid selection. Choose a number from the list.")
            break
        except (ValueError, IndexError):
            print("Invalid input. Please enter a valid number from the list.")

    selected_quality = available_qualities[selected_index]

    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        video_title = sanitize_filename(info.get('title', 'downloaded_video').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))
    
    folder_path = os.path.join(CONFIG['output_folder'], uploader_name)
    os.makedirs(folder_path, exist_ok=True)
    
    final_output = os.path.join(folder_path, f"{video_title}_{selected_quality['resolution']}.mp4")

    ydl_opts = {
        'format': f"{selected_quality['format_id']}+bestaudio/best",
        'outtmpl': final_output,
        'merge_output_format': 'mp4',
        'postprocessors': [{'key': 'FFmpegMetadata'}],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    print(f"Download complete! Video saved as {final_output}")

    convert_audio_to_aac(final_output)

    return folder_path

def convert_audio_to_aac(video_path):
    """
    Check if video audio is AAC and convert to AAC if it's not.

    :param video_path: Path to the video file as a string.
    :return: None
    """
    probe = ffmpeg.probe(video_path)
    audio_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'audio'), None)

    if not audio_stream:
        print("No audio stream found in the video. Skipping conversion.")
        return

    codec = audio_stream.get('codec_name', '')
    
    if codec != "aac":
        print(f"Audio codec is '{codec}'. Converting to AAC...")
        aac_output = video_path.replace('.mp4', '_aac.mp4')
        (
            ffmpeg
            .input(video_path)
            .output(aac_output, vcodec='copy', acodec='aac', audio_bitrate=CONFIG['audio_bitrate'])
            .run(overwrite_output=True)
        )
        
        os.replace(aac_output, video_path)
        print(f"Conversion to AAC complete. File saved as {video_path}")
    else:
        print("Audio is already in AAC format. No conversion needed.")

def download_best_audio(url):
    """
    Download the best audio from a URL and convert to MP3 with metadata.

    :param url: YouTube URL as a string.
    :return: Path to the folder where the MP3 file is saved.
    """
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        audio_title = sanitize_filename(info.get('title', 'downloaded_audio').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))

    folder_path = os.path.join(CONFIG['output_folder'], uploader_name, 'mp3s')
    os.makedirs(folder_path, exist_ok=True)

    mp3_output = os.path.join(folder_path, f"{audio_title}.mp3")

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': mp3_output,
        'postprocessors': [
            {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': CONFIG['audio_bitrate'].replace('k', ''),
            },
            {
                'key': 'FFmpegMetadata'
            }
        ],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    print(f"Download complete! Audio saved as {mp3_output}")

    return folder_path

def download_playlist(playlist_url, download_audio=False):
    """
    Download all videos or audio from a playlist using yt-dlp with options in the command line.

    :param playlist_url: URL of the playlist to download.
    :param download_audio: If True, download audio-only files; otherwise, download videos.
    :return: The folder path where the playlist was saved as a string.
    :raises Exception: If there is an error during the download process.
    """
    output_folder = CONFIG['output_folder']
    
    try:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            playlist_info = ydl.extract_info(playlist_url, download=False)
            playlist_creator = sanitize_filename(playlist_info.get('uploader', 'Unknown_Uploader'))
            playlist_title = sanitize_filename(playlist_info.get('title', 'Unknown Playlist'))

        if download_audio:
            playlist_folder = os.path.join(output_folder, playlist_creator, playlist_title, 'mp3s')
        else:
            playlist_folder = os.path.join(output_folder, playlist_creator, playlist_title)

        os.makedirs(playlist_folder, exist_ok=True)

        ydl_opts = {
            'quiet': False,
            'outtmpl': os.path.join(playlist_folder, '%(title)s.%(ext)s'),
            'format': 'bestaudio/best' if download_audio else 'best', 
            'merge_output_format': 'mp4',
            'postprocessors': []
        }

        if download_audio:
            ydl_opts['postprocessors'] = [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': CONFIG['audio_bitrate'].replace('k', ''),
                },
                {
                    'key': 'FFmpegMetadata'
                }
            ]

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"Downloading playlist from: {playlist_url}")
            ydl.download([playlist_url])

        print("Playlist download complete!")
        return playlist_folder

    except Exception as e:
        print(f"Error occurred while downloading playlist: {e}")
        return None

#@ ----------------------------------------------- @#


#@ ----- Interactive CLI Menu ----- @#
"""
Functions for interactive CLI-based menu navigation and user input handling.
"""
def main_menu():
    """
    Main interactive CLI loop.

    :return: None
    """
    while True:
        print("\nMain Menu:")
        print("  [1] Download a new video")
        print("  [2] Download audio as MP3")
        print("  [3] Download an entire playlist (videos)")
        print("  [4] Download an entire playlist (audio/mp3)")
        print("  [5] View Downloads")
        print("  [q] Quit")

        choice = input("Choose an option: ").strip().lower()

        if choice == '1':
            url = input("Enter YouTube URL: ").strip()
            if is_playlist(url):
                print("This is a playlist URL. Please choose playlist options.")
            else:
                folder_path = download_video(url) 
                post_download_menu(folder_path)
        elif choice == '2':
            url = input("Enter YouTube URL: ").strip()
            if is_playlist(url):
                print("This is a playlist URL. Please choose playlist options.")
            else:
                folder_path = download_best_audio(url)
                post_download_menu(folder_path)
        elif choice == '3':
            url = input("Enter playlist URL: ").strip()
            folder_path = download_playlist(url, download_audio=False)
            post_download_menu(folder_path)
        elif choice == '4':
            url = input("Enter playlist URL: ").strip()
            folder_path = download_playlist(url, download_audio=True) 
            post_download_menu(folder_path)
        elif choice == '5':
            open_in_explorer(CONFIG['output_folder'])
        elif choice == 'q':
            print("Exiting the program.")
            sys.exit(0)
        else:
            print("Invalid option. Please try again.")
     
def post_download_menu(folder_path):
    """
    Options to display after a download is complete.

    :param folder_path: Path to the folder where files were downloaded.
    :return: None
    """
    while True:
        print("\nDownload Complete! What would you like to do next?")
        print("  [1] View in Explorer")
        print("  [2] Return to Main Menu")
        print("  [q] Quit")

        choice = input("Choose an option: ").strip().lower()

        if choice == '1':
            open_in_explorer(folder_path)
        elif choice == '2':
            return
        elif choice == 'q':
            print("Exiting the program.")
            sys.exit(0)
        else:
            print("Invalid option. Please try again.")

#@ ---------------------------------- @#


#@ ----- Main Entry Point ----- @#
"""
Main application entry point for command-line parsing and menu interaction.
"""
if __name__ == "__main__":
    """
    Main entry point for the CLI application.
    Parses arguments or starts the interactive menu loop.

    :return: None
    """
    initialize_downloads_folder()
    
    parser = argparse.ArgumentParser(description="YouTube Downloader")
    parser.add_argument('url', nargs='?', help="URL of the YouTube video or playlist")
    parser.add_argument('--playlist', action='store_true', help="Download entire playlist")
    parser.add_argument('--audio', action='store_true', help="Download audio only (MP3)")
    args = parser.parse_args()

    if args.url:
        if args.playlist:
            print(f"Downloading playlist from: {args.url}")
            download_playlist(args.url, download_audio=args.audio)
        elif args.audio:
            print(f"Downloading audio from: {args.url}")
            download_best_audio(args.url)
        else:
            print(f"Downloading video from: {args.url}")
            download_video(args.url)
    else:
        main_menu()
        
#@ ----------------------------- @#