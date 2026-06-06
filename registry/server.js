const express = require('express');
const app = express();

app.use(express.json());

// id -> { id, name, tailscaleIP, port, lastSeen }
const channels = new Map();

const EXPIRY_MS = 90_000;

app.post('/register', (req, res) => {
  const { id, name, tailscaleIP, port } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  channels.set(id, { id, name, tailscaleIP, port, lastSeen: Date.now() });
  res.json({ ok: true });
});

app.get('/channels', (req, res) => {
  const now = Date.now();
  const active = [...channels.values()].filter(c => now - c.lastSeen < EXPIRY_MS);
  res.json(active);
});

app.delete('/register/:id', (req, res) => {
  channels.delete(req.params.id);
  res.json({ ok: true });
});

// Prune stale entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [id, ch] of channels) {
    if (now - ch.lastSeen >= EXPIRY_MS) channels.delete(id);
  }
}, 30_000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[registry] FriendChannel registry running on port ${PORT}`);
});
