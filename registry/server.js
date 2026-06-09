const express = require('express');
const app = express();

app.use(express.json());

// id -> { id, name, tailscaleIP, port, streaming, iconURL, channels, lastSeen }
const nodes = new Map();

const EXPIRY_MS = 90_000;

app.post('/register', (req, res) => {
  const { id, name, tailscaleIP, port, streaming, iconURL, channels } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  nodes.set(id, {
    id, name, tailscaleIP, port,
    streaming: !!streaming,
    iconURL: iconURL || null,
    channels: Array.isArray(channels) ? channels : null,
    lastSeen: Date.now(),
  });
  res.json({ ok: true });
});

app.get('/channels', (req, res) => {
  const now = Date.now();
  const active = [...nodes.values()].filter(n => now - n.lastSeen < EXPIRY_MS);
  res.json(active);
});

app.delete('/register/:id', (req, res) => {
  nodes.delete(req.params.id);
  res.json({ ok: true });
});

// Prune stale entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [id, node] of nodes) {
    if (now - node.lastSeen >= EXPIRY_MS) nodes.delete(id);
  }
}, 30_000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[registry] FriendChannel registry running on port ${PORT}`);
});
