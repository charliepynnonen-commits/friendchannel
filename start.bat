@echo off
title FriendChannel
if not exist node_modules (
  echo node_modules not found -- run setup.bat first
  pause
  exit /b 1
)
echo.
echo  Starting FriendChannel...
echo  Open your browser to:  http://localhost:7777
echo  Press Ctrl+C in this window to stop your channel.
echo.
npm start
pause
