#!/bin/bash
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BOLD}FriendChannel Setup${NC}"
echo "================================="
echo ""

# ── Node.js ───────────────────────────────────────
if command -v node &>/dev/null; then
  echo -e "${GREEN}[ok]${NC} Node.js $(node --version)"
else
  echo "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
  sudo apt-get install -y nodejs >/dev/null
  echo -e "${GREEN}[ok]${NC} Node.js $(node --version)"
fi

# ── FFmpeg ────────────────────────────────────────
if command -v ffmpeg &>/dev/null; then
  echo -e "${GREEN}[ok]${NC} FFmpeg $(ffmpeg -version 2>&1 | head -1 | grep -o 'version [^ ]*')"
else
  echo "Installing FFmpeg..."
  sudo apt-get update -qq
  sudo apt-get install -y ffmpeg >/dev/null
  echo -e "${GREEN}[ok]${NC} FFmpeg installed"
fi

# ── yt-dlp ────────────────────────────────────────
if command -v yt-dlp &>/dev/null; then
  echo -e "${GREEN}[ok]${NC} yt-dlp $(yt-dlp --version)"
else
  echo "Installing yt-dlp..."
  sudo curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp
  sudo chmod a+rx /usr/local/bin/yt-dlp
  echo -e "${GREEN}[ok]${NC} yt-dlp $(yt-dlp --version)"
fi

# ── Tailscale ─────────────────────────────────────
if command -v tailscale &>/dev/null; then
  echo -e "${GREEN}[ok]${NC} Tailscale $(tailscale --version | head -1)"
else
  echo "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | sh
  echo ""
  echo -e "${YELLOW}Tailscale installed. Connect to your tailnet now:${NC}"
  echo "  sudo tailscale up"
  echo ""
  read -rp "Press Enter once you've run 'tailscale up' and are connected..."
fi

TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
if [ -z "$TAILSCALE_IP" ]; then
  echo -e "${YELLOW}[warn]${NC} Could not detect Tailscale IP — are you connected to your tailnet?"
  read -rp "Enter your Tailscale IP manually: " TAILSCALE_IP
else
  echo -e "${GREEN}[ok]${NC} Tailscale IP: $TAILSCALE_IP"
fi

# ── .env ──────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
  echo -e "${GREEN}[ok]${NC} .env already exists — skipping"
else
  echo ""
  read -rp "Channel name (e.g. Charlie's Music Videos): " NODE_NAME
  read -rp "Registry URL (leave blank to skip): " REGISTRY_URL

  cat > "$SCRIPT_DIR/.env" <<EOF
NODE_NAME=${NODE_NAME}
TAILSCALE_IP=${TAILSCALE_IP}
PORT=7777
REGISTRY_URL=${REGISTRY_URL}
EOF
  echo -e "${GREEN}[ok]${NC} .env created"
fi

# ── Directories & packages ────────────────────────
mkdir -p "$SCRIPT_DIR/data/media" "$SCRIPT_DIR/data/channel"
echo -e "${GREEN}[ok]${NC} data/ directories ready"

cd "$SCRIPT_DIR"
npm install --silent
echo -e "${GREEN}[ok]${NC} npm packages installed"

# ── Systemd service ───────────────────────────────
echo ""
read -rp "Install as a systemd service (auto-start on boot)? [Y/n]: " INSTALL_SVC
if [[ "$INSTALL_SVC" =~ ^[Nn]$ ]]; then
  echo ""
  echo -e "${GREEN}Setup complete.${NC}"
  echo "Start with: npm start   or   bash start.sh"
  exit 0
fi

NODE_BIN=$(which node)
CURRENT_USER=$(whoami)
SERVICE_FILE=/etc/systemd/system/friendchannel.service

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=FriendChannel
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${NODE_BIN} server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable friendchannel
sudo systemctl start friendchannel

echo ""
echo -e "${GREEN}Setup complete. FriendChannel is running and will start on every boot.${NC}"
echo ""
echo "  sudo systemctl status friendchannel    check status"
echo "  sudo journalctl -fu friendchannel      live logs"
echo "  sudo systemctl restart friendchannel   restart after adding files"
echo ""
echo "Drop videos into: $SCRIPT_DIR/data/media/"
