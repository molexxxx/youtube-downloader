import yt_dlp
import subprocess
import os
import re
import customtkinter as ctk
from tkinter import messagebox
from tkinter import StringVar, Toplevel, Entry, Label, Button
import threading
import time
import webbrowser
import json

ctk.set_appearance_mode("dark")

# Global settings
conversion_preset = 'slow'
video_bitrate = '10M'
audio_bitrate = '192k'
ffmpeg_path = 'ffmpeg'


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

    folder_path = os.path.join(os.getcwd(), uploader_name)
    os.makedirs(folder_path, exist_ok=True)
    final_output = os.path.join(folder_path, f"{video_title}_{selected_quality['resolution']}.mp4")

    if os.path.exists(final_output):
        overwrite = messagebox.askyesno("File Exists", f"The file '{final_output}' already exists. Do you want to overwrite it?")
        if not overwrite:
            if not check_audio_codec(final_output):
                prompt_audio_conversion(final_output, folder_path, video_title, selected_quality['resolution'], duration)
            else:
                finalize_download(folder_path)
            return
        else:
            os.remove(final_output)

    ydl_opts = {
        'format': f"{selected_quality['format_id']}+bestaudio/best",
        'outtmpl': final_output,
        'merge_output_format': 'mp4',
        'progress_hooks': [progress_hook],
        'postprocessors': [{'key': 'FFmpegMetadata'}],
        'logger': YTDLLogger()  # Redirect yt-dlp logs to custom logger
    }
    
    progress_label.set("Starting download...")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    # Check if audio needs conversion to AAC
    prompt_audio_conversion(final_output, folder_path, video_title, selected_quality['resolution'], duration)


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
        speed = d.get('speed', 0)
        eta = d.get('eta', 0)
        
        progress.set(downloaded / total)

        # Prepare status message
        speed_str = f"{speed / 1024 / 1024:.2f} MiB/s" if speed else "N/A"
        eta_str = time.strftime("%H:%M:%S", time.gmtime(eta)) if eta else "N/A"
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

    # Check if AAC file already exists and prompt for overwrite if it does
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
                
                # Update the status with codec and settings
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
    settings_window.geometry("400x565")  
    settings_window.attributes('-topmost', True) 

    # Main settings container
    settings_container = ctk.CTkFrame(settings_window, fg_color="#2E2E2E", bg_color="#2E2E2E")
    settings_container.pack(padx=20, pady=20, fill="both", expand=True)

    # FFmpeg path input
    ctk.CTkLabel(settings_container, text="FFmpeg Path:", text_color="#FFFFFF").pack(pady=10) 
    ffmpeg_entry = ctk.CTkEntry(settings_container, width=50, fg_color="#3D3D3D")
    ffmpeg_entry.pack(pady=5, fill='x')
    ffmpeg_entry.insert(0, ffmpeg_path)

    # Check if FFmpeg is installed
    ffmpeg_status_label = ctk.CTkLabel(settings_container, text="", text_color="#FFFFFF")
    ffmpeg_status_label.pack(pady=5)

    def check_ffmpeg():
        if check_ffmpeg_installed():
            ffmpeg_status_label.configure(text="FFmpeg is installed and reachable.", text_color="green")
        else:
            ffmpeg_status_label.configure(text="FFmpeg is NOT installed or not reachable.", text_color="red")
            # Provide a link to the FFmpeg website for download
            messagebox.showinfo("FFmpeg Not Found", "FFmpeg is not installed or not reachable. You can download it from the official website: https://ffmpeg.org/download.html")
            webbrowser.open("https://ffmpeg.org/download.html")


    check_button = ctk.CTkButton(settings_container, text="Check FFmpeg", command=check_ffmpeg, fg_color="#8B0000", hover_color="#FF0000")
    check_button.pack(pady=5)

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
        global video_bitrate, audio_bitrate, conversion_preset, ffmpeg_path
        video_bitrate = video_bitrate_combobox.get()
        audio_bitrate = audio_bitrate_combobox.get()
        conversion_preset = preset_combobox.get()
        ffmpeg_path = ffmpeg_entry.get()

        # Save settings to a JSON file
        settings = {
            'video_bitrate': video_bitrate,
            'audio_bitrate': audio_bitrate,
            'conversion_preset': conversion_preset,
            'ffmpeg_path': ffmpeg_path
        }

        with open('settings.json', 'w') as f:
            json.dump(settings, f, indent=4)

        messagebox.showinfo("Settings Saved", "Your settings have been saved.")

    save_button = ctk.CTkButton(settings_container, text="Save Settings", command=save_settings, fg_color="#8B0000", hover_color="#FF0000")
    save_button.pack(pady=10)


def load_settings():
    global video_bitrate, audio_bitrate, conversion_preset, ffmpeg_path
    try:
        with open('settings.json', 'r') as f:
            settings = json.load(f)
            video_bitrate = settings.get('video_bitrate', '10M')
            audio_bitrate = settings.get('audio_bitrate', '192k')
            conversion_preset = settings.get('conversion_preset', 'slow')
            ffmpeg_path = settings.get('ffmpeg_path', 'ffmpeg')
    except FileNotFoundError:
        # If the file does not exist, use default values
        video_bitrate = '10M'
        audio_bitrate = '256k'
        conversion_preset = 'slow'
        ffmpeg_path = 'ffmpeg'



#@ GUI Setup ---------------------------
app = ctk.CTk()
app.title("YouTube Video Downloader")
app.geometry("650x275")

progress = ctk.DoubleVar(value=0.0)
progress_label = StringVar(value="Ready")
estimated_time_remaining = StringVar(value="")

load_settings()

main_container = ctk.CTkFrame(app)
main_container.pack(padx=20, pady=20, fill="both", expand=True)

# Settings button
settings_button = ctk.CTkButton(
    main_container, 
    text="Settings", 
    command=open_settings, 
    text_color="#343434",
    fg_color="#A9A9A9",
    hover_color="#8B8B8B",
    font=('Arial', 12, "bold"),
    width=80, 
    height=30
)
settings_button.pack(side='top', anchor='ne', padx=(0, 20), pady=(10, 0))

# URL Entry Panel
url_entry_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
url_entry_panel.pack(padx=20, pady=20, fill="both", expand=True)
url_label = ctk.CTkLabel(url_entry_panel, font=('Arial', 14), text="Enter a YouTube Link")
url_label.pack(pady=(10, 5))
url_entry = ctk.CTkEntry(url_entry_panel, width=500)
url_entry.pack(pady=5)
fetch_button = ctk.CTkButton(url_entry_panel, text="Fetch Qualities", command=update_quality_options, fg_color="#8B0000", hover_color="#FF0000", font=('Arial', 12, "bold"))
fetch_button.pack(pady=10)

# Quality Selection Panel
quality_selection_panel = ctk.CTkFrame(main_container, fg_color="transparent", bg_color="transparent")
quality_selection_panel.pack(padx=20, pady=20, fill="both", expand=True)
quality_combobox = ctk.CTkComboBox(quality_selection_panel, width=300)
quality_combobox.pack(pady=5)
download_button = ctk.CTkButton(quality_selection_panel, text="Download", command=start_download, fg_color="#8B0000", hover_color="#FF0000", font=('Arial', 12, "bold"))
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
view_button = ctk.CTkButton(final_options_panel, text="View in Explorer", fg_color="#A6A19B", hover_color="#BFB9B3", text_color="#343434", font=('Arial', 12, "bold"))
view_button.pack(pady=5)
reset_button = ctk.CTkButton(final_options_panel, text="Start Over", command=reset_ui, fg_color="#8B0000", hover_color="#FF0000", font=('Arial', 12, "bold"))
reset_button.pack(pady=5)
final_options_panel.pack_forget()

url_entry_panel.pack(pady=10)

app.mainloop()