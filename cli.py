import yt_dlp
import subprocess
import os
import sys
import re

#@ ------------------------------- Global Configuration -------------------------------

CONFIG = {
    "video_bitrate": "10M",
    "audio_bitrate": "192k",
    "conversion_preset": "slow",
    "ffmpeg_path": "ffmpeg",
    "output_folder": os.path.join(os.getcwd(), 'downloads')
}

#@ ------------------------------- Utility Functions -------------------------------

#! --
def supports_encoder(encoder_name):
    """Check if FFmpeg supports a specific encoder (e.g., h264_nvenc or h264_amf)."""
    try:
        result = subprocess.run([CONFIG['ffmpeg_path'], '-encoders'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return encoder_name in result.stdout
    except Exception:
        return False

#! --
def get_best_encoder():
    """Determine the best available encoder based on GPU compatibility."""
    if supports_encoder('h264_nvenc'):
        print("NVIDIA GPU detected. Using h264_nvenc for encoding.")
        return 'h264_nvenc'
    elif supports_encoder('h264_amf'):
        print("AMD GPU detected. Using h264_amf for encoding.")
        return 'h264_amf'
    else:
        print("No compatible GPU detected. Falling back to CPU encoding (libx264).")
        return 'libx264'

#! --
def sanitize_filename(filename):
    """Replace special characters in filenames with underscores."""
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)

#! --
def check_audio_codec(filepath):
    """Check if the audio codec of the downloaded video file is AAC."""
    try:
        result = subprocess.run([CONFIG['ffmpeg_path'], '-i', filepath], stderr=subprocess.PIPE, text=True)
        return "aac" in result.stderr
    except Exception as e:
        print(f"Error checking audio codec: {e}")
        return False

#@ --------------------------- yt-dlp Specific Functions ---------------------------

#! --
def list_available_qualities(url):
    """Fetch and display available video qualities for a given YouTube URL."""
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        seen_qualities = {}

        print("\nAvailable Qualities:")
        mp4_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('ext') == 'webm']

        for f in mp4_formats:
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

#! --
def download_and_convert(url):
    """Download video from URL in user-selected quality, with optional audio conversion."""
    available_qualities = list_available_qualities(url)
    
    while True:
        try:
            selected_index = int(input("\nEnter the number corresponding to your desired quality: ")) - 1
            if selected_index < 0 or selected_index >= len(available_qualities):
                raise ValueError("Invalid selection. Please choose a number from the list.")
            break
        except (ValueError, IndexError):
            print("Please enter a valid number from the list.")

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

    video_codec = get_best_encoder()
    if check_audio_codec(final_output):
        print("Audio is already in AAC format. Skipping AAC conversion.")
    else:
        convert_choice = input("Do you want to convert the audio to AAC for compatibility? (y/n): ").strip().lower()
        if convert_choice == 'y':
            aac_output = os.path.join(folder_path, f"{video_title}_{selected_quality['resolution']}_AAC.mp4")
            conversion_command = [
                CONFIG['ffmpeg_path'], '-i', final_output,
                '-c:v', video_codec, '-preset', CONFIG['conversion_preset'], '-b:v', CONFIG['video_bitrate'],
                '-c:a', 'aac', '-b:a', CONFIG['audio_bitrate'],
                aac_output
            ]

            print("Converting to AAC audio format...")
            subprocess.run(conversion_command)
            print(f"Conversion complete! Video saved as {aac_output}")
            
            delete_choice = input("Delete the original downloaded file? (y/n): ").strip().lower()
            if delete_choice == 'y' and os.path.exists(final_output):
                os.remove(final_output)
                print(f"Deleted the original file: {final_output}")
        else:
            print("AAC conversion skipped. The video is saved as-is.")

#@ ------------------------------- Main Script Execution ---------------------------

if __name__ == "__main__":
    """Main script execution for downloading and converting video from a URL."""
    print("""
    ===============================
    YouTube Downloader CLI
    ===============================
    Configuration Settings:
    Video Bitrate: {video_bitrate}
    Audio Bitrate: {audio_bitrate}
    Conversion Preset: {conversion_preset}
    FFmpeg Path: {ffmpeg_path}
    Output Folder: {output_folder}
    ===============================
    """.format(**CONFIG))

    if len(sys.argv) > 1:
        video_url = sys.argv[1]
    else:
        video_url = input("Enter YouTube URL: ")
    
    download_and_convert(video_url)
