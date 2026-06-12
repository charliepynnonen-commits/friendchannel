const { spawn, execSync } = require('child_process');

let proc = null;
let currentUrl = null;
let currentName = null;

function isInstalled() {
  try {
    execSync('mpv --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function start(url, name) {
  if (proc) _kill();

  const args = [
    '--fullscreen',
    '--no-terminal',
    '--no-input-terminal',
    '--really-quiet',
    '--keep-open=yes',
    url,
  ];

  // On Linux without a display server, default to DRM/KMS output.
  // If DISPLAY or WAYLAND_DISPLAY is set, let mpv auto-detect.
  // Override with MPV_VO env var (e.g. MPV_VO=gpu for X11/Wayland setups).
  const hasDisplay = process.platform !== 'linux'
    || !!process.env.DISPLAY
    || !!process.env.WAYLAND_DISPLAY;
  const vo = process.env.MPV_VO ?? (hasDisplay ? null : 'drm');
  if (vo) args.unshift(`--vo=${vo}`);

  // Audio driver — mpv auto-detects by default.
  // Set MPV_AO=alsa / pulse / pipewire in .env if auto-detection picks wrong device.
  const ao = process.env.MPV_AO;
  if (ao) args.unshift(`--ao=${ao}`);

  proc = spawn('mpv', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false,
  });
  currentUrl = url;
  currentName = name;

  proc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.log('[display]', msg);
  });

  proc.on('exit', (code) => {
    console.log(`[display] mpv exited (code=${code})`);
    proc = null;
    currentUrl = null;
    currentName = null;
  });

  console.log(`[display] mpv started (PID: ${proc.pid}) — ${url}`);
}

function _kill() {
  if (!proc) return;
  proc.kill('SIGTERM');
  proc = null;
  currentUrl = null;
  currentName = null;
}

function stop() {
  _kill();
}

function status() {
  return { running: proc !== null, url: currentUrl, name: currentName };
}

module.exports = { start, stop, status, isInstalled };
