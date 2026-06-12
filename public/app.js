let hls = null;

async function init() {
  await loadStatus();
  await loadChannels();
  await pollDisplay();
  setInterval(loadChannels, 30_000);
  setInterval(pollDisplay, 5_000);
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

let _tvUrl = null;

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
    const tvBtn = ch.streaming
      ? `<button class="tv-btn${_tvUrl === url ? ' active' : ''}" data-url="${escapeAttr(url)}" data-name="${escapeAttr(ch.name)}">▶ TV</button>`
      : '';
    const libBtn = ch.isSelf
      ? `<button class="lib-btn" data-slug="${escapeAttr(ch.slug || 'default')}" data-name="${escapeAttr(ch.name)}" title="Manage library">≡</button>`
      : '';
    return `
    <div class="channel-card ${ch.streaming ? '' : 'offline'} ${ch.isSelf ? 'self' : ''}"
         data-id="${ch.id}"
         data-name="${escapeAttr(ch.name)}"
         data-url="${escapeAttr(url)}"
         data-icon-url="${escapeAttr(ch.iconURL || '')}">
      ${selfBadge}
      <div class="channel-name">${escapeHtml(ch.name)}</div>
      <div class="channel-footer">
        <div class="channel-status ${ch.streaming ? 'live' : ''}">
          ${ch.streaming ? 'Live' : 'Offline'}
        </div>
        <div class="channel-footer-btns">
          ${tvBtn}
          ${libBtn}
        </div>
      </div>
    </div>
  `;
  }).join('');

  grid.querySelectorAll('.channel-card:not(.offline)').forEach(card => {
    card.addEventListener('click', () => {
      openPlayer(card.dataset.url, card.dataset.name, card.dataset.iconUrl || null);
    });
  });

  grid.querySelectorAll('.tv-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      playOnTV(btn.dataset.url, btn.dataset.name);
    });
  });

  grid.querySelectorAll('.lib-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openLibrary(btn.dataset.slug, btn.dataset.name);
    });
  });
}

async function pollDisplay() {
  try {
    const res = await fetch('/api/display');
    const s = await res.json();
    updateTVBar(s);
  } catch {}
}

function updateTVBar(s) {
  _tvUrl = s.running ? s.url : null;
  const bar = document.getElementById('tv-now');
  const nameEl = document.getElementById('tv-now-name');
  if (s.running && s.name) {
    nameEl.textContent = s.name;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
  // Highlight the active TV button
  document.querySelectorAll('.tv-btn').forEach(btn => {
    btn.classList.toggle('active', s.running && btn.dataset.url === s.url);
  });
}

async function playOnTV(url, name) {
  try {
    const res = await fetch('/api/display/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[TV]', err.error || res.status);
      setTVError(err.error || `Error ${res.status}`);
      return;
    }
    updateTVBar({ running: true, url, name });
  } catch (e) {
    setTVError(e.message);
  }
}

function setTVError(msg) {
  const bar = document.getElementById('tv-now');
  const nameEl = document.getElementById('tv-now-name');
  nameEl.textContent = msg;
  bar.classList.remove('hidden');
  bar.style.color = 'var(--red)';
  setTimeout(() => {
    bar.style.color = '';
    if (!_tvUrl) bar.classList.add('hidden');
  }, 4000);
}

async function stopTV() {
  try {
    await fetch('/api/display/stop', { method: 'POST' });
    updateTVBar({ running: false });
  } catch {}
}

document.getElementById('tv-stop-btn').addEventListener('click', stopTV);

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

// ── Library panel ────────────────────────────────

let _librarySlug = null;

document.getElementById('library-close').addEventListener('click', closeLibrary);
document.getElementById('library-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLibrary();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('library-modal').classList.contains('hidden')) {
    closeLibrary();
  }
});

function closeLibrary() {
  document.getElementById('library-modal').classList.add('hidden');
  _librarySlug = null;
}

async function openLibrary(slug, name) {
  _librarySlug = slug;
  document.getElementById('library-title').textContent = `${name} — Library`;
  document.getElementById('library-list').innerHTML = '<div class="lib-loading">Loading…</div>';
  document.getElementById('library-modal').classList.remove('hidden');
  await refreshLibrary();
}

async function refreshLibrary() {
  if (!_librarySlug) return;
  try {
    const res = await fetch(`/api/channel/${_librarySlug}/library`);
    const entries = await res.json();
    renderLibrary(entries);
  } catch {
    document.getElementById('library-list').innerHTML = '<div class="lib-loading">Failed to load.</div>';
  }
}

function renderLibrary(entries) {
  const list = document.getElementById('library-list');
  if (entries.length === 0) {
    list.innerHTML = '<div class="lib-loading">No videos yet.</div>';
    return;
  }
  const now = Date.now();
  list.innerHTML = entries.map(e => {
    const dur = e.duration ? fmtDur(e.duration) : '?';
    const snoozed = e.snoozedUntil && e.snoozedUntil > now;
    const snoozeLabel = snoozed ? `Snoozed until ${fmtDate(e.snoozedUntil)}` : '';
    return `
      <div class="lib-entry ${snoozed ? 'snoozed' : ''}" data-id="${escapeAttr(e.id)}">
        <div class="lib-entry-info">
          <span class="lib-entry-name" title="${escapeAttr(e.filename)}">${escapeHtml(e.filename)}</span>
          <span class="lib-entry-dur">${dur}</span>
        </div>
        <div class="lib-entry-actions">
          ${snoozed
            ? `<span class="lib-snooze-label">${escapeHtml(snoozeLabel)}</span>
               <button class="lib-wake-btn" data-id="${escapeAttr(e.id)}">Wake</button>`
            : `<div class="lib-snooze-menu">
                 <button class="lib-snooze-btn">Snooze</button>
                 <div class="lib-snooze-opts hidden">
                   <button data-hours="24">24 h</button>
                   <button data-hours="72">3 d</button>
                   <button data-hours="168">7 d</button>
                   <button data-hours="720">30 d</button>
                 </div>
               </div>`
          }
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.lib-snooze-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const opts = btn.nextElementSibling;
      opts.classList.toggle('hidden');
    });
  });

  list.querySelectorAll('.lib-snooze-opts button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.lib-entry').dataset.id;
      const hours = Number(btn.dataset.hours);
      await fetch(`/api/channel/${_librarySlug}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, hours }),
      });
      await refreshLibrary();
    });
  });

  list.querySelectorAll('.lib-wake-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/channel/${_librarySlug}/unsnooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: btn.dataset.id }),
      });
      await refreshLibrary();
    });
  });
}

function fmtDur(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
