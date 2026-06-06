const { spawn, execSync } = require('child_process');
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
    // -re reads at real-time rate — all viewers see the same content at the same wall-clock time.
    // loop.mp4 is a single pre-rendered file (no file boundaries), so -re is perfectly stable.
    '-re',
    '-stream_loop', '-1',
    '-i', config.loopPath,
    // loop.mp4 is already 720p H264 + AAC from the normalize step — just copy.
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '15',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_delete_threshold', '5',
    '-hls_segment_filename', path.join(config.hlsDir, 'seg_%05d.ts'),
    path.join(config.hlsDir, 'index.m3u8'),
  ];
}

function killOrphans() {
  try {
    execSync(`pkill -KILL -f "${config.loopPath}"`, { stdio: 'ignore' });
    console.log('[stream] Killed orphaned FFmpeg process(es)');
  } catch {
    // pkill exits 1 when nothing matched — that's fine
  }
}

function start() {
  if (proc) return;
  if (!fs.existsSync(config.loopPath)) {
    console.warn('[stream] loop.mp4 not found — run prerender first');
    return;
  }
  killOrphans();
  running = true;
  _spawn();
}

function _spawn() {
  if (!running || spawning || proc) return;
  spawning = true;
  const thisProc = spawn('ffmpeg', buildArgs(), { stdio: ['ignore', 'ignore', 'pipe'] });
  proc = thisProc;
  spawning = false;
  console.log(`[stream] FFmpeg started (PID: ${thisProc.pid})`);

  thisProc.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('Error') || msg.includes('Invalid') || msg.includes('No such file') || msg.includes('Impossible')) {
      process.stderr.write('[ffmpeg:error] ' + msg);
    }
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
    // Skip deletion events — fs.watch fires for both creates and deletes.
    // Only count a segment if the file actually exists right now.
    if (!fs.existsSync(path.join(config.hlsDir, filename))) return;
    const now = Date.now();
    const gap = lastSegTime ? ((now - lastSegTime) / 1000).toFixed(1) : '?';
    lastSegTime = now;
    console.log(`[seg] ${filename}  gap=${gap}s`);
  });

  thisProc.on('exit', (code, signal) => {
    // Ignore if a newer process has already taken over
    if (proc !== thisProc) return;
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
    proc.kill('SIGTERM'); // graceful — allows FFmpeg to finalize the current segment
    proc = null;
  }
  if (segWatcher) {
    segWatcher.close();
    segWatcher = null;
  }
}

function restart() {
  console.log('[stream] Restarting FFmpeg...');
  clearTimeout(restartTimer);
  if (proc) {
    proc.kill('SIGKILL'); // immediate — no overlap window with the new process
    proc = null;
  }
  if (segWatcher) {
    segWatcher.close();
    segWatcher = null;
  }
  running = true;
  _spawn();
}

function isRunning() {
  return proc !== null;
}

module.exports = { start, stop, restart, isRunning };
