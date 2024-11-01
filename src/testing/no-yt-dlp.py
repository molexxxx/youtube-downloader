import re
import json
import requests
from urllib.parse import parse_qs, unquote
import logging

# Set up logging for debugging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

def get_js_url(video_url):
    logging.info(f"Fetching video page HTML for URL: {video_url}")
    response = requests.get(video_url)
    response.raise_for_status()
    js_pattern = r'"jsUrl":"([^"]+)"'
    js_match = re.search(js_pattern, response.text)
    
    if js_match:
        js_url = f"https://www.youtube.com{js_match.group(1)}"
        logging.info(f"JavaScript URL found: {js_url}")
        return js_url
    else:
        raise ValueError("Could not find JavaScript URL.")


def fetch_js_code(js_url):
    logging.info(f"Fetching JavaScript code from: {js_url}")
    response = requests.get(js_url)
    response.raise_for_status()
    return response.text


def extract_cipher_operations(js_code):
    logging.info("Extracting cipher operations from JavaScript code.")
    
    # Match the function that manipulates the signature
    func_name_pattern = r'(\w+)=function\(a\)\{a=a\.split\(""\);(.*?)return a\.join\(""\)\}'
    func_match = re.search(func_name_pattern, js_code)
    
    if not func_match:
        raise ValueError("Could not find cipher function.")
    
    func_name, operations = func_match.groups()
    logging.info(f"Cipher function name: {func_name}")
    logging.debug(f"Operations string: {operations}")

    # Extract transformations from the function definition
    # Example pattern; YouTube might obfuscate this differently
    op_pattern = r'\w+\.(\w+)\(\w+,\d+\)'
    operations_list = re.findall(op_pattern, operations)
    logging.info(f"Found operations: {operations_list}")
    
    return operations_list

def decipher_signature(signature, operations):
    logging.info(f"Deciphering signature: {signature}")
    signature = list(signature)

    for operation in operations:
        # Handle 'GR' as a reverse operation
        if operation == "GR":
            signature.reverse()
            logging.debug(f"Reversed signature: {''.join(signature)}")
        
        # Handle 'GH' as a swap operation
        elif operation.startswith("GH"):
            pos = int(re.search(r'\d+', operation).group())
            signature[0], signature[pos] = signature[pos], signature[0]
            logging.debug(f"Swapped position 0 with position {pos}: {''.join(signature)}")
        
        # Handle 'sp' as a slice operation
        elif operation.startswith("sp"):
            n = int(re.search(r'\d+', operation).group())
            signature = signature[n:]
            logging.debug(f"Sliced first {n} characters: {''.join(signature)}")
        

        else:
            logging.warning(f"Unhandled operation: {operation}")
    
    deciphered_signature = ''.join(signature)
    logging.info(f"Deciphered signature: {deciphered_signature}")
    return deciphered_signature



def fetch_video_url(video_url):
    js_url = get_js_url(video_url)
    js_code = fetch_js_code(js_url)
    operations = extract_cipher_operations(js_code)
    
    video_data = requests.get(video_url).text
    player_response_pattern = r'ytInitialPlayerResponse\s*=\s*({.*?});'
    player_response_match = re.search(player_response_pattern, video_data)
    
    if not player_response_match:
        raise ValueError("Could not extract player response.")
    
    player_response_json = json.loads(player_response_match.group(1))
    streaming_data = player_response_json.get('streamingData')
    
    if not streaming_data or 'formats' not in streaming_data:
        raise ValueError("Could not find video formats.")
    
    formats = streaming_data['formats']
    highest_quality_format = max(formats, key=lambda f: f.get('height', 0))
    
    if 'url' in highest_quality_format:
        video_url = highest_quality_format['url']
        logging.info("Direct video URL found.")
    elif 'signatureCipher' in highest_quality_format:
        cipher_data = parse_qs(highest_quality_format['signatureCipher'])
        base_url = unquote(cipher_data['url'][0])
        signature = cipher_data['s'][0]
        logging.info("Signature cipher found, deciphering required.")
        
        deciphered_signature = decipher_signature(signature, operations)
        video_url = f"{base_url}&sig={deciphered_signature}"
        logging.info(f"Constructed video URL: {video_url}")
    else:
        raise ValueError("No valid video URL found.")
    
    return video_url


def download_video(video_url):
    logging.info(f"Starting download from URL: {video_url}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com'
    }
    video_response = requests.get(video_url, headers=headers, stream=True)
    
    if video_response.status_code == 403:
        logging.warning("Access forbidden (403). Check signature or additional headers.")
        return
    
    file_name = "downloaded_video.mp4"
    with open(file_name, 'wb') as f:
        for chunk in video_response.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    logging.info(f"Download complete! Video saved as {file_name}")


if __name__ == "__main__":
    user_video_url = input("Enter YouTube URL: ")
    try:
        download_url = fetch_video_url(user_video_url)
        download_video(download_url)
    except Exception as e:
        logging.error(f"An error occurred: {e}")
