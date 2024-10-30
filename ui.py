import yt_dlp
import subprocess
import os
import sys
import re
import customtkinter as ctk
from tkinter import StringVar, Toplevel, Entry, Label, Button, filedialog, messagebox, BooleanVar, PhotoImage
import threading
import time
import webbrowser
import json
from PIL import Image

# Define the resource path function to access bundled files
def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS  # Used by PyInstaller to store temporary files
    except AttributeError:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

ctk.set_appearance_mode("dark")

# Global settings
conversion_preset = 'slow'
video_bitrate = '10M'
audio_bitrate = '192k'
ffmpeg_path = 'ffmpeg'
output_folder = os.path.join(os.getcwd(), 'downloads')  # Default output folder

# GUI Setup
app = ctk.CTk()
app.title("YouTube Video Downloader")
app.geometry("650x275")
app.resizable(False, False)

# Set the icon for the taskbar
icon_path = resource_path("icons/yt-ico.ico")
app.iconbitmap(icon_path)

# Use a BooleanVar after the app has been created
save_mp3_var = BooleanVar(value=True)  # Default to checked

def supports_encoder(encoder_name):
    try:
        result = subprocess.run([ffmpeg_path, '-encoders'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return encoder_name in result.stdout
    except Exception:
        return False

def get_best_encoder():
    """Determine the best available encoder based on GPU compatibility."""
    if supports_encoder('h264_nvenc'):
        return 'h264_nvenc'
    elif supports_encoder('h264_amf'):
        return 'h264_amf'
    else:
        return 'libx264'

def sanitize_filename(filename):
    """Replace special characters in filenames with underscores."""
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)

def check_ffmpeg_installed():
    """Check if FFmpeg is installed and reachable."""
    try:
        result = subprocess.run([ffmpeg_path, '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return "ffmpeg" in result.stdout.lower()
    except Exception:
        return False

def check_audio_codec(filepath):
    """Check if the audio codec of the downloaded file is AAC."""
    try:
        result = subprocess.run([ffmpeg_path, '-i', filepath], stderr=subprocess.PIPE, text=True)
        return "aac" in result.stderr
    except Exception:
        return False

def list_available_qualities(url):
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        mp4_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('ext') == 'webm']
        
        seen_qualities = {}
        for f in mp4_formats:
            resolution = f.get('resolution', 'unknown')
            fps = f.get('fps', 'unknown')
            seen_qualities[(resolution, fps)] = {
                'format_id': f['format_id'],
                'resolution': resolution,
                'fps': fps,
                'ext': f.get('ext', 'webm')
            }
        
        return list(seen_qualities.values())

def download_and_convert(url, quality_index):
    available_qualities = list_available_qualities(url)
    selected_quality = available_qualities[quality_index]

    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        video_title = sanitize_filename(info.get('title', 'downloaded_video').replace(" ", "_"))
        uploader_name = sanitize_filename(info.get('uploader', 'Unknown_Uploader').replace(" ", "_"))
        duration = info.get('duration', 0)

    # Create output folder based on user settings
    full_output_folder = os.path.join(output_folder, uploader_name)
    os.makedirs(full_output_folder, exist_ok=True)
    
    final_output = os.path.join(full_output_folder, f"{video_title}_{selected_quality['resolution']}.mp4")

    if os.path.exists(final_output):
        overwrite = messagebox.askyesno("File Exists", f"The file '{final_output}' already exists. Do you want to overwrite it?")
        if not overwrite:
            if not check_audio_codec(final_output):
                prompt_audio_conversion(final_output, full_output_folder, video_title, selected_quality['resolution'], duration)
            else:
                finalize_download(full_output_folder)
            return
        else:
            os.remove(final_output)

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

    # Save MP3 separately if the checkbox is checked
    if save_mp3_var.get(): 
        progress_label.set("Downloading MP3...") 
        save_mp3(full_output_folder, video_title, url) 

    prompt_audio_conversion(final_output, full_output_folder, video_title, selected_quality['resolution'], duration)

def save_mp3(folder_path, video_title, url):  
    """Save the audio as an MP3 file in a separate directory.""" 
    mp3_folder = os.path.join(folder_path, "mp3s")
    os.makedirs(mp3_folder, exist_ok=True)

    mp3_output = os.path.join(mp3_folder, video_title)

    if os.path.exists(mp3_output):
        overwrite = messagebox.askyesno("File Exists", f"The MP3 file '{mp3_output}' already exists. Do you want to overwrite it?")
        if not overwrite:
            return  

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': mp3_output,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'logger': YTDLLogger()  
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])  

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
        messagebox.showerror("yt-dlp Error", msg)

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


def prompt_audio_conversion(filepath, folder_path, video_title, resolution, duration):
    """Prompt the user to convert audio to AAC if needed and proceed with conversion or finalize.""" 
    if not check_audio_codec(filepath):
        convert_to_aac = messagebox.askyesno(
            "Convert Audio to AAC",
            "The audio codec is not AAC. Do you want to convert it to AAC for better compatibility?"
        )
        if convert_to_aac:
            threading.Thread(target=convert_audio_to_aac, args=(filepath, folder_path, video_title, resolution, duration)).start()
        else:
            finalize_download(folder_path)
    else:
        finalize_download(folder_path)


def convert_audio_to_aac(filepath, folder_path, video_title, resolution, duration):
    """Convert the audio of the downloaded video file to AAC with GPU-accelerated encoding if available.""" 
    video_codec = get_best_encoder()
    aac_output = os.path.join(folder_path, f"{video_title}_{resolution}_AAC.mp4")

    if os.path.exists(aac_output):
        overwrite = messagebox.askyesno("File Exists", f"The AAC file '{aac_output}' already exists. Do you want to overwrite it?")
        if not overwrite:
            finalize_download(folder_path)
            return
        else:
            os.remove(aac_output)

    conversion_command = [
        ffmpeg_path, '-y', '-i', filepath,
        '-c:v', video_codec, '-preset', conversion_preset, '-b:v', video_bitrate,   # Use settings from the variables
        '-c:a', 'aac', '-b:a', audio_bitrate,                                       # Convert Opus to AAC
        aac_output
    ]

    progress.set(0.0)
    estimated_time_remaining.set("")

    try:
        process = subprocess.Popen(conversion_command, stderr=subprocess.PIPE, text=True,
                                   creationflags=subprocess.CREATE_NO_WINDOW)

        for line in process.stderr:
            time_match = re.search(r'time=(\d+:\d+:\d+\.\d+)', line)
            if time_match:
                # Convert the current time to seconds
                current_time = time_match.group(1)
                h, m, s = map(float, current_time.split(':'))
                elapsed_time = h * 3600 + m * 60 + s
                conversion_progress = min(elapsed_time / duration, 1.0)  # Calculate the progress based on duration
                progress.set(conversion_progress)

                remaining_time = (duration - elapsed_time) / (conversion_progress + 1e-5)
                mins, secs = divmod(int(remaining_time), 60)
                
                settings_message = (f"Using codec: {video_codec} | "
                                    f"Video Bitrate: {video_bitrate} | "
                                    f"Audio Bitrate: {audio_bitrate} | "
                                    f"Preset: {conversion_preset} | "
                                    f"Estimated time left: {mins}m {secs}s")
                estimated_time_remaining.set(settings_message)

        process.wait() 
        if process.returncode == 0:
            os.remove(filepath)
            finalize_download(folder_path)
        else:
            messagebox.showerror("Conversion Error", "An error occurred during audio conversion.")
    except Exception as e:
        messagebox.showerror("Execution Error", f"Error during conversion: {e}")
        finalize_download(folder_path)


def finalize_download(folder_path):
    progress_and_status_panel.pack_forget()
    final_options_panel.pack(pady=10)
    # Update view_button's command to open the explorer dynamically
    view_button.configure(command=lambda: open_in_explorer(folder_path))


def update_quality_options():
    url = url_entry.get()
    if not url:
        messagebox.showwarning("Input Error", "Please enter a YouTube URL first.")
        return
    
    url_entry_panel.pack_forget()
    app.update_idletasks()
    progress_label.set("Fetching qualities...")
    progress_and_status_panel.pack()
    threading.Thread(target=fetch_qualities_thread, args=(url,)).start()


def fetch_qualities_thread(url):
    available_qualities = list_available_qualities(url)
    quality_options = [f"{q['resolution']} at {q['fps']} fps" for q in available_qualities]
    progress_and_status_panel.pack_forget()
    quality_selection_panel.pack(pady=10)
    quality_combobox.configure(values=quality_options)
    quality_combobox.set("Select Quality")


def open_in_explorer(folder_path):
    webbrowser.open(f"file://{folder_path}")


def reset_ui():
    final_options_panel.pack_forget()
    quality_selection_panel.pack_forget()
    progress_and_status_panel.pack_forget()
    progress.set(0.0)
    progress_label.set("Ready")
    estimated_time_remaining.set("")
    url_entry_panel.pack(pady=10)


def start_download():
    selected_quality = quality_combobox.get()
    if not selected_quality:
        messagebox.showwarning("Selection Error", "Please select a quality.")
        return
    
    available_qualities = list_available_qualities(url_entry.get())
    quality_options = [f"{q['resolution']} at {q['fps']} fps" for q in available_qualities]
    
    try:
        quality_index = quality_options.index(selected_quality)
    except ValueError:
        messagebox.showwarning("Selection Error", "Please select a valid quality from the list.")
        return

    quality_selection_panel.pack_forget()
    progress_label.set("Downloading...")
    progress_and_status_panel.pack()
    threading.Thread(target=download_and_convert, args=(url_entry.get(), quality_index)).start()


def open_settings():
    """Open the settings window.""" 
    settings_window = ctk.CTkToplevel(app)  
    settings_window.title("Settings")
    settings_window.geometry("400x712")  
    settings_window.attributes('-topmost', True) 

    # Main settings container
    settings_container = ctk.CTkFrame(settings_window, fg_color="#2E2E2E", bg_color="#2E2E2E")
    settings_container.pack(padx=20, pady=20, fill="both", expand=True)

    # FFmpeg path input
    ctk.CTkLabel(settings_container, text="FFmpeg Path:", text_color="#FFFFFF").pack(pady=10) 
    ffmpeg_entry = ctk.CTkEntry(settings_container, width=50, fg_color="#3D3D3D")
    ffmpeg_entry.pack(pady=5, fill='x')
    ffmpeg_entry.insert(0, ffmpeg_path)
    
    browse_ffmpeg_button = create_button(
    settings_container, 
    "Browse..", 
    resource_path("icons/browse.png"), 
    lambda: select_ffmpeg(ffmpeg_entry),
    icon_position="right"
    )
    browse_ffmpeg_button.pack(pady=5)

    # Check if FFmpeg is installed
    ffmpeg_status_label = ctk.CTkLabel(settings_container, text="", text_color="#FFFFFF")
    ffmpeg_status_label.pack(pady=5)

    def check_ffmpeg():
        if check_ffmpeg_installed():
            ffmpeg_status_label.configure(text="FFmpeg is installed and reachable.", text_color="green")
        else:
            ffmpeg_status_label.configure(text="FFmpeg is NOT installed or not reachable.", text_color="red")
            messagebox.showinfo("FFmpeg Not Found", "FFmpeg is not installed or not reachable. You can download it from the official website: https://ffmpeg.org/download.html")
            webbrowser.open("https://ffmpeg.org/download.html")

    check_button = create_button(
    settings_container, 
    "Check FFmpeg", 
    resource_path("icons/test.png"), 
    check_ffmpeg,
    icon_position="left"
    )
    check_button.pack(pady=5)

    # Output folder input
    ctk.CTkLabel(settings_container, text="Output Folder:", text_color="#FFFFFF").pack(pady=10)
    output_folder_entry = ctk.CTkEntry(settings_container, width=50, fg_color="#3D3D3D")
    output_folder_entry.pack(pady=5, fill='x')
    output_folder_entry.insert(0, output_folder)

    # Button to browse for output folder
    browse_output_button = create_button(
    settings_container, 
    "Browse..", 
    resource_path("icons/browse.png"), 
    lambda: select_output_folder(output_folder_entry),
    icon_position="right"
    )
    browse_output_button.pack(pady=5)

    # Video bitrate input (Combobox)
    ctk.CTkLabel(settings_container, text="Video Bitrate:", text_color="#FFFFFF").pack(pady=10)
    video_bitrate_combobox = ctk.CTkComboBox(settings_container, values=["1M", "2M", "5M", "10M", "20M", "30M"], width=150)
    video_bitrate_combobox.pack(pady=5, fill='x')
    video_bitrate_combobox.set(video_bitrate) 

    # Audio bitrate input (Combobox)
    ctk.CTkLabel(settings_container, text="Audio Bitrate:", text_color="#FFFFFF").pack(pady=10)
    audio_bitrate_combobox = ctk.CTkComboBox(settings_container, values=["128k", "192k", "256k"], width=150)
    audio_bitrate_combobox.pack(pady=5, fill='x')
    audio_bitrate_combobox.set(audio_bitrate)

    # Conversion preset input (Combobox)
    ctk.CTkLabel(settings_container, text="Conversion Preset:", text_color="#FFFFFF").pack(pady=10)
    preset_combobox = ctk.CTkComboBox(settings_container, values=["fast", "medium", "slow"], width=150)
    preset_combobox.pack(pady=5, fill='x')
    preset_combobox.set(conversion_preset)

    def save_settings():
        global video_bitrate, audio_bitrate, conversion_preset, ffmpeg_path, output_folder
        video_bitrate = video_bitrate_combobox.get()
        audio_bitrate = audio_bitrate_combobox.get()
        conversion_preset = preset_combobox.get()
        ffmpeg_path = ffmpeg_entry.get()
        output_folder = output_folder_entry.get() 

        # Save settings to a JSON file
        settings = {
            'video_bitrate': video_bitrate,
            'audio_bitrate': audio_bitrate,
            'conversion_preset': conversion_preset,
            'ffmpeg_path': ffmpeg_path,
            'output_folder': output_folder
        }

        with open('settings.json', 'w') as f:
            json.dump(settings, f, indent=4)

        messagebox.showinfo("Settings Saved", "Your settings have been saved.")

    save_button = create_button(
    settings_container, 
    "Save Settings", 
    resource_path("icons/save.png"), 
    save_settings,
    icon_position="left"
    )
    save_button.pack(pady=10)

def select_ffmpeg(entry_widget):
    """Open a file dialog to select the FFmpeg executable, starting from the global path if available.""" 
    ffmpeg_install_path = get_ffmpeg_path()  

    if ffmpeg_install_path:
        default_ffmpeg_path = os.path.dirname(ffmpeg_install_path)
    else:
        default_ffmpeg_path = "" 

    # Open file dialog
    ffmpeg_file = filedialog.askopenfilename(
        title="Select FFmpeg Executable", 
        initialdir=default_ffmpeg_path, 
        filetypes=[("Executable", "*.exe")]
    )
    
    if ffmpeg_file:
        entry_widget.delete(0, 'end') 
        entry_widget.insert(0, ffmpeg_file) 

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

def select_output_folder(entry_widget):
    """Open a file dialog to select the output folder, starting from the current output folder if set.""" 
    # Open the file dialog with the current output folder as the initial directory
    output_folder = filedialog.askdirectory(title="Select Output Folder", initialdir=entry_widget.get())
    if output_folder:
        entry_widget.delete(0, 'end') 
        entry_widget.insert(0, output_folder) 

def load_settings():
    global video_bitrate, audio_bitrate, conversion_preset, ffmpeg_path, output_folder
    try:
        with open('settings.json', 'r') as f:
            settings = json.load(f)
            output_folder = settings.get('output_folder', None) 
            video_bitrate = settings.get('video_bitrate', '10M')
            audio_bitrate = settings.get('audio_bitrate', '192k')
            conversion_preset = settings.get('conversion_preset', 'slow')
            ffmpeg_path = settings.get('ffmpeg_path', 'ffmpeg')
    except FileNotFoundError:
        output_folder = None 

    if output_folder is None:
        output_folder = os.path.join(os.getcwd(), 'downloads')
        os.makedirs(output_folder, exist_ok=True) 

progress = ctk.DoubleVar(value=0.0)
progress_label = StringVar(value="Ready")
estimated_time_remaining = StringVar(value="")

load_settings()

main_container = ctk.CTkFrame(app)
main_container.pack(padx=20, pady=20, fill="both", expand=True)



# Set button and icon sizes
button_height = 35  # Adjust this based on your button’s height
icon_size = int(button_height * 0.9)  # Resize icon to about 80% of button height


# Define a helper function to create navigation buttons with icons and hover effects
def create_button(container, text, icon_path, command, icon_position="left"):
    # Load and resize the icon
    icon_image = Image.open(resource_path(icon_path)).resize((icon_size, icon_size), Image.LANCZOS)
    button_icon = ctk.CTkImage(light_image=icon_image, dark_image=icon_image)
    
    # Create the button with the specified properties
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
    
    # Apply hover effects for text and border color
    def on_enter(event):
        button.configure(text_color="#FF0000", border_color="#FF0000") 
    
    def on_leave(event):
        button.configure(text_color="#A9A9A9", border_color="#343434") 
    
    button.bind("<Enter>", on_enter)
    button.bind("<Leave>", on_leave)
    
    return button

# Create the navigation buttons container
nav_buttons_container = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
nav_buttons_container.pack(side='top', anchor='ne', padx=20, pady=(10, 0))

# Create "Downloads" and "Settings" buttons with icons
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


# URL Entry Panel
url_entry_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
url_entry_panel.pack(padx=20, pady=20, fill="both", expand=True)
url_label = ctk.CTkLabel(url_entry_panel, font=('Arial', 14), text="Enter a YouTube Link")
url_label.pack(pady=(10, 5))
url_entry = ctk.CTkEntry(url_entry_panel, width=500)
url_entry.pack(pady=5)

fetch_button = create_button(
    url_entry_panel, 
    "Get Qualities", 
    resource_path("icons/start.png"), 
    update_quality_options,
    icon_position="right"
)
fetch_button.pack(pady=10)

# Quality Selection Panel
quality_selection_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
quality_selection_panel.pack(padx=20, pady=20, fill="both", expand=True)
quality_combobox = ctk.CTkComboBox(quality_selection_panel, width=300)
quality_combobox.pack(pady=5)
save_mp3_checkbox = ctk.CTkCheckBox(quality_selection_panel, text="Save MP3 Separately", variable=save_mp3_var)
save_mp3_checkbox.pack(pady=10)
download_button = create_button(
    quality_selection_panel, 
    "Download", 
    resource_path("icons/download.png"), 
    start_download,
    icon_position="right"
)
download_button.pack(pady=10)

quality_selection_panel.pack_forget()

# Progress and Status Panel
progress_and_status_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
progress_and_status_panel.pack(padx=20, pady=20, fill="both", expand=True)
progress_text = ctk.CTkLabel(progress_and_status_panel, textvariable=progress_label, width=300, wraplength=300, height=30, font=('Arial', 12))
progress_text.pack(pady=5)
progress_bar = ctk.CTkProgressBar(progress_and_status_panel, variable=progress, width=350, fg_color="#8B0000", progress_color="#FF0000")
progress_bar.pack(pady=5)
time_remaining_label = ctk.CTkLabel(progress_and_status_panel, textvariable=estimated_time_remaining, font=('Arial', 11))
time_remaining_label.pack(pady=5)
progress_and_status_panel.pack_forget()

# Final Options Panel
final_options_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
final_options_panel.pack(padx=20, pady=20, fill="both", expand=True)
view_button = create_button(
    final_options_panel, 
    "View in Explorer", 
    resource_path("icons/browse.png"),
    lambda: None,
    icon_position="right"
)
view_button.pack(pady=5)

# Use create_button to initialize reset_button with the reset_ui command
reset_button = create_button(
    final_options_panel, 
    "Download Another", 
    resource_path("icons/restart.png"),
    reset_ui,
    icon_position="right"
)
reset_button.pack(pady=5)

final_options_panel.pack_forget()
url_entry_panel.pack(pady=10)


app.mainloop()
