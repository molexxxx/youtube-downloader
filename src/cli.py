r'''
File: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src\cli.py
Project: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src
Created Date: Monday November 25th 2024
Author: Tony Wiedman
-----
Last Modified: Mon January 13th 2025 10:34:27 
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
import sys
import platform
import shutil
from rich.console import Console
from rich import box
from rich.table import Table
from rich.prompt import Prompt
from rich.box import SIMPLE
from rich.box import MINIMAL
from rich import box
from googleapiclient.discovery import build
from cookies import CookieExporter
from dotenv import load_dotenv
load_dotenv()

#@ ------------------------------------ @#

#@ ----- Global Configuration ----- #
"""
Global settings for the application, including output folder and audio bitrate.
"""
CONFIG = {
    "audio_bitrate": "256k",
    "output_folder": os.path.join(os.getcwd(), 'downloads'),
    "youtube_api_key": os.getenv("YOUTUBE_API_KEY")
}
console = Console()
cookie_file_path = os.path.join(CONFIG["output_folder"], 'cookies.txt')
#@ -------------------------------- @#


#@ ----- Initialization Functions ----- #
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
    Locate the FFmpeg binary, considering PyInstaller's one-file and one-folder modes.
    :return: Path to the FFmpeg binary.
    """
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path
    
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.dirname(os.path.abspath(__file__))

    potential_paths = [
        os.path.join(base_path, '_internal', 'ffmpeg.exe', 'ffmpeg.exe'),   # Windows (nested inside folder)
        os.path.join(base_path, '_internal', 'ffmpeg', 'ffmpeg'),           # Linux
        os.path.join(base_path, 'ffmpeg.exe', 'ffmpeg.exe'),                # Windows (nested folder)
        os.path.join(base_path, 'ffmpeg', 'ffmpeg'),                        # Linux
        
        os.path.join(base_path, '..', 'ffmpeg', 'ffmpeg.exe'),              # Dev Path
    ]

    for path in potential_paths:
        if os.path.exists(path):
            return path

    raise FileNotFoundError(
        "FFmpeg binary not found in expected locations. "
        "Ensure it is included in '_internal/ffmpeg/' for one-folder mode or root for one-file mode."
    )


"""
Set the FFmpeg path for the application
"""
ffmpeg_path = get_ffmpeg_binary()
os.environ["FFMPEG_BINARY"] = ffmpeg_path
console.print(f"[green]FFmpeg binary path:[/green] {ffmpeg_path}")

#@ -------------------------------------- @#


#@ ----- Utility Functions ----- #
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
    console.print(f"[yellow]Opening folder:[/yellow] {path}")
    try:
        if platform.system() == "Windows":
            subprocess.run(["explorer", os.path.normpath(path)])
        elif platform.system() == "Linux":
            subprocess.run(["xdg-open", path])
        else:
            console.print(f"[red]Opening downloads folder is not supported on {platform.system()}.")
    except Exception as e:
        console.print(f"[red]Error opening folder: {e}")

def is_playlist(url):
    """
    Check if the URL is a playlist URL and remove the playlist part.

    :param url: YouTube URL as a string.
    :return: The modified URL without the playlist part if it exists, otherwise the original URL.
    """
    if '&list=' in url:
        playlist_start = url.find('&list=')
        next_param_start = url.find('&', playlist_start + 1)

        if next_param_start != -1:
            return url[:playlist_start] + url[next_param_start:]
        else:
            return url[:playlist_start]
    return url

#@ ------------------------------ @#


#@ ----- Download Functions ----- #
def list_available_qualities(url):
    """
    Fetch and display available video qualities for a given YouTube URL.

    :param url: YouTube URL as a string.
    :return: List of available qualities.
    """
    ydl_opts = {
        'quiet': True, 
        'ffmpeg_location': ffmpeg_path ,
        'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt'),
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        seen_qualities = {}

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
        if not available_qualities:
            console.print("[red]No available qualities found.[/red]")
            return []

        table = Table(title="Available Video Qualities", box=MINIMAL)
        table.add_column("Index", justify="right", style="bold italic red3")
        table.add_column("Resolution", style="grey93")
        table.add_column("FPS", style="grey93")
        table.add_column("Format", style="red3")

        for idx, quality in enumerate(available_qualities, start=1):
            table.add_row(
                str(idx),
                quality['resolution'] or "N/A",
                str(quality['fps']),
                quality['ext']
            )

        console.print(table)

        return available_qualities

def download_video(url):
    """
    Download a video from URL in selected quality and save to the output folder.

    :param url: YouTube URL as a string.
    :return: Path to the folder where the video is saved.
    """
    available_qualities = list_available_qualities(url)
    if not available_qualities:
        return None

    while True:
        try:
            selected_index = int(input("\nEnter the number for your desired quality: ")) - 1
            if selected_index < 0 or selected_index >= len(available_qualities):
                raise ValueError("Invalid selection. Choose a number from the list.")
            break
        except (ValueError, IndexError):
            print("Invalid input. Please enter a valid number from the list.")

    selected_quality = available_qualities[selected_index]

    with yt_dlp.YoutubeDL({
        'quiet': True, 
        'ffmpeg_location': ffmpeg_path,
        'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt')
    }) as ydl:
        info = ydl.extract_info(url, download=False)
        video_title = sanitize_filename(info.get('title', 'downloaded_video').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))

    folder_path = os.path.join(CONFIG['output_folder'], uploader_name)
    os.makedirs(folder_path, exist_ok=True)

    final_output = os.path.join(folder_path, f"{video_title}_{selected_quality['resolution']}.mp4")

    ydl_opts = {
        'ffmpeg_location': ffmpeg_path,
        'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt'),
        'format': f"{selected_quality['format_id']}+bestaudio/best",
        'outtmpl': final_output,
        'merge_output_format': 'mp4',
        'postprocessors': [{'key': 'FFmpegMetadata'}],
        'quiet': True,
        'verbose': False,
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
    try:
        console.print("[yellow]Please wait.. Converting to AAC for compatibility..[/yellow]")
        print(f"Input file: {video_path}")
        aac_output = video_path.replace('.mp4', '_aac.mp4')
        print(f"Output file: {aac_output}")

        convert_cmd = [
            ffmpeg_path,
            '-i', video_path,
            '-c:v', 'copy', 
            '-c:a', 'aac',
            '-b:a', CONFIG['audio_bitrate'],
            aac_output
        ]

        result = subprocess.run(convert_cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, check=True)

        os.replace(aac_output, video_path)
        print(f"Conversion to AAC complete. File saved as {video_path}")

    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e.stderr if e.stderr else str(e)}")
    except Exception as e:
        print(f"Error: {e}")


def download_best_audio(url):
    """
    Download the best audio from a URL and convert to MP3 with metadata.

    :param url: YouTube URL as a string.
    :return: Path to the folder where the MP3 file is saved.
    """
    with yt_dlp.YoutubeDL({'quiet': True, 'ffmpeg_location': ffmpeg_path, 'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt')}) as ydl:
        info = ydl.extract_info(url, download=False)
        audio_title = sanitize_filename(info.get('title', 'downloaded_audio').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))

    folder_path = os.path.join(CONFIG['output_folder'], uploader_name, 'mp3s')
    os.makedirs(folder_path, exist_ok=True)

    mp3_output = os.path.join(folder_path, f"{audio_title}.mp3")

    ydl_opts = {
        'ffmpeg_location': ffmpeg_path,
        'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt'),
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
        with yt_dlp.YoutubeDL({'quiet': True, 'ffmpeg_location': ffmpeg_path, 'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt'),}) as ydl:
            playlist_info = ydl.extract_info(playlist_url, download=False)
            playlist_creator = sanitize_filename(playlist_info.get('uploader', 'Unknown_Uploader'))
            playlist_title = sanitize_filename(playlist_info.get('title', 'Unknown Playlist'))

        if download_audio:
            playlist_folder = os.path.join(output_folder, playlist_creator, playlist_title, 'mp3s')
        else:
            playlist_folder = os.path.join(output_folder, playlist_creator, playlist_title)

        os.makedirs(playlist_folder, exist_ok=True)

        ydl_opts = {
            'ffmpeg_location': ffmpeg_path,
            'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt'),
            'quiet': False,
            'outtmpl': os.path.join(playlist_folder, '%(title)s.%(ext)s'),
            'format': 'bestaudio/best' if download_audio else 'bestvideo+bestaudio/best',
            'postprocessors': [],
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
        else:
            ydl_opts['postprocessors'] = [
                {
                    'key': 'FFmpegMetadata'
                }
            ]
            ydl_opts['merge_output_format'] = 'mp4'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"Downloading playlist from: {playlist_url}")
            ydl.download([playlist_url])

        print("Playlist download complete!")
        return playlist_folder

    except Exception as e:
        print(f"Error occurred while downloading playlist: {e}")
        return None


#@ ------------------------------- @#


#@ ----- New Features Testing ----- @#
def search_youtube_videos(keywords):
    """
    Search YouTube videos using keywords and return a list of results.

    :param keywords: Search keywords as a string.
    :return: List of (index, video URL, title) tuples.
    """
    youtube = build("youtube", "v3", developerKey=CONFIG['youtube_api_key'])
    request = youtube.search().list(
        q=keywords,
        part="snippet",
        type="video",
        maxResults=10
    )
    response = request.execute()
    
    table = Table(title="Search Results", box=box.MINIMAL)
    table.add_column("Index", justify="right", style="bold italic red3")
    table.add_column("Title", style="grey93")
    table.add_column("Channel", style="red3")
    
    video_results = []
    for idx, item in enumerate(response['items'], start=1):
        video_url = f"https://www.youtube.com/watch?v={item['id']['videoId']}"
        video_results.append((idx, video_url, item['snippet']['title']))
        table.add_row(str(idx), item['snippet']['title'], item['snippet']['channelTitle'])
    
    console.print(table)
    return video_results

def select_videos_from_playlist(url):
    """
    Allow selective downloading of videos from a playlist.

    :param url: Playlist URL as a string.
    :return: List of selected video URLs.
    """
    with yt_dlp.YoutubeDL({'quiet': True, 'ffmpeg_location': ffmpeg_path, 'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt'),}) as ydl:
        playlist_info = ydl.extract_info(url, download=False)
        entries = playlist_info.get('entries', [])
        
        table = Table(title="Playlist Videos", box=box.MINIMAL)
        table.add_column("Index", justify="right", style="bold italic red3")
        table.add_column("Title", style="grey93")
        
        video_urls = []
        for idx, video in enumerate(entries, start=1):
            video_urls.append(video['webpage_url'])
            table.add_row(str(idx), video.get('title', 'Unknown Title'))
        
        console.print(table)
        
        selected_indices = input("Enter the indices of videos to download (comma-separated): ").split(',')
        selected_urls = [video_urls[int(i.strip()) - 1] for i in selected_indices if i.strip().isdigit() and int(i.strip()) - 1 < len(video_urls)]
        return selected_urls


def download_selected_videos(selected_urls, playlist_url, download_audio=False):
    """
    Download selected videos from a playlist with the best quality and save them in a folder.
    Optionally, download only the audio and convert it to MP3.
    For videos, copy the downloaded video and convert the audio to AAC if needed.

    :param selected_urls: List of video URLs to download.
    :param playlist_url: Playlist URL to determine the creator and title.
    :param download_audio: If True, download audio-only files; otherwise, download videos.
    :return: The folder path where the selected videos were saved as a string.
    :raises Exception: If there is an error during the download process.
    """
    output_folder = CONFIG['output_folder']
    
    try:
        with yt_dlp.YoutubeDL({'quiet': True, 'ffmpeg_location': ffmpeg_path, 'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt')}) as ydl:
            playlist_info = ydl.extract_info(playlist_url, download=False)
            playlist_creator = sanitize_filename(playlist_info.get('uploader', 'Unknown_Uploader'))
            playlist_title = sanitize_filename(playlist_info.get('title', 'Unknown Playlist'))

        playlist_folder = os.path.join(output_folder, playlist_creator, playlist_title)
        
        if download_audio:
            audio_folder = os.path.join(playlist_folder, 'mp3s')
            os.makedirs(audio_folder, exist_ok=True)
            playlist_folder = audio_folder 
        else:
            os.makedirs(playlist_folder, exist_ok=True)

        ydl_opts = {
            'ffmpeg_location': ffmpeg_path,
            'cookiefile': os.path.join(CONFIG['output_folder'], 'cookies.txt'),
            'quiet': False,
            'outtmpl': os.path.join(playlist_folder, '%(title)s.%(ext)s'),
            'format': 'bestaudio/best' if download_audio else 'bestvideo+bestaudio/best',
            'postprocessors': [],
        }

        if download_audio:
            ydl_opts['postprocessors'] = [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': CONFIG['audio_bitrate'].replace('k', ''),
                },
                {'key': 'FFmpegMetadata'}
            ]
        else:
            ydl_opts['postprocessors'] = [
                {'key': 'FFmpegMetadata'}
            ]
            ydl_opts['merge_output_format'] = 'mp4'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"Downloading selected videos from: {playlist_url}")
            ydl.download(selected_urls)

        if not download_audio:
            for file in os.listdir(playlist_folder):
                if file.endswith('.mp4'):
                    video_path = os.path.join(playlist_folder, file)
                    convert_audio_to_aac(video_path)

        print("Selected videos download complete!")
        return playlist_folder

    except Exception as e:
        print(f"Error occurred while downloading selected videos: {e}")
        return None


#@ ------------------------------ @#


#@ ----- Interactive CLI Menu ----- @#
"""
Functions for interactive CLI-based menu navigation and user input handling.
"""
def main_menu():
    """
    Main interactive CLI loop using a styled menu with combined options.
    """
    while True:
        table = Table(title="Main Menu", box=MINIMAL, show_header=True)
        table.add_column("Option", justify="center", style="bold red3")
        table.add_column("Description", justify="left", style="grey93")

        table.add_row("[1]", "Download YouTube URL")
        table.add_row("[2]", "Download an entire playlist")
        table.add_row("[3]", "Search YouTube by Keywords")
        table.add_row("[4]", "Selectively Download Videos from Playlist")
        table.add_row("[5]", "[navajo_white3]Open Downloads Folder[/navajo_white3]")
        table.add_row("[bold][[/bold]q[bold]][/bold]", "[bold red]Quit[/bold red]")

        console.print(table)

        choice = Prompt.ask("[bold italic]Choose an option[/bold italic]").strip().lower()

        if choice == '1':
            url = input("Enter YouTube URL: ").strip()
            modified_url = is_playlist(url)

            media_table = Table(title="Select Media Type", box=SIMPLE, show_header=False)
            media_table.add_column("Option", justify="center", style="bold red3")
            media_table.add_column("Type", justify="left", style="grey93")

            media_table.add_row("1", "Video")
            media_table.add_row("2", "Audio (MP3)")

            console.print(media_table)

            media_choice = Prompt.ask("[bold italic]Enter 1 for Video or 2 for Audio (MP3)[/bold italic]", choices=["1", "2"]).strip()

            if media_choice == '1':
                folder_path = download_video(modified_url)
            elif media_choice == '2':
                folder_path = download_best_audio(modified_url)

            post_download_menu(folder_path)

        elif choice == '2':
            url = input("Enter playlist URL: ").strip()
            media_table = Table(title="Select Media Type", box=SIMPLE, show_header=False)
            media_table.add_column("Option", justify="center", style="bold red3")
            media_table.add_column("Type", justify="left", style="grey93")

            media_table.add_row("[1]", "Video")
            media_table.add_row("[2]", "Audio (MP3)")

            console.print(media_table)

            media_choice = Prompt.ask("[bold italic]Enter 1 for Video or 2 for Audio (MP3)[/bold italic]", choices=["1", "2"]).strip()

            if media_choice == '1':
                folder_path = download_playlist(url, download_audio=False)
            elif media_choice == '2':
                folder_path = download_playlist(url, download_audio=True)

            post_download_menu(folder_path)

        elif choice == '3':
            keywords = input("Enter keywords to search for: ").strip()
            video_results = search_youtube_videos(keywords)
            if video_results:
                print("Search complete! Choose a video by index to download.")
                selected_index = input("Enter the index of the video to download: ").strip()

                if selected_index.isdigit():
                    selected_index = int(selected_index)
                    if 1 <= selected_index <= len(video_results):
                        selected_url = video_results[selected_index - 1][1]
                        media_table = Table(title="Select Media Type", box=SIMPLE, show_header=False)
                        media_table.add_column("Option", justify="center", style="bold red3")
                        media_table.add_column("Type", justify="left", style="grey93")

                        media_table.add_row("[1]", "Video")
                        media_table.add_row("[2]", "Audio (MP3)")

                        console.print(media_table)

                        media_choice = Prompt.ask("[bold italic]Enter 1 for Video or 2 for Audio (MP3)[/bold italic]", choices=["1", "2"]).strip()

                        if media_choice == '1':
                            folder_path = download_video(selected_url)
                        elif media_choice == '2':
                            folder_path = download_best_audio(selected_url)

                        post_download_menu(folder_path)

        elif choice == '4':
            url = input("Enter playlist URL: ").strip()
            selected_urls = select_videos_from_playlist(url)

            if selected_urls:
                media_table = Table(title="Select Media Type", box=SIMPLE, show_header=False)
                media_table.add_column("Option", justify="center", style="bold red3")
                media_table.add_column("Type", justify="left", style="grey93")
                media_table.add_row("[1]", "Video")
                media_table.add_row("[2]", "Audio (MP3)")

                console.print(media_table)

                media_choice = Prompt.ask("[bold italic]Enter 1 for Video or 2 for Audio (MP3)[/bold italic]", choices=["1", "2"]).strip()

                if media_choice == '1':
                    download_path = download_selected_videos(selected_urls, url, download_audio=False)
                elif media_choice == '2':
                    download_path = download_selected_videos(selected_urls, url, download_audio=True)

                if download_path:
                    print("Selected videos have been downloaded.")
                    post_download_menu(download_path)

        elif choice == '5':
            open_in_explorer(CONFIG['output_folder'])
            pass

        elif choice == 'q':
            console.print("[bold red]Exiting...[/bold red]")
            break

        else:
            console.print("[red]Invalid choice. Please try again.[/red]")

def post_download_menu(folder_path):
    """
    Options to display after a download is complete, using a styled menu.
    """
    while True:
        table = Table(title="Download Complete", box=MINIMAL, show_header=True)
        table.add_column("Option", justify="center", style="bold red3")
        table.add_column("Action", justify="left", style="grey93")

        table.add_row("[1]", "View in Explorer")
        table.add_row("[2]", "Return to Main Menu")
        table.add_row("[bold][[/bold]q[bold]][/bold]", "[bold red]Quit[/bold red]")

        console.print(table)

        choice = Prompt.ask("[bold italic]Choose an option[/bold italic]").strip().lower()

        if choice == '1':
            open_in_explorer(folder_path)
        elif choice == '2':
            return
        elif choice == 'q':
            console.print("[bold red]Exiting the program.[/bold red]")
            sys.exit(0)
        else:
            console.print("[red]Invalid option. Please try again.[/red]")

def show_progress_bar(d):
    """
    Display a progress bar during video download.

    :param d: Dictionary containing progress information.
    :return: None
    """
    if d['status'] == 'downloading':
        progress = d.get('downloaded_bytes', 0)
        total = d.get('total_bytes', 1)
        percent = (progress / total) * 100 if total else 0
        console.print(f"[cyan]Downloading:[/] {percent:.2f}% ({progress}/{total}) bytes", end='\r')
    elif d['status'] == 'finished':
        console.print("\n[green]Download complete![/]")

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
    
    if not os.path.exists(cookie_file_path):
        # console.print(f"[yellow]No cookies.txt file found in output folder.[/yellow]\n")
        cookie_exporter = CookieExporter(file_path=cookie_file_path, filter_domain="youtube.com")
        cookie_exporter.export_cookies_to_netscape()

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
