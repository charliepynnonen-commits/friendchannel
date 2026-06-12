const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const ICON_FILES = ['icon.gif', 'icon.png', 'icon.webp'];

function findIcon(iconDir) {
  if (!iconDir) return null;
  for (const file of ICON_FILES) {
    const p = path.join(iconDir, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createEngine(slug, playlistPath, hlsDir, iconDir) {
  let proc = null;
  let restartTimer = null;
  let running = false;
  let spawning = false;
  let segWatcher = null;
  let lastSegTime = null;

  const tag = `[stream:${slug}]`;

  function buildArgs() {
    const iconPath = findIcon(iconDir);

    const args = [
      '-re',
      '-f', 'concat', '-safe', '0', '-stream_loop', '-1',
      '-i', playlistPath,
    ];

    if (iconPath) {
      // GIF: ignore embedded loop count so it animates forever.
      // PNG/WEBP: -loop 1 holds the single frame as an infinite stream.
      if (iconPath.endsWith('.gif')) {
        args.push('-ignore_loop', '0');
      } else {
        args.push('-loop', '1');
      }
      args.push('-i', iconPath);
    }

    if (iconPath) {
      args.push(
        '-filter_complex',
        `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black[bg];[1:v]scale=${Math.round(1280 * config.iconSize / 100)}:-2[icon];[bg][icon]overlay=W-w-20:H-h-20:eof_action=repeat[v]`,
        '-map', '[v]',
        '-map', '0:a',
      );
    } else {
      args.push(
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
      );
    }

    args.push(
      '-r', '25',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-g', '50', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
      '-avoid_negative_ts', 'make_zero',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '15',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_delete_threshold', '5',
      '-hls_segment_filename', path.join(hlsDir, 'seg_%05d.ts'),
      path.join(hlsDir, 'index.m3u8'),
    );

    return args;
  }

  function killOrphans() {
    try {
      execSync(`pkill -KILL -f "${playlistPath}"`, { stdio: 'ignore' });
      console.log(`${tag} Killed orphaned FFmpeg process(es)`);
    } catch {
      // pkill exits 1 when nothing matched — that's fine
    }
  }

  function start() {
    if (proc) return;
    if (!fs.existsSync(playlistPath)) {
      console.warn(`${tag} playlist.ffconcat not found — cannot start`);
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
    console.log(`${tag} FFmpeg started (PID: ${thisProc.pid})`);

    thisProc.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('Invalid') || msg.includes('No such file') || msg.includes('Impossible')) {
        process.stderr.write(`${tag}:error ` + msg);
      }
      if (msg.includes("Opening '") && msg.includes("for reading")) {
        const match = msg.match(/Opening '([^']+)'/);
        if (match) console.log(`${tag} opening:`, match[1].split('/').pop());
      }
    });

    if (segWatcher) segWatcher.close();
    lastSegTime = Date.now();
    segWatcher = fs.watch(hlsDir, (event, filename) => {
      if (!filename || !filename.endsWith('.ts')) return;
      if (!fs.existsSync(path.join(hlsDir, filename))) return;
      const now = Date.now();
      const gap = lastSegTime ? ((now - lastSegTime) / 1000).toFixed(1) : '?';
      lastSegTime = now;
      console.log(`${tag} seg: ${filename}  gap=${gap}s`);
    });

    thisProc.on('exit', (code, signal) => {
      if (proc !== thisProc) return;
      proc = null;
      if (!running) return;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return;
      const delay = code === 0 ? 500 : 2000;
      console.log(`${tag} FFmpeg exited (code=${code}), restarting in ${delay}ms...`);
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
    console.log(`${tag} Restarting FFmpeg...`);
    clearTimeout(restartTimer);
    if (proc) {
      proc.kill('SIGKILL');
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

  return { start, stop, restart, isRunning };
}

module.exports = createEngine;
