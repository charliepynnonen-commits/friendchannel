const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let proc = null;
let restartTimer = null;
let running = false;
let spawning = false;
let segWatcher = null;
let lastSegTime = null;

function buildArgs() {
  return [
    // -re reads input at real-time rate — gives live "TV clock" so all viewers
    // see the same content at the same wall-clock time
    '-re',
    '-f', 'concat',
    '-safe', '0',
    '-stream_loop', '-1',
    '-i', config.playlistPath,
    // Normalize all input to 720p 16:9 with letterboxing
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
    '-r', '25',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    // Keyframe every 2s for consistent HLS segment boundaries
    '-g', '50',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-ar', '44100',
    // Absorb audio timestamp drift at file/loop boundaries
    '-af', 'aresample=async=1',
    // Handle negative timestamps at loop boundaries
    '-avoid_negative_ts', 'make_zero',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '10',
    // delete_segments keeps disk clean; append_list gives live-stream behavior
    // delete_threshold keeps 3 extra segments as safety buffer during file transitions
    '-hls_flags', 'delete_segments+append_list',
    '-hls_delete_threshold', '3',
    '-hls_segment_filename', path.join(config.hlsDir, 'seg_%05d.ts'),
    path.join(config.hlsDir, 'index.m3u8'),
  ];
}

function start() {
  if (proc) return;
  running = true;
  _spawn();
}

function _spawn() {
  if (!running || spawning || proc) return;
  spawning = true;
  console.log('[stream] Starting FFmpeg...');
  proc = spawn('ffmpeg', buildArgs(), { stdio: ['ignore', 'ignore', 'pipe'] });
  spawning = false;

  proc.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('Error') || msg.includes('Invalid') || msg.includes('No such file') || msg.includes('Impossible')) {
      process.stderr.write('[ffmpeg:error] ' + msg);
    }
    // Show which file FFmpeg is opening (needs -loglevel verbose to appear)
    if (msg.includes("Opening '") && msg.includes("for reading")) {
      const match = msg.match(/Opening '([^']+)'/);
      if (match) console.log('[ffmpeg] opening:', match[1].split('/').pop());
    }
  });

  // Watch HLS dir for new segments — gaps here mean FFmpeg is stalling, not hls.js
  if (segWatcher) segWatcher.close();
  lastSegTime = Date.now();
  segWatcher = fs.watch(config.hlsDir, (event, filename) => {
    if (!filename || !filename.endsWith('.ts')) return;
    const now = Date.now();
    const gap = lastSegTime ? ((now - lastSegTime) / 1000).toFixed(1) : '?';
    lastSegTime = now;
    console.log(`[seg] ${filename}  gap=${gap}s`);
  });

  proc.on('exit', (code, signal) => {
    proc = null;
    if (!running) return;
    if (signal === 'SIGTERM' || signal === 'SIGKILL') return;
    const delay = code === 0 ? 500 : 2000;
    console.log(`[stream] FFmpeg exited (code=${code}), restarting in ${delay}ms...`);
    restartTimer = setTimeout(_spawn, delay);
  });
}

function stop() {
  running = false;
  clearTimeout(restartTimer);
  if (proc) {
    proc.kill('SIGTERM');
    proc = null;
  }
  if (segWatcher) {
    segWatcher.close();
    segWatcher = null;
  }
}

function restart() {
  console.log('[stream] Restarting FFmpeg...');
  stop();
  running = true;
  _spawn();
}

function isRunning() {
  return proc !== null;
}

module.exports = { start, stop, restart, isRunning };
