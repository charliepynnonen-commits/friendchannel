@echo off
setlocal EnableDelayedExpansion
title FriendChannel Setup

echo.
echo  =========================================
echo        FriendChannel  --  Setup
echo  =========================================
echo.

:: ── Node.js ──────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js is not installed.
    echo.
    echo      1. The Node.js website is opening in your browser.
    echo      2. Download and install it ^(click Next through everything^).
    echo      3. Come back and double-click setup.bat again.
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)
echo  [OK] Node.js found

:: ── FFmpeg ───────────────────────────────────────────────────────
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [..] Installing FFmpeg -- this may take a minute...
    winget install --id Gyan.FFmpeg -e --silent --accept-source-agreements --accept-package-agreements
    echo.
    echo  [!] FFmpeg was just installed.
    echo.
    echo      Please CLOSE this window, then double-click setup.bat again.
    echo      ^(Windows needs to reload before it can find FFmpeg^)
    echo.
    pause
    exit /b 0
)
echo  [OK] FFmpeg found

:: ── Tailscale check ──────────────────────────────────────────────
tailscale version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [!] Tailscale is not installed or not running.
    echo.
    echo      1. Download and install Tailscale: https://tailscale.com/download
    echo      2. Sign in with your Google or GitHub account.
    echo      3. Accept the invite link from whoever set up the group.
    echo      4. Come back and double-click setup.bat again.
    echo.
    pause
    exit /b 1
)
echo  [OK] Tailscale found

:: ── Channel name ─────────────────────────────────────────────────
echo.
set /p "CHANNEL_NAME=  What should your channel be called? (e.g. Andy's Movies): "
if "!CHANNEL_NAME!"=="" set CHANNEL_NAME=My Channel

:: ── Tailscale IP ─────────────────────────────────────────────────
echo.
echo  [..] Detecting your Tailscale IP address...
for /f "tokens=*" %%i in ('tailscale ip -4 2^>nul') do set TS_IP=%%i

if "!TS_IP!"=="" (
    echo.
    echo  [!] Could not detect Tailscale IP automatically.
    echo      Make sure the Tailscale app is open and connected, then try again.
    echo      Or enter it manually -- open Tailscale and it shows your IP.
    echo.
    set /p "TS_IP=  Your Tailscale IP: "
) else (
    echo  [OK] Tailscale IP: !TS_IP!
)

:: ── Write config ─────────────────────────────────────────────────
echo.
echo  [..] Saving your config...
(
    echo NODE_NAME=!CHANNEL_NAME!
    echo TAILSCALE_IP=!TS_IP!
    echo REGISTRY_URL=https://friendchannel-registry.fly.dev
) > .env
echo  [OK] Config saved

:: ── Create folders ───────────────────────────────────────────────
if not exist "data\media"   mkdir "data\media"
if not exist "data\channel" mkdir "data\channel"

:: ── Install packages ─────────────────────────────────────────────
echo  [..] Installing packages (first time only, may take a minute)...
npm install --silent
echo  [OK] Packages installed

:: ── Done ─────────────────────────────────────────────────────────
echo.
echo  =========================================
echo        Setup complete!
echo  =========================================
echo.
echo   1. Drop your video files into:  data\media
echo   2. Double-click start.bat to go live
echo   3. Open your browser to:  http://localhost:7777
echo.
pause
