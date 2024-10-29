import yt_dlp
import subprocess
import os
import sys
import re

def supports_encoder(encoder_name):
    """Check if FFmpeg supports a specific encoder (e.g., h264_nvenc or h264_amf)."""
    try:
        result = subprocess.run(['ffmpeg', '-encoders'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return encoder_name in result.stdout
    except Exception:
        return False

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

def sanitize_filename(filename):
    """Replace special characters in filenames with underscores."""
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)

def list_available_qualities(url):
    # Fetch available formats and return only mp4 in a list with correct numbering
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        available_qualities = []
        seen_qualities = {}

        print("\nAvailable Qualities:")
        # Filter formats to include only mp4 formats with both video and audio
        mp4_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('ext') == 'mp4']
        
        # Track the last occurrence of each resolution and fps combination
        for f in mp4_formats:
            resolution = f.get('resolution', 'unknown')
            fps = f.get('fps', 'unknown')
            quality_info = {
                'format_id': f['format_id'],
                'resolution': resolution,
                'fps': fps,
                'ext': f.get('ext', 'mp4')
            }
            # Update seen_qualities to only keep the last occurrence
            seen_qualities[(resolution, fps)] = quality_info

        # Populate available_qualities with the unique last-seen entries
        available_qualities = list(seen_qualities.values())

        # Display the qualities with corrected numbering
        for idx, quality in enumerate(available_qualities, start=1):
            print(f"{idx}: {quality['resolution']} at {quality['fps']} fps")
        
        return available_qualities

def download_and_convert(url):
    # List available qualities and prompt user for selection
    available_qualities = list_available_qualities(url)

    # Loop until valid input is received
    while True:
        try:
            selected_index = int(input("\nEnter the number corresponding to your desired quality: ")) - 1
            if selected_index < 0 or selected_index >= len(available_qualities):
                raise ValueError("Invalid selection. Please choose a number from the list.")
            break
        except (ValueError, IndexError) as e:
            print("Please enter a valid number from the list.")

    selected_quality = available_qualities[selected_index]
    
    # Extract metadata for title and uploader
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        video_title = sanitize_filename(info.get('title', 'downloaded_video').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))
    
    # Create a folder named after the uploader
    folder_path = os.path.join(os.getcwd(), uploader_name)
    os.makedirs(folder_path, exist_ok=True)
    
    # Set output filenames based on title and uploader
    final_output = os.path.join(folder_path, f"{video_title}_{selected_quality['resolution']}.mp4")
    
    ydl_opts = {
        'format': f"{selected_quality['format_id']}+bestaudio/best",  # Combine selected video quality with best audio
        'outtmpl': final_output,                                      # Save to uploader's folder with quality in filename
        'merge_output_format': 'mp4',                                 # Merge video and audio into MP4
        'postprocessors': [
            {
                'key': 'FFmpegMetadata',  # Adds metadata to the final file
            }
        ],
    }
    
    # Download the video in the selected quality
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    print(f"Download complete! Video saved as {final_output}")

    # Determine the best available encoder based on GPU compatibility
    video_codec = get_best_encoder()

    # Prompt for AAC conversion
    convert_choice = input("Do you want to convert the audio to AAC for compatibility (This may take a few minutes)? (y/n): ").strip().lower()
    if convert_choice == 'y':
        # Convert to H.264 (using GPU if available) and AAC with enhanced settings
        aac_output = os.path.join(folder_path, f"{video_title}_{selected_quality['resolution']}_AAC.mp4")
        conversion_command = [
            'ffmpeg', '-i', final_output,
            '-c:v', video_codec, '-preset', 'slow', '-b:v', '10M',  # Use 10M bit-rate
            '-c:a', 'aac', '-b:a', '192k',                          # Convert Opus to AAC with a specified bitrate
            aac_output
        ]

        
        print("Converting to AAC audio format...")
        subprocess.run(conversion_command)
        print(f"Conversion complete! Video saved as {aac_output}")
        
        # Optional deletion of the original file after conversion
        delete_choice = input("Delete the original downloaded file? (y/n): ").strip().lower()
        if delete_choice == 'y' and os.path.exists(final_output):
            os.remove(final_output)
            print(f"Deleted the original file: {final_output}")
    else:
        print("AAC conversion skipped. The video is saved as-is.")

if __name__ == "__main__":
    # Check if a URL is provided as a command-line argument
    if len(sys.argv) > 1:
        video_url = sys.argv[1]
    else:
        # Prompt for URL if not provided
        video_url = input("Enter YouTube URL: ")
    
    download_and_convert(video_url)
