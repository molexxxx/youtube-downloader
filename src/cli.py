# File: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src\cli.py
# Project: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src
# Created Date: Tuesday November 5th 2024
# Author: Tony Wiedman
# -----
# Last Modified: Thu November 14th 2024 9:25:02 
# Modified By: Tony Wiedman
# -----
# Copyright (c) 2024 MolexWorks / Tone Web Design

import yt_dlp
import os
import re
import subprocess
import argparse


# Global Configuration
CONFIG = {
    "audio_bitrate": "256k",
    "ffmpeg_path": "ffmpeg",
    "output_folder": os.path.join(os.getcwd(), 'downloads')
}


def sanitize_filename(filename):
    """Replace special characters in filenames with underscores."""
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)


def list_available_qualities(url):
    """Fetch and display available video qualities for a given YouTube URL."""
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
    """Download video from URL in selected quality and save to output folder."""
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

    # check if audio is in AAC format and convert if necessary
    convert_audio_to_aac(final_output)


def convert_audio_to_aac(video_path):
    """Check if video audio is AAC and convert to AAC if it's not."""
    
    # probe command to check the current audio codec
    probe_command = [
        CONFIG['ffmpeg_path'], '-i', video_path, '-hide_banner', '-loglevel', 'error', 
        '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1'
    ]
    
    codec = subprocess.run(probe_command, capture_output=True, text=True).stdout.strip()
    
    # If codec is not AAC, convert it to AAC
    if codec != "aac":
        print(f"Audio codec is '{codec}'. Converting to AAC...")
        aac_output = video_path.replace('.mp4', '_aac.mp4')
        
        convert_command = [
            CONFIG['ffmpeg_path'], '-i', video_path, '-c:v', 'copy', '-c:a', 'aac',
            '-b:a', CONFIG['audio_bitrate'], '-y', aac_output
        ]
        
        # Run the conversion command
        subprocess.run(convert_command, check=True)
        
        os.replace(aac_output, video_path)
        print(f"Conversion to AAC complete. File saved as {video_path}")
    else:
        print("Audio is already in AAC format. No conversion needed.")



def download_best_audio(url):
    """Download the best audio from a URL and convert to MP3 with metadata."""
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        audio_title = sanitize_filename(info.get('title', 'downloaded_audio').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))

    folder_path = os.path.join(CONFIG['output_folder'], uploader_name, 'mp3s')
    os.makedirs(folder_path, exist_ok=True)

    mp3_output = os.path.join(folder_path, f"{audio_title}")

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': mp3_output,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': CONFIG['audio_bitrate'].replace('k', ''),
        }, {
            'key': 'FFmpegMetadata'
        }],
    }
    
    if CONFIG['ffmpeg_path'] != "ffmpeg":
        ydl_opts['ffmpeg_location'] = CONFIG['ffmpeg_path']

    # Download the audio and convert to MP3 with metadata
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    print(f"Download complete! Audio saved as {mp3_output}")



def main_menu():
    """Main interactive CLI loop."""
    while True:
        print("\nMain Menu:")
        print("  [1] Download a new video")
        print("  [2] Download audio as MP3")
        print("  [q] Quit")
        
        choice = input("Choose an option: ").strip().lower()
        
        if choice == '1':
            url = input("Enter YouTube URL: ").strip()
            download_video(url)
        elif choice == '2':
            url = input("Enter YouTube URL: ").strip()
            download_best_audio(url)
        elif choice == 'q':
            print("Exiting the program.")
            break
        else:
            print("Invalid option. Please try again.")


if __name__ == "__main__":
    # Argument Parsing
    parser = argparse.ArgumentParser(description="YouTube Downloader")
    parser.add_argument('url', nargs='?', help="URL of the YouTube video")
    args = parser.parse_args()

    if args.url:
        # If URL is passed via command-line argument
        print(f"Downloading video or audio from: {args.url}")
        print("Choose option:")
        print("[1] Download video")
        print("[2] Download audio (MP3)")

        choice = input("Choose an option: ").strip()
        if choice == '1':
            download_video(args.url)
        elif choice == '2':
            download_best_audio(args.url)
        else:
            print("Invalid option. Exiting...")
    else:
        # Interactive menu when no URL is passed
        main_menu()