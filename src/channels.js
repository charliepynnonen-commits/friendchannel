// Singleton channel registry — populated by server.js at startup.
// Key: slug string (or null for the default channel).
const map = new Map();

module.exports = {
  add(slug, channel) { map.set(slug, channel); },
  get(slug) { return map.get(slug); },
  getAll() { return [...map.values()]; },
};
