import re
import os
import sys
import json
import requests
import subprocess
from urllib.parse import urlparse
import logging
import urllib3
import time

urllib3.disable_warnings()

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.youtube.com/',
    'Origin': 'https://www.youtube.com'
}

PROXY_URL = 'http://localhost:8443/video'

session = requests.Session()


def fallback_quality(formats):
    """
    Fallback to a lower video quality if download fails.
    """
    print("\nDownload failed. You can choose a different quality level.")
    return select_streams(formats)


def get_js_url(video_url):
    """
    Get JavaScript URL and client version from the video page.
    """
    logging.info(f"Fetching video page HTML for URL: {video_url}")
    response = session.get(video_url, headers=HEADERS, verify=False)
    response.raise_for_status()
    
    js_pattern = r'(?:("jsUrl"|"PLAYER_JS_URL"))\s*:\s*"([^"]+)"'
    js_match = re.search(js_pattern, response.text)
    
    client_version_pattern = r'"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"'
    client_version_match = re.search(client_version_pattern, response.text)
    
    if client_version_match:
        client_version = client_version_match.group(1)
        logging.info(f"Client version found: {client_version}")
    else:
        client_version = '2.20241107.11.00'
        logging.warning("Client version not found. Using fallback version.")
    
    if js_match:
        js_url = f"https://www.youtube.com{js_match.group(2)}"
        logging.info(f"JavaScript URL found: {js_url}")
        return js_url, client_version
    else:
        raise ValueError("Could not find JavaScript URL.")


def fetch_js_code(js_url):
    """
    Fetch JavaScript code from the provided URL.
    """
    logging.info(f"Fetching JavaScript code from: {js_url}")
    response = session.get(js_url, headers=HEADERS, verify=False)
    response.raise_for_status()
    return response.text


def extract_cipher_operations(js_code):
    logging.info("Extracting cipher operations from JavaScript code.")
    func_name_pattern = r'\b([a-zA-Z0-9$]{2})\(\w\)\{(?:var\s+\w|this)\.reverse'
    func_name_match = re.search(func_name_pattern, js_code)
    if not func_name_match:
        raise ValueError("Cipher function name not found.")
    
    func_name = func_name_match.group(1)
    logging.info(f"Cipher function name: {func_name}")

    func_pattern = rf'{re.escape(func_name)}:function\(\w\)\{{(.*?)\}}'
    func_body_match = re.search(func_pattern, js_code, re.DOTALL)
    if not func_body_match:
        raise ValueError("Cipher function body not found.")
    
    func_body = func_body_match.group(1)
    operations_list = []
    
    if 'reverse' in func_body:
        operations_list.append(('reverse',))
    if 'splice' in func_body:
        operations_list.append(('splice', int(re.search(r'splice\((\d+)\)', func_body).group(1))))
    if 'swap' in func_body:
        operations_list.append(('swap', int(re.search(r'swap\((\d+)\)', func_body).group(1))))
    
    logging.info(f"Extracted cipher operations: {operations_list}")
    return operations_list


def fetch_video_url(video_url):
    """
    Fetch the direct video URL for the provided YouTube video.
    """
    js_url, client_version = get_js_url(video_url)
    js_code = fetch_js_code(js_url)
    operations = extract_cipher_operations(js_code)
    
    logging.info(f"Fetching video page again for player response: {video_url}")
    video_data = session.get(video_url, headers=HEADERS, verify=False)
    video_data.raise_for_status()
    player_response_pattern = r'ytInitialPlayerResponse\s*=\s*({.*?});'
    player_response_match = re.search(player_response_pattern, video_data.text)
    
    if not player_response_match:
        logging.error("Could not extract player response from video page.")
        raise ValueError("Could not extract player response.")
    
    player_response_json = json.loads(player_response_match.group(1))
    streaming_data = player_response_json.get('streamingData')
    video_title = player_response_json.get('videoDetails', {}).get('title', 'video')
    
    # Sanitize video title to make it filename safe
    video_title = sanitize_filename(video_title)
    
    if not streaming_data or 'adaptiveFormats' not in streaming_data:
        logging.error("Could not find video formats in player response.")
        raise ValueError("Could not find video formats.")
    
    formats = streaming_data['adaptiveFormats']
    video_stream, audio_stream = select_streams(formats)
    
    video_url = video_stream['url'] if 'url' in video_stream else None
    audio_url = audio_stream['url'] if 'url' in audio_stream else None

    if not video_url or not audio_url:
        logging.error("Could not find both video and audio URLs.")
        raise ValueError("Could not find both video and audio URLs.")
    
    logging.info(f"Video URL: {video_url}")
    logging.info(f"Audio URL: {audio_url}")
    
    return video_url, audio_url, formats, session.cookies.get_dict(), video_title


def select_streams(formats):
    video_options = []
    audio_options = []

    for index, fmt in enumerate(formats):
        # Get MIME type and codec information
        mime_type = fmt.get("mimeType", "").split(";")[0]
        codec_info = re.search(r'codecs="([^"]+)"', fmt.get("mimeType", ""))
        codecs = codec_info.group(1) if codec_info else "Unknown Codecs"
        quality_label = fmt.get("qualityLabel", "Unknown Quality")
        bitrate = fmt.get("bitrate")

        # Categorize video and audio options
        if mime_type.startswith("video/"):
            video_options.append({
                "index": index,
                "description": f"{quality_label} ({mime_type}; codecs=\"{codecs}\")"
            })
        elif mime_type.startswith("audio/") and "webm" not in mime_type:
            audio_options.append({
                "index": index,
                "description": f"Bitrate {bitrate} ({mime_type}; codecs=\"{codecs}\")"
            })

    print("\nAvailable Video Qualities:")
    for option in video_options:
        print(f"{option['index']}: {option['description']}")

    video_index = int(input("Select video quality index: "))

    print("\nAvailable Audio Qualities:")
    for option in audio_options:
        print(f"{option['index']}: {option['description']}")

    audio_index = int(input("Select audio quality index: "))

    video_stream = formats[video_index]
    audio_stream = formats[audio_index]

    return video_stream, audio_stream


def download_stream_sequential(url, output_path, cookies, max_retries=5):
    logging.info(f"Starting download from URL: {url}")

    headers = HEADERS.copy()
    parsed_url = urlparse(url)
    googlevideo_host = parsed_url.netloc

    headers.update({'Host': googlevideo_host})

    retries = 0
    while retries < max_retries:
        try:
            response = requests.get(url, headers=headers, stream=True, verify=False, timeout=60)
            response.raise_for_status()

            content_length = int(response.headers.get('Content-Length', 0))
            with open(output_path, 'ab') as f:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)

            if os.path.getsize(output_path) >= content_length:
                logging.info(f"Download complete! File saved as {output_path}")
                break
        except Exception as e:
            retries += 1
            logging.error(f"Download error: {e}. Retrying ({retries}/{max_retries})")
            time.sleep(2 ** retries)

            if retries == max_retries:
                logging.error(f"Failed to download {url} after {max_retries} attempts.")
                raise ValueError(f"Failed to download {url}")


def sanitize_filename(filename):
    """
    Sanitize the filename by removing any invalid characters.
    """
    return re.sub(r'[<>:"/\\|?*]', '_', filename)


def convert_to_mp3(input_path, output_path, max_retries=3):
    """
    Convert audio to MP3 format using FFmpeg.
    """
    logging.info(f"Converting audio to MP3: {input_path} -> {output_path}")
    command = [
        'ffmpeg',
        '-i', input_path,
        '-vn',  # No video
        '-c:a', 'libmp3lame',
        '-b:a', '192k', 
        '-y', 
        output_path
    ]

    retries = 0
    while retries < max_retries:
        try:
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            logging.info(f"Conversion to MP3 complete: {output_path}")
            logging.debug(result.stdout)
            return
        except subprocess.CalledProcessError as e:
            logging.error(f"Error during MP3 conversion on attempt {retries + 1}: {e}")
            logging.debug(f"FFmpeg stderr: {e.stderr}")
            retries += 1
            if retries < max_retries:
                logging.info(f"Retrying MP3 conversion in {2 ** retries} seconds...")
                time.sleep(2 ** retries)
    
    raise ValueError("MP3 conversion failed after multiple attempts.")


def main():
    youtube_url = input("Enter YouTube URL: ").strip()

    try:
        video_url, audio_url, formats, cookies, video_title = fetch_video_url(youtube_url)

        video_ext = video_url.split("mime=")[-1].split('%2F')[1].split('&')[0]
        audio_ext = "mp3" 
        video_filename = f"{video_title}_video.{video_ext}"
        raw_audio_filename = f"{video_title}_raw_audio.webm"
        audio_filename = f"{video_title}_audio.{audio_ext}"

        try:
            download_stream_sequential(video_url, video_filename, cookies)
        except ValueError:
            video_stream, audio_stream = fallback_quality(formats)
            video_url = video_stream['url']
            download_stream_sequential(video_url, video_filename, cookies)

        download_stream_sequential(audio_url, raw_audio_filename, cookies)
        convert_to_mp3(raw_audio_filename, audio_filename)

        logging.info(f"Process complete! Video saved as '{video_filename}' and audio saved as '{audio_filename}'")

    except Exception as e:
        logging.error(f"An error occurred: {e}")


if __name__ == "__main__":
    main()
