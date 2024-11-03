docker run --rm -v ${PWD}:/src python:3.8-slim /bin/bash -c "
    apt update && \
    apt install -y binutils tcl8.6 tk8.6 && \
    pip install pyinstaller yt-dlp pillow customtkinter && \
    cd /src && \
    pyinstaller /src/YouTubeDownloaderLinux.spec && \
    tar -czvf dist/YouTube_Downloader_Linux.tar.gz -C dist/linux YouTube_Downloader_Linux
"
