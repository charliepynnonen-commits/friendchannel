# FriendChannel

Your own 24/7 TV channel, shared with friends. Everyone runs their own server loaded with whatever they want — music videos, movies, clips — and anyone in the group can tune in at any time, mid-stream, like a real TV channel.

---

## Prerequisites

Install these before anything else.

**Node.js** — https://nodejs.org (download the LTS version)

**FFmpeg**
- Windows: open PowerShell and run `winget install ffmpeg`
- Mac: open Terminal and run `brew install ffmpeg`

**Tailscale** — https://tailscale.com/download  
Sign in with a Google or GitHub account. Accept the invite link from whoever set up the group.

---

## Setup

**1. Clone the project**
```
git clone https://github.com/YOUR_USERNAME/friendchannel.git
cd friendchannel
npm install
```

**2. Configure your channel**

Copy the example config:
- Windows: `copy .env.example .env`
- Mac: `cp .env.example .env`

Open `.env` in any text editor and fill it in:
```
NODE_NAME=Andy
TAILSCALE_IP=100.x.x.x
REGISTRY_URL=https://the-registry-url-from-your-group
```

To find your Tailscale IP:
- Windows: open PowerShell, run `tailscale ip -4`
- Mac: open Terminal, run `tailscale ip -4`

**3. Add your content**

Drop video files (`.mp4`, `.mkv`, `.avi`, `.mov`) into the `data/media/` folder. This folder is created automatically when you first run the server.

> **Important:** Videos must be H.264 encoded. Most MP4s downloaded from the internet already are. If a video won't play or causes the server to crash, convert it first — see the conversion command at the bottom of this file.

**4. Start your channel**
```
npm start
```

Your channel is now live. Open `http://localhost:7777` in your browser to watch it yourself.

---

## Watching other channels

Everyone needs to be on the same Tailscale network and pointing at the same `REGISTRY_URL`. Once they are, their channel shows up automatically in the grid at `http://localhost:7777`.

Without a registry, you can still watch any channel directly by opening this URL in your browser (using their Tailscale IP):
```
http://THEIR_TAILSCALE_IP:7777/stream/index.m3u8
```

---

## Channel icon

You can add a small icon that appears as a watermark in the bottom-right corner of your channel (like a TV network bug). Drop an image file named `icon.gif`, `icon.png`, or `icon.webp` into the `data/channel/` folder. Animated GIFs work.

The folder is created automatically when you first run the server.

---

## Everyday use

**Start your channel:**
```
npm start
```

**Stop your channel:** press `Ctrl+C` in the terminal.

**Add new content:** drop files into `data/media/` and restart the server. The new content will be added to the rotation.

**Remove content:** delete the file from `data/media/` and restart.

---

## Convert a video to H.264

If a video file isn't playing, convert it first:

```
ffmpeg -i "input_filename.mp4" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "output_filename.mp4"
```

Then drop the converted file into `data/media/` instead.

---

## Troubleshooting

**"localhost refused to connect"** — the server isn't running. Run `npm start`.

**Stream won't load / black screen** — stop the server, delete everything inside `data/hls/`, then restart.

**Channel shows offline** — that person's server isn't running, or they're not on Tailscale.

**Audio glitching** — the video file probably needs to be converted to H.264 (see above).
