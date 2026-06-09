let hls = null;

async function init() {
  await loadStatus();
  await loadChannels();
  setInterval(loadChannels, 30_000);
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    document.getElementById('self-info').textContent =
      `${s.name}  ·  ${s.tailscaleIP}:${s.port}`;
  } catch {
    document.getElementById('self-info').textContent = 'Could not reach server';
  }
}

async function loadChannels() {
  try {
    const res = await fetch('/api/channels');
    const channels = await res.json();
    renderChannels(channels);
    populateChannelSelect(channels.filter(ch => ch.isSelf));
  } catch {
    document.getElementById('channels-grid').innerHTML =
      '<div class="empty-state">Could not load channels.</div>';
  }
}

function populateChannelSelect(selfChannels) {
  const sel = document.getElementById('yt-channel');
  sel.innerHTML = selfChannels.map(ch => {
    const val = ch.slug || '';
    const label = ch.slug ? ch.name : 'Default';
    return `<option value="${escapeAttr(val)}">${escapeHtml(label)}</option>`;
  }).join('');
  // Only show the dropdown when there are multiple local channels to choose from
  sel.classList.toggle('hidden', selfChannels.length <= 1);
}

function renderChannels(channels) {
  const grid = document.getElementById('channels-grid');

  if (channels.length === 0) {
    grid.innerHTML = '<div class="empty-state">No channels found. Start the server on another machine and join the same registry.</div>';
    return;
  }

  grid.innerHTML = channels.map(ch => {
    const url = `http://${ch.tailscaleIP}:${ch.port}${ch.streamPath}`;
    const selfBadge = (ch.isSelf && !ch.slug)
      ? '<div class="channel-self-badge">Your Channel</div>'
      : (ch.isSelf ? '<div class="channel-self-badge">Local</div>' : '');
    return `
    <div class="channel-card ${ch.streaming ? '' : 'offline'} ${ch.isSelf ? 'self' : ''}"
         data-id="${ch.id}"
         data-name="${escapeAttr(ch.name)}"
         data-url="${escapeAttr(url)}"
         data-icon-url="${escapeAttr(ch.iconURL || '')}">
      ${selfBadge}
      <div class="channel-name">${escapeHtml(ch.name)}</div>
      <div class="channel-status ${ch.streaming ? 'live' : ''}">
        ${ch.streaming ? 'Live' : 'Offline'}
      </div>
    </div>
  `;
  }).join('');

  grid.querySelectorAll('.channel-card:not(.offline)').forEach(card => {
    card.addEventListener('click', () => {
      openPlayer(card.dataset.url, card.dataset.name, card.dataset.iconUrl || null);
    });
  });
}

function openPlayer(url, name, iconURL) {
  document.getElementById('player-channel-name').textContent = name;
  document.getElementById('player-wrap').classList.remove('hidden');

  const bug = document.getElementById('channel-bug');
  if (iconURL) {
    bug.src = iconURL;
    bug.classList.remove('hidden');
    bug.onerror = () => bug.classList.add('hidden');
  } else {
    bug.classList.add('hidden');
  }

  const video = document.getElementById('player');

  if (hls) { hls.destroy(); hls = null; }

  if (Hls.isSupported()) {
    hls = new Hls({
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      enableWorker: true,
      maxBufferLength: 20,
      backBufferLength: 10,
      manifestLoadingTimeOut: 10000,
      levelLoadingTimeOut: 10000,
      fragLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 6,
      levelLoadingMaxRetry: 6,
      fragLoadingMaxRetry: 6,
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // Segment stall during file transition — keep retrying
        console.warn('[hls] Network error, retrying load:', data.details);
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        console.warn('[hls] Media error, attempting recovery:', data.details);
        hls.recoverMediaError();
      } else {
        console.error('[hls] Unrecoverable error:', data.type, data.details);
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = url;
    video.play().catch(() => {});
  }
}

function closePlayer() {
  document.getElementById('player-wrap').classList.add('hidden');
  const video = document.getElementById('player');
  video.pause();
  video.removeAttribute('src');
  if (hls) { hls.destroy(); hls = null; }
  const bug = document.getElementById('channel-bug');
  bug.classList.add('hidden');
  bug.removeAttribute('src');
}

document.getElementById('player-close').addEventListener('click', closePlayer);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePlayer();
});

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

// ── YouTube downloader ──────────────────────────

const ytBtn    = document.getElementById('yt-btn');
const ytInput  = document.getElementById('yt-url');
const ytStatus = document.getElementById('yt-status');

function setStatus(msg, cls) {
  ytStatus.textContent = msg;
  ytStatus.className = 'download-status ' + (cls || '');
}

ytBtn.addEventListener('click', startDownload);
ytInput.addEventListener('keydown', e => { if (e.key === 'Enter') startDownload(); });

async function startDownload() {
  const url = ytInput.value.trim();
  if (!url) return;

  const sel = document.getElementById('yt-channel');
  const slug = sel.value || null;

  ytBtn.disabled = true;
  ytBtn.textContent = 'Downloading...';
  setStatus('Starting...', '');

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, slug }),
    });

    if (!res.ok) {
      const err = await res.json();
      setStatus(err.error, 'error');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));
        if (data.progress) setStatus(data.progress, '');
        if (data.done) {
          setStatus('Done — normalizing and rebuilding stream in background', 'done');
          ytInput.value = '';
        }
        if (data.error) setStatus(data.error, 'error');
      }
    }
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    ytBtn.disabled = false;
    ytBtn.textContent = 'Download';
  }
}

init();
