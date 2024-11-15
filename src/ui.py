# File: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src\ui.py
# Project: c:\Users\tonyw\Desktop\YouTube DL\youtube-downloader\src
# Created Date: Tuesday November 5th 2024
# Author: Tony Wiedman
# -----
# Last Modified: Thu November 14th 2024 9:25:19 
# Modified By: Tony Wiedman
# -----
# Copyright (c) 2024 MolexWorks / Tone Web Design


#@ ------------------------------ Global Imports and Dependencies -------------------------------


import os, sys, re, json, time, threading, subprocess, webbrowser
import yt_dlp
import yt_dlp.utils
import customtkinter as ctk
from tkinter import (
    StringVar,
    filedialog,
    BooleanVar,
)
try:
    from PIL import Image, ImageTk
except ImportError as e:
    print(f"Import error: {e}")
from CTkMessagebox import CTkMessagebox




#@ ------------------------------ Global Settings and Variables -------------------------------


# * --- File and Path Management

def resource_path(relative_path):
    """Access bundled files for PyInstaller."""
    try:
        base_path = sys._MEIPASS  # temporary files
    except AttributeError:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def sanitize_filename(filename):
    """Replace special characters in filenames with underscores."""
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)


# * --- Global Variables
audio_bitrate = '256k'
ffmpeg_path = 'ffmpeg'
output_folder = os.path.join(os.getcwd(), 'downloads')


# * --- CTkinter Settings and Initialization
ctk.set_appearance_mode("dark")
app = ctk.CTk()

icon_image = Image.open(resource_path("icons/yt-ico.ico"))
app.wm_iconbitmap()
app.iconphoto(False, ImageTk.PhotoImage(icon_image))

app.title("YouTube Video Downloader")
app.geometry("650x250")
app.resizable(False, False)

# * --- CTkinter variables
save_mp3_var = BooleanVar(value=False) 
progress = ctk.DoubleVar(value=0.0)
progress_label = StringVar(value="Ready")
estimated_time_remaining = StringVar(value="")


# * --- Settings Management

settings_window = None

def load_settings():
    global audio_bitrate, ffmpeg_path, output_folder
    settings_path = 'settings.json'
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r') as f:
                if os.path.getsize(settings_path) == 0:
                    raise ValueError("settings.json is empty.")
                settings = json.load(f)
                output_folder = settings.get('output_folder', None)
                if output_folder:
                    output_folder = os.path.expandvars(output_folder)

                audio_bitrate = settings.get('audio_bitrate', '256k')
                ffmpeg_path = settings.get('ffmpeg_path', 'ffmpeg')
        except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
            print(f"Error loading settings: {e}")
    else:
        # Set default values
        output_folder = os.path.join(os.getcwd(), 'downloads')
        audio_bitrate = '256k'
        ffmpeg_path = 'ffmpeg'
        os.makedirs(output_folder, exist_ok=True)


def open_settings():
    global settings_window
    if settings_window is not None:
        settings_window.lift()
        return

    settings_window = ctk.CTkToplevel(app)
    settings_window.title("Settings")
    settings_window.geometry("400x522")
    settings_window.attributes('-topmost', True)
    settings_window.resizable(False, False)
    settings_window.wm_iconbitmap()
    settings_window.after(222, lambda: settings_window.iconphoto(False, ImageTk.PhotoImage(icon_image)))

    def on_close():
        global settings_window
        settings_window.destroy()
        settings_window = None

    settings_window.protocol("WM_DELETE_WINDOW", on_close)
    settings_container = ctk.CTkFrame(settings_window, fg_color="#2E2E2E", bg_color="#2E2E2E")
    settings_container.pack(padx=10, pady=10, fill="both", expand=True)

    # FFmpeg Path input
    ctk.CTkLabel(settings_container, text="FFmpeg Path:", text_color="#FFFFFF").pack(pady=10, padx=10) 
    ffmpeg_entry = ctk.CTkEntry(settings_container, width=50, fg_color="#3D3D3D")
    ffmpeg_entry.pack(pady=5, padx=10, fill='x')
    ffmpeg_entry.insert(0, ffmpeg_path)

    browse_ffmpeg_button = create_button(
        settings_container, 
        "Browse..", 
        resource_path("icons/browse.png"), 
        lambda: select_ffmpeg(ffmpeg_entry),
        icon_position="right"
    )
    browse_ffmpeg_button.pack(pady=5, padx=10)

    # Check FFmpeg installation
    ffmpeg_status_label = ctk.CTkLabel(settings_container, text="", text_color="#FFFFFF")
    ffmpeg_status_label.pack(pady=5, padx=10) 

    def check_ffmpeg():
        if check_ffmpeg_installed():
            ffmpeg_status_label.configure(text="FFmpeg is installed and reachable.", text_color="green")
        else:
            ffmpeg_status_label.configure(text="FFmpeg is NOT installed or not reachable.", text_color="red")
            show_info_message("FFmpeg Not Found", "FFmpeg is not installed or not reachable. You can download it from the official website: https://ffmpeg.org/download.html")
            webbrowser.open("https://ffmpeg.org/download.html")

    check_button = create_button(
        settings_container, 
        "Check FFmpeg", 
        resource_path("icons/test.png"), 
        check_ffmpeg,
        icon_position="left"
    )
    check_button.pack(pady=5, padx=10)

    # Output Folder input
    ctk.CTkLabel(settings_container, text="Output Folder:", text_color="#FFFFFF").pack(pady=10, padx=10) 
    output_folder_entry = ctk.CTkEntry(settings_container, width=50, fg_color="#3D3D3D")
    output_folder_entry.pack(pady=5, padx=10, fill='x') 
    output_folder_entry.insert(0, output_folder)

    browse_output_button = create_button(
        settings_container, 
        "Browse..", 
        resource_path("icons/browse.png"), 
        lambda: select_output_folder(output_folder_entry),
        icon_position="right"
    )
    browse_output_button.pack(pady=5, padx=10) 

    # Audio Bitrate input (Combobox)
    ctk.CTkLabel(settings_container, text="Audio Bitrate:", text_color="#FFFFFF").pack(pady=10, padx=10)
    audio_bitrate_combobox = ctk.CTkComboBox(settings_container, values=["128k", "256k", "256k"], width=150)
    audio_bitrate_combobox.pack(pady=5, padx=10, fill='x')
    audio_bitrate_combobox.set(audio_bitrate)

    def save_settings():
        global audio_bitrate, ffmpeg_path, output_folder
        audio_bitrate = audio_bitrate_combobox.get()
        ffmpeg_path = ffmpeg_entry.get()
        output_folder = output_folder_entry.get()

        # Save settings to a JSON file
        settings = {
            'audio_bitrate': audio_bitrate,
            'ffmpeg_path': ffmpeg_path,
            'output_folder': output_folder
        }

        with open('settings.json', 'w') as f:
            json.dump(settings, f, indent=4)

        show_info_message("Settings Saved", "Your settings have been saved.")

    save_button = create_button(
        settings_container, 
        "Save Settings", 
        resource_path("icons/save.png"), 
        save_settings,
        icon_position="left"
    )
    save_button.pack(pady=10, padx=10) 




#@ ------------------------------- Utility Functions -------------------------------


# * --- FFmpeg Support and Path Checking

def supports_encoder(encoder_name):
    """Check if a specific encoder is supported by FFmpeg."""
    try:
        result = subprocess.run([ffmpeg_path, '-encoders'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return encoder_name in result.stdout
    except Exception:
        return False

def get_ffmpeg_path():
    """Retrieve the path to the FFmpeg executable if installed.""" 
    try:
        result = subprocess.run(["where", "ffmpeg"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            ffmpeg_paths = result.stdout.strip().split("\n")
            return ffmpeg_paths[0]  
    except Exception as e:
        print(f"Error finding FFmpeg: {e}")
    return None 

def get_best_encoder():
    """Determine the best available encoder based on platform and GPU compatibility."""
    if sys.platform.startswith('linux'):
        return 'libx264'
    elif supports_encoder('h264_nvenc'):
        return 'h264_nvenc'
    elif supports_encoder('h264_amf'):
        return 'h264_amf'
    else:
        return 'libx264'

def check_ffmpeg_installed():
    """Check if FFmpeg is installed and reachable."""
    try:
        result = subprocess.run([ffmpeg_path, '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return "ffmpeg" in result.stdout.lower()
    except Exception:
        return False


# * --- Video and Audio Validation

def is_valid_youtube_url(url):
    """Check if the URL is a valid YouTube video URL in either standard or shortened format, excluding playlists."""
    
    if 'list=' in url:
        show_playlist_window()
        return False
    youtube_video_pattern = r"^(https://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})(?:[?&]|$)"
    match = re.match(youtube_video_pattern, url)
    
    if not match:
        show_warning_message(
            "Invalid URL", 
            "The provided YouTube URL is not in a valid format.",
            retry_callback=retry_url_entry
        )
        return False
    try:
        with yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True}) as ydl:
            ydl.extract_info(url, download=False)
        return True

    except yt_dlp.utils.DownloadError:
        show_warning_message(
            "Invalid Video",
            "The provided YouTube video could not be accessed. Please check the URL.",
            retry_callback=retry_url_entry
        )
        return False

def retry_url_entry():
    """Callback to reset the UI when retrying an invalid URL."""
    app.after(100, perform_reset)
  
def check_audio_codec(filepath):
    """Check if the audio codec of the downloaded file is AAC."""
    try:
        result = subprocess.run([ffmpeg_path, '-i', filepath], stderr=subprocess.PIPE, text=True)
        return "aac" in result.stderr
    except Exception:
        return False





#@ --------------------------- yt-dlp Functions ---------------------------


# * --- Download Handling and Quality Options

def list_available_qualities(url):
    """Fetch available video qualities from a YouTube URL."""
    try:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = info.get('formats', [])
            
            webm_formats = [
                f for f in formats
                if f.get('vcodec') != 'none' and f.get('ext') == 'webm'
            ]

            seen_qualities = {}
            for f in webm_formats:
                resolution = f.get('resolution', 'unknown')
                fps = f.get('fps', 'unknown')
                # Avoid duplicates by creating unique keys based on resolution and fps
                if (resolution, fps) not in seen_qualities:
                    seen_qualities[(resolution, fps)] = {
                        'format_id': f['format_id'],
                        'resolution': resolution,
                        'fps': fps,
                        'ext': f.get('ext', 'webm')
                    }

            return list(seen_qualities.values())

    except yt_dlp.utils.DownloadError as e:
        print(f"DownloadError: {e}") 
        show_warning_message("Invalid URL", "The provided YouTube URL could not be accessed.")
        return []


def download_and_convert(url, quality_index):
    """Download and convert video based on selected quality."""
    available_qualities = list_available_qualities(url)
    selected_quality = available_qualities[quality_index]

    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        video_title = sanitize_filename(info.get('title', 'downloaded_video').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))
        duration = info.get('duration', 0)

    full_output_folder = os.path.join(output_folder, uploader_name)
    os.makedirs(full_output_folder, exist_ok=True)
    
    final_output = os.path.join(full_output_folder, f"{video_title}_{selected_quality['resolution']}.mp4")

    def start_download_after_confirmation():
        ydl_opts = {
            'format': f"{selected_quality['format_id']}+bestaudio/best",
            'outtmpl': final_output,
            'merge_output_format': 'mp4',
            'progress_hooks': [progress_hook],
            'postprocessors': [{'key': 'FFmpegMetadata'}],
            'logger': YTDLLogger()
        }

        progress_label.set("Starting download...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        if save_mp3_var.get(): 
            progress_label.set("Downloading MP3...") 
            save_mp3(full_output_folder, video_title, url) 

        prompt_audio_conversion(final_output, full_output_folder, video_title, selected_quality['resolution'], duration)

    if os.path.exists(final_output):
        def confirm_overwrite():
            os.remove(final_output)
            start_download_after_confirmation()

        def cancel_overwrite():
            if not check_audio_codec(final_output):
                prompt_audio_conversion(final_output, full_output_folder, video_title, selected_quality['resolution'], duration)
            else:
                finalize_download(full_output_folder)

        show_yes_no(
            title="File Exists",
            message=f"The file '{final_output}' already exists. Do you want to overwrite it?",
            confirm_callback=confirm_overwrite,
            cancel_callback=cancel_overwrite
        )
    else:
        start_download_after_confirmation()


# * --- Audio Extraction and Conversion

def save_mp3(folder_path, video_title, url):
    """Save the audio as an MP3 file in a separate directory."""
    mp3_folder = os.path.join(folder_path, "mp3s")
    os.makedirs(mp3_folder, exist_ok=True)

    sanitized_title = sanitize_filename(video_title)
    mp3_output = os.path.join(mp3_folder, sanitized_title)

    if os.path.exists(mp3_output):
        def cancel_overwrite():
            return

        show_yes_no(
            title="File Exists",
            message=f"The MP3 file '{mp3_output}' already exists. Do you want to overwrite it?",
            confirm_callback=lambda: os.remove(mp3_output),
            cancel_callback=cancel_overwrite
        )

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': mp3_output, 
        'postprocessors': [{
            'key': 'FFmpegExtractAudio', 
            'preferredcodec': 'mp3',
            'preferredquality': '256',
        }, {
            'key': 'FFmpegMetadata',
        }],
        'logger': YTDLLogger()  
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

def prompt_audio_conversion(filepath, folder_path, video_title, resolution, duration):
    """Prompt the user to convert audio to AAC if needed and proceed with conversion or finalize."""
    if not check_audio_codec(filepath):
        def confirm_conversion():
            threading.Thread(target=convert_audio_to_aac, args=(filepath, folder_path, video_title, resolution, duration)).start()

        def cancel_conversion():
            finalize_download(folder_path)

        show_yes_no(
            title="Convert Audio to AAC",
            message="The audio codec is not AAC. Do you want to convert it to AAC for better compatibility?",
            confirm_callback=confirm_conversion,
            cancel_callback=cancel_conversion
        )
    else:
        finalize_download(folder_path)
  
def convert_audio_to_aac(filepath, folder_path, video_title, resolution, duration):
    """Convert only the audio to AAC while preserving the original video quality by specifying codecs explicitly."""
    aac_output = os.path.join(folder_path, f"{video_title}_{resolution}_AAC.mp4")

    if os.path.exists(aac_output):
        def cancel_overwrite():
            finalize_download(folder_path)

        def confirm_overwrite():
            os.remove(aac_output)

        show_yes_no(
            title="File Exists",
            message=f"The AAC file '{aac_output}' already exists. Do you want to overwrite it?",
            confirm_callback=confirm_overwrite,
            cancel_callback=cancel_overwrite
        )

    conversion_command = [
        ffmpeg_path, '-y', '-i', filepath,
        '-c:v', 'copy',  # Keep the original video quality without re-encoding
        '-c:a', 'aac', '-b:a', audio_bitrate,  # Convert only audio to AAC
        aac_output
    ]

    progress.set(0.0)
    estimated_time_remaining.set("")

    try:
        creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        process = subprocess.Popen(
            conversion_command,
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            creationflags=creation_flags
        )

        for line in process.stderr:
            time_match = re.search(r'time=(\d+:\d+:\d+\.\d+)', line)
            if time_match:
                current_time = time_match.group(1)
                h, m, s = map(float, current_time.split(':'))
                elapsed_time = h * 3600 + m * 60 + s
                conversion_progress = min(elapsed_time / duration, 1.0)
                progress.set(conversion_progress)

                remaining_time = (duration - elapsed_time) / (conversion_progress + 1e-5)
                mins, secs = divmod(int(remaining_time), 60)

                settings_message = (f"Using codec: copy (video), AAC (audio) | "
                                    f"Audio Bitrate: {audio_bitrate} | "
                                    f"Estimated time left: {mins}m {secs}s")
                estimated_time_remaining.set(settings_message)

        stdout, stderr = process.communicate()
        if process.returncode == 0:
            os.remove(filepath) 
            finalize_download(folder_path)
        else:
            show_error_message("Conversion Error", f"An error occurred during audio conversion:\n{stderr if stderr else stdout}")
    except Exception as e:
        show_error_message("Execution Error", f"Error during conversion: {e}")
        finalize_download(folder_path)


# * --- Finalization and Progress

def finalize_download(folder_path):
    """Finalize the download process and update the UI."""
    progress_and_status_panel.pack_forget()
    final_options_panel.pack(pady=10)
    view_button.configure(command=lambda: open_in_explorer(folder_path))

def progress_hook(d):
    """Handle download progress and update GUI.""" 
    if d['status'] == 'downloading':
        downloaded = d.get('downloaded_bytes', 0)
        total = d.get('total_bytes', 1)
        speed = d.get('speed', 0) if d.get('speed') is not None else 0
        eta = d.get('eta', 0) if d.get('eta') is not None else 0 

        progress.set(downloaded / total)

        speed_str = f"{speed / 1024 / 1024:.2f} MiB/s" if speed > 0 else "0.00 MiB/s"

        # Calculate ETA
        if speed > 0:
            remaining_time = (total - downloaded) / speed
            eta_str = time.strftime("%H:%M:%S", time.gmtime(remaining_time))
        else:
            eta_str = "0:00:00"

        status_message = f"{downloaded / 1024 / 1024:.2f} MiB at {speed_str} ETA: {eta_str}"

        if len(status_message) > 69:
            status_message = status_message[:47] + "..."

        progress_label.set(status_message)
    
    elif d['status'] == 'finished':
        progress.set(1.0)
        progress_label.set("Download complete, processing...")




#@ ----------------------------- GUI Control Functions -----------------------------


# * --- Navigation and Button Functions

def open_in_explorer(folder_path):
    folder_path = os.path.abspath(folder_path)
    folder_path = os.path.normpath(folder_path)

    if not os.path.exists(folder_path):
        def create_folder():
            try:
                os.makedirs(folder_path)
                show_info_message("Folder Created", f"The folder '{folder_path}' has been created.")
            except Exception as e:
                show_error_message("Error", f"Could not create the folder: {e}")

        show_yes_no(
            title="Folder Not Found",
            message=f"The folder '{folder_path}' does not exist. Would you like to create it?",
            confirm_callback=create_folder
        )
        return

    try:
        if sys.platform == 'win32':
            subprocess.Popen(['explorer', folder_path])
        if sys.platform == 'darwin':
            subprocess.Popen(['open', folder_path])
        if sys.platform.startswith('linux'):
            subprocess.Popen(['xdg-open', folder_path])
    except Exception as e:
        show_error_message("Error", f"Could not open the folder: {e}")

def select_ffmpeg(entry_widget):
    """Open a file dialog to select the FFmpeg executable, starting from the global path if available.""" 
    ffmpeg_install_path = get_ffmpeg_path()  

    if ffmpeg_install_path:
        default_ffmpeg_path = os.path.dirname(ffmpeg_install_path)
    else:
        default_ffmpeg_path = "" 

    ffmpeg_file = filedialog.askopenfilename(
        title="Select FFmpeg Executable", 
        initialdir=default_ffmpeg_path, 
        filetypes=[("Executable", "*.exe")]
    )
    
    if ffmpeg_file:
        entry_widget.delete(0, 'end') 
        entry_widget.insert(0, ffmpeg_file)    

def select_output_folder(entry_widget):
    """Open a file dialog to select the output folder, starting from the current output folder if set.""" 
    output_folder = filedialog.askdirectory(title="Select Output Folder", initialdir=entry_widget.get())
    if output_folder:
        entry_widget.delete(0, 'end') 
        entry_widget.insert(0, output_folder)     
    
        
# * --- Panel Display Function

def show_panel(panel_to_show):
    """Hide all panels and show only the specified one."""
    panels = [url_entry_panel, quality_selection_panel, progress_and_status_panel, final_options_panel]
    for panel in panels:
        panel.pack_forget()
    panel_to_show.pack(pady=10)

def reset_ui():
    """Reset the UI to its initial state after a download or error."""
    final_options_panel.pack_forget()
    quality_selection_panel.pack_forget()

    progress.set(0.0)
    progress_label.set("Ready")
    estimated_time_remaining.set("")

    progress_text.configure(text="Ready")
    quality_combobox.set("") 
    save_mp3_checkbox.deselect()

    url_entry_panel.pack(pady=10)
    
def perform_reset():
    """Actually reset the UI after a short delay."""
    quality_selection_panel.pack_forget()
    progress_and_status_panel.pack_forget()
    final_options_panel.pack_forget()

    progress.set(0.0)
    progress_label.set("Ready")
    estimated_time_remaining.set("")

    quality_combobox.set("")
    save_mp3_checkbox.deselect()

    show_panel(url_entry_panel)

def cancel_download_setup():
    reset_ui()


# * --- Panel-Specific Actions

def fetch_qualities_thread(url):
    """Background thread to retrieve quality options for the provided URL."""
    available_qualities = list_available_qualities(url)
    quality_options = [f"{q['resolution']} at {q['fps']} fps" for q in available_qualities]

    app.after(0, lambda: display_quality_options(quality_options))

def display_quality_options(quality_options):
    """Show quality options once they are retrieved."""
    progress_and_status_panel.pack_forget()

    quality_combobox.configure(values=quality_options) 
    quality_combobox.set("Select Quality") 
    quality_selection_panel.pack(pady=10)

def update_quality_options():
    """Fetch and display available quality options for a given URL."""
    url = url_entry.get().strip()
    if not url:
        show_warning_message("Input Error", "Please enter a YouTube URL first.")
        return
    
    if is_valid_youtube_url(url):
        show_panel(progress_and_status_panel)
        progress_label.set("Fetching qualities...")
        threading.Thread(target=fetch_qualities_thread, args=(url,)).start()

def start_download():
    """Initialize download based on user-selected quality."""
    selected_quality = quality_combobox.get()
    if not selected_quality:
        show_warning_message("Selection Error", "Please select a quality.")
        return
    
    available_qualities = list_available_qualities(url_entry.get())
    quality_options = [f"{q['resolution']} at {q['fps']} fps" for q in available_qualities]
    
    try:
        quality_index = quality_options.index(selected_quality)
    except ValueError:
        show_warning_message("Selection Error", "Please select a valid quality from the list.")
        return

    quality_selection_panel.pack_forget()
    progress_label.set("Downloading...")
    progress_and_status_panel.pack()
    threading.Thread(target=download_and_convert, args=(url_entry.get(), quality_index)).start()



#@ ----------------------------- GUI Initialization and Layout -------------------------------

load_settings()

# * ---  Main Container

main_container = ctk.CTkFrame(app)
main_container.pack(padx=20, pady=20, fill="both", expand=True)
    
    
# * -- Button Creation and Binding
      
button_height = 35 
icon_size = int(button_height * 0.9)  

def create_button(container, text, icon_path, command, icon_position="left"):
    """Create a custom button with an icon and hover effects for a CustomTkinter GUI."""
    icon_image = Image.open(resource_path(icon_path)).resize((icon_size, icon_size), Image.LANCZOS)
    button_icon = ctk.CTkImage(light_image=icon_image, dark_image=icon_image)
    
    button = ctk.CTkButton(
        container,
        text=text,
        command=command,
        image=button_icon,
        compound=icon_position,
        text_color="#A9A9A9", 
        fg_color="#343434",
        border_color="#343434", 
        border_width=1,
        hover_color="#333333",
        font=('Arial', 12, "bold"),
        width=80,
        height=button_height
    )
    
    def on_enter(event):
        button.configure(text_color="#ff2953", border_color="#ff2953") 
    
    def on_leave(event):
        button.configure(text_color="#A9A9A9", border_color="#343434") 
    
    button.bind("<Enter>", on_enter)
    button.bind("<Leave>", on_leave)
    
    return button


# * --- Navigation Buttons

nav_buttons_container = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
nav_buttons_container.pack(side='top', anchor='ne', padx=20, pady=(10, 0))

downloads_button = create_button(
    nav_buttons_container, 
    "Downloads", 
    resource_path("icons/downloads.png"), 
    lambda: open_in_explorer(output_folder)
)
downloads_button.pack(side='left', padx=(0, 10))

settings_button = create_button(
    nav_buttons_container, 
    "Settings", 
    resource_path("icons/gears.png"), 
    open_settings
)
settings_button.pack(side='left')


# * --- URL Entry Panel

url_entry_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
url_label = ctk.CTkLabel(url_entry_panel, font=('Roboto', 15), text="Enter a YouTube Link")
url_label.pack(pady=(10, 5))
url_entry = ctk.CTkEntry(url_entry_panel, width=500)
url_entry.pack(pady=5)

fetch_button = create_button(
    url_entry_panel, 
    "Find Source(s)", 
    resource_path("icons/start.png"), 
    update_quality_options,
    icon_position="right"
)
fetch_button.pack(pady=10)


# * --- Quality Selection Panel

quality_selection_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
quality_combobox = ctk.CTkComboBox(quality_selection_panel, width=300)
quality_combobox.pack(pady=5)
save_mp3_checkbox = ctk.CTkCheckBox(quality_selection_panel, text="Save MP3 Copy", variable=save_mp3_var)
save_mp3_checkbox.pack(pady=10)

buttons_frame = ctk.CTkFrame(quality_selection_panel, fg_color="transparent", bg_color="transparent")
buttons_frame.pack(pady=10)

cancel_button = create_button(
    buttons_frame, 
    "Cancel", 
    resource_path("icons/restart.png"), 
    cancel_download_setup,
    icon_position="left"
)
cancel_button.pack(side="left", padx=(0, 10))

download_button = create_button(
    buttons_frame, 
    "Download", 
    resource_path("icons/download.png"), 
    start_download,
    icon_position="right"
)
download_button.pack(side="left")
quality_selection_panel.pack_forget()


# * --- Progress and Status Panel
progress_and_status_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
progress_text = ctk.CTkLabel(progress_and_status_panel, textvariable=progress_label, width=300, wraplength=300, height=30, font=('Arial', 12))
progress_text.pack(pady=5)

progress_bar = ctk.CTkProgressBar(progress_and_status_panel, variable=progress, width=350, fg_color="#8B0000", progress_color="#FF1D49")
progress_bar.pack(pady=5)

time_remaining_label = ctk.CTkLabel(progress_and_status_panel, textvariable=estimated_time_remaining, font=('Arial', 11))
time_remaining_label.pack(pady=5)
progress_and_status_panel.pack_forget()


# * --- Final Options Panel
final_options_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
view_button = create_button(
    final_options_panel, 
    "View in Explorer", 
    resource_path("icons/browse.png"),
    lambda: open_in_explorer(output_folder),
    icon_position="right"
)
view_button.pack(pady=5)

reset_button = create_button(
    final_options_panel, 
    "Download Another", 
    resource_path("icons/restart.png"),
    reset_ui,
    icon_position="right"
)
reset_button.pack(pady=5)
final_options_panel.pack_forget()




#@ TODO: Allowing queuing and downloading of playlist videos --
playlist_window = None

def show_playlist_window():
    """Show a message indicating that playlists are not yet supported."""
    global playlist_window
    if playlist_window is not None:
        playlist_window.lift()
        return

    playlist_window = ctk.CTkToplevel(app)
    playlist_window.title("Playlists Not Supported")
    playlist_window.geometry("300x150")
    playlist_window.attributes('-topmost', True)
    playlist_window.resizable(False, False)
    playlist_window.wm_iconbitmap()
    playlist_window.after(222, lambda: playlist_window.iconphoto(False, ImageTk.PhotoImage(icon_image)))

    def on_close():
        global playlist_window
        playlist_window.destroy()
        playlist_window = None

    playlist_window.protocol("WM_DELETE_WINDOW", on_close)

    ctk.CTkLabel(
        playlist_window, 
        text="Playlist downloads are not implemented yet.", 
        font=('Arial', 12),
        text_color="white"
    ).pack(pady=20)
    
    ctk.CTkButton(
        playlist_window, 
        text="OK", 
        command=on_close 
    ).pack(pady=10)





#@ ------------------------------- Global Messagebox Functions -------------------------------


# * -- Message Boxes and Callbacks

#! --
def show_info_message(title, message):
    """Display an informational message with a checkmark icon."""
    CTkMessagebox(title=title, message=message, icon="check", option_1="OK")

def show_warning_message(title, message, option_1="Cancel", option_2="Retry", retry_callback=None):
    """Display a warning message, typically for retry/cancel prompts, with optional retry functionality."""
    msg = CTkMessagebox(title=title, message=message, icon="warning", option_1=option_1, option_2=option_2)
    if msg.get() == "Retry" and retry_callback:
        retry_callback()

def show_error_message(title, message):
    """Display an error message with a cancel icon."""
    CTkMessagebox(title=title, message=message, icon="cancel")

def show_yes_no(title, message, confirm_callback=None, cancel_callback=None):
    """
    Display a yes/no messagebox and execute callbacks based on user response.
    
    Parameters:
        - title (str): The title of the messagebox.
        - message (str): The message displayed to the user.
        - confirm_callback (callable, optional): Function to call if the user selects "Yes."
        - cancel_callback (callable, optional): Function to call if the user selects "No."
    """
    response = CTkMessagebox(title=title, message=message, icon="question", option_1="No", option_2="Yes").get()
    if response == "Yes" and confirm_callback:
        confirm_callback()
    elif response == "No" and cancel_callback:
        cancel_callback()





#@ ------------------------------- Custom Classes ----------------------------------


# * -- Custom Logger Class for yt-dlp 

#! --
class YTDLLogger:
    """Custom logger to capture yt-dlp output and display it in the GUI.""" 
    def __init__(self):
        self.last_status = "" 

    def debug(self, msg):
        if msg.startswith("[download]") or msg.startswith("[info]"):
            if "Downloading" in msg:
                progress_label.set(msg)
                self.last_status = msg
            elif "finished" in msg:
                progress_label.set("Download complete, processing...")
                self.last_status = "Download complete, processing..."

    def warning(self, msg):
        print(msg)

    def error(self, msg):
        show_error_message("yt-dlp Error", msg)
  




#@ ----------------------- Application Initialization and Start -----------------------


# * -- Start Application

show_panel(url_entry_panel)
app.mainloop()
