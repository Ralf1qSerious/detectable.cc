const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Load .env if present (dev convenience — in prod set env vars on the host)
if (fs.existsSync(path.join(__dirname, '.env'))) {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .forEach(l => {
      const [k, ...v] = l.split('=');
      if (k && !(k.trim() in process.env)) process.env[k.trim()] = v.join('=').trim();
    });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'detectable-lv-secret-change-in-prod';
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const SESSIONS_FILE  = path.join(DATA_DIR, 'sessions.json');
const USERS_FILE     = path.join(DATA_DIR, 'users.json');
const AUDIT_FILE     = path.join(DATA_DIR, 'audit.json');
const DISCORD_WEBHOOKS_FILE = path.join(DATA_DIR, 'discord-webhooks.json');
const NOTES_FILE     = path.join(DATA_DIR, 'notes.json');
const CONFIG_FILE    = path.join(DATA_DIR, 'config.json');
const BANNER_FILE    = path.join(DATA_DIR, 'banner.json');
const INVITES_FILE   = path.join(DATA_DIR, 'invites.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const CHAT_FILE      = path.join(DATA_DIR, 'chat.json');

// ─── Persistent storage helpers ──────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── In-Memory Stores ────────────────────────────────────────────────────────
const users    = new Map(Object.entries(loadJSON(USERS_FILE)));
const sessions = new Map(Object.entries(loadJSON(SESSIONS_FILE)));
let   auditLog     = loadJSON(AUDIT_FILE, []);
const DISCORD_WEBHOOK_DEFAULTS = {
  enabled: false,
  username: 'detectable.cc Audit',
  avatarUrl: '',
  includeDetails: true,
  includeIp: false,
  maxDetailLength: 900,
  webhooks: {
    all: '',
    auth: '',
    users: '',
    sessions: '',
    admin: '',
    invites: '',
    verdicts: '',
    exports: '',
    security: ''
  },
  byAction: {}
};

function resolveDiscordWebhookConfig() {
  const raw = loadJSON(DISCORD_WEBHOOKS_FILE, {});
  return {
    ...DISCORD_WEBHOOK_DEFAULTS,
    ...raw,
    webhooks: {
      ...DISCORD_WEBHOOK_DEFAULTS.webhooks,
      ...(raw.webhooks || {})
    },
    byAction: {
      ...(DISCORD_WEBHOOK_DEFAULTS.byAction || {}),
      ...(raw.byAction || {})
    }
  };
}

let   discordWebhooks = resolveDiscordWebhookConfig();
let   profileNotes = loadJSON(NOTES_FILE, {});
let   config       = { sessionTtlHours: 24, maxSessionsPerChecker: 0, jwtExpiryHours: 12,
                       requireInviteCode: false, alertRules: [],
                       ...loadJSON(CONFIG_FILE, {}) };
let   banner       = loadJSON(BANNER_FILE, null);
let   invites      = loadJSON(INVITES_FILE, {});
let   templates    = loadJSON(TEMPLATES_FILE, []);
let   globalChat   = loadJSON(CHAT_FILE, []);

function persistUsers()     { saveJSON(USERS_FILE,    Object.fromEntries(users)); }
function persistSessions()  { saveJSON(SESSIONS_FILE, Object.fromEntries(sessions)); }
function persistAudit()     { saveJSON(AUDIT_FILE,    auditLog); }
function persistDiscordWebhooks() { saveJSON(DISCORD_WEBHOOKS_FILE, discordWebhooks); }
function persistNotes()     { saveJSON(NOTES_FILE,     profileNotes); }
function persistConfig()    { saveJSON(CONFIG_FILE,    config); }
function persistBanner()    { saveJSON(BANNER_FILE,    banner); }
function persistInvites()   { saveJSON(INVITES_FILE,   invites); }
function persistTemplates() { saveJSON(TEMPLATES_FILE, templates); }
function persistChat()      { saveJSON(CHAT_FILE,      globalChat); }

function generateUserId() {
  return `DLV-${uuidv4().split('-')[0].toUpperCase()}`;
}

function ensureUserId(userObj) {
  if (!userObj) return null;
  if (!userObj.userId) userObj.userId = generateUserId();
  return userObj.userId;
}

function ensureAllUserIds() {
  let changed = false;
  for (const u of users.values()) {
    if (!u.userId) {
      u.userId = generateUserId();
      changed = true;
    }
  }
  if (changed) persistUsers();
}

if (!fs.existsSync(DISCORD_WEBHOOKS_FILE)) persistDiscordWebhooks();

function auditCategory(action = '') {
  if (action.startsWith('login') || action.startsWith('password_')) return 'security';
  if (action.startsWith('user_') || action.startsWith('role_') || action.startsWith('badges_')) return 'users';
  if (action.startsWith('session_')) return 'sessions';
  if (action.startsWith('invite_')) return 'invites';
  if (action.startsWith('verdict_')) return 'verdicts';
  if (action === 'csv_export') return 'exports';
  if (action.startsWith('config_') || action.startsWith('banner_') || action.startsWith('template_') || action.startsWith('alert_') || action === 'broadcast') return 'admin';
  return 'all';
}

function pickWebhookUrl(action = '') {
  const byAction = discordWebhooks?.byAction || {};
  if (typeof byAction[action] === 'string' && byAction[action].trim()) return byAction[action].trim();
  const webhooks = discordWebhooks?.webhooks || {};
  const byCategory = webhooks[auditCategory(action)];
  if (typeof byCategory === 'string' && byCategory.trim()) return byCategory.trim();
  if (typeof webhooks.all === 'string' && webhooks.all.trim()) return webhooks.all.trim();
  return '';
}

function sanitizeDetails(input, includeIp = false) {
  const redactedKeys = new Set([
    'password', 'passwordHash', 'token', 'inviteCode', 'code', 'hwid', 'mac',
    'screenshot', 'image', 'screenshotBase64', 'raw', 'ip'
  ]);

  function walk(value, parentKey = '') {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      const v = value.trim();
      if (!v) return value;
      if (v.length > 240) return `${v.slice(0, 237)}...`;
      return value;
    }
    if (Array.isArray(value)) return value.map(v => walk(v, parentKey));
    if (typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (redactedKeys.has(k)) {
          if (k === 'ip' && includeIp) out[k] = v;
          else out[k] = '[REDACTED]';
          continue;
        }
        out[k] = walk(v, k);
      }
      return out;
    }
    return value;
  }

  const cleaned = walk(input);
  return cleaned && typeof cleaned === 'object' ? cleaned : {};
}

async function sendAuditToDiscord(entry) {
  // Hot-reload config so webhook file edits apply without redeploy.
  discordWebhooks = resolveDiscordWebhookConfig();

  if (!discordWebhooks?.enabled) return;
  const url = pickWebhookUrl(entry.action);
  if (!url) return;

  const includeDetails = discordWebhooks.includeDetails !== false;
  const safeDetails = sanitizeDetails(entry.details || {}, discordWebhooks.includeIp === true);
  const maxDetailLength = Math.max(200, parseInt(discordWebhooks.maxDetailLength, 10) || 900);
  const detailsJson = JSON.stringify(safeDetails, null, 2);

  const embed = {
    title: `Audit: ${entry.action}`,
    color: 0x2997ff,
    timestamp: entry.timestamp,
    fields: [
      { name: 'By', value: String(entry.by || 'system'), inline: true },
      { name: 'Category', value: auditCategory(entry.action), inline: true }
    ]
  };

  if (includeDetails && detailsJson && detailsJson !== '{}' && detailsJson !== '[]') {
    const limited = detailsJson.length > maxDetailLength
      ? `${detailsJson.slice(0, maxDetailLength - 3)}...`
      : detailsJson;
    embed.fields.push({ name: 'Details', value: `\`\`\`json\n${limited}\n\`\`\`` });
  }

  const payload = {
    username: discordWebhooks.username || 'detectable.cc Audit',
    avatar_url: discordWebhooks.avatarUrl || undefined,
    allowed_mentions: { parse: [] },
    embeds: [embed]
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!r.ok) console.error(`[discord] webhook failed ${r.status} for action ${entry.action}`);
  } catch (err) {
    console.error('[discord] webhook error:', err?.message || err);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Audit Helper ─────────────────────────────────────────────────────────────
function addAudit(action, by, details = {}) {
  const entry = { id: uuidv4(), action, by, details, timestamp: new Date().toISOString() };
  auditLog.unshift(entry);
  if (auditLog.length > 1000) auditLog = auditLog.slice(0, 1000);
  persistAudit();
  void sendAuditToDiscord(entry);
}

let defaultAdminSeededThisBoot = false;

// Seed default admin only when there are no users yet
(async () => {
  if (users.size === 0) {
    const hash = await bcrypt.hash('admin123', 12);
    users.set('admin', { username: 'admin', userId: generateUserId(), passwordHash: hash, role: 'admin', createdAt: new Date().toISOString() });
    defaultAdminSeededThisBoot = true;
    persistUsers();
  } else if (users.has('admin') && users.get('admin').role !== 'admin') {
    users.get('admin').role = 'admin';
    persistUsers();
  }
  ensureAllUserIds();
  persistConfig();
})();

// ─── Session expiry ───────────────────────────────────────────────────────────
function expireSessions() {
  const ttl = (config.sessionTtlHours || 24) * 60 * 60 * 1000;
  const now = Date.now();
  let changed = false;
  for (const [id, s] of sessions) {
    if (s.status === 'waiting' && now - new Date(s.createdAt).getTime() > ttl) {
      sessions.delete(id);
      changed = true;
    }
  }
  if (changed) persistSessions();
}
expireSessions();
setInterval(expireSessions, 30 * 60 * 1000);

// ─── Session expiry warning ── emit 10 min before TTL ─────────────────────────
setInterval(() => {
  const ttl = (config.sessionTtlHours || 24) * 60 * 60 * 1000;
  const warnMs = 10 * 60 * 1000;
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.status !== 'waiting') continue;
    const timeLeft = new Date(s.createdAt).getTime() + ttl - now;
    if (timeLeft > 0 && timeLeft <= warnMs && !s._warned) {
      s._warned = true;
      const minutesLeft = Math.ceil(timeLeft / 60000);
      const payload = { sessionId: id, targetName: s.targetName, minutesLeft };
      io.to(`session:${id}`).emit('session_expiring', payload);
      io.to(`user:${s.createdBy}`).emit('session_expiring', payload);
    }
  }
}, 60 * 1000);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── JWT helpers ─────────────────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${config.jwtExpiryHours || 12}h` });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = users.get(username.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  if (user.suspended)
    return res.status(403).json({ error: 'Account suspended. Contact an administrator.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    addAudit('login_failed', username.toLowerCase(), { ip: req.ip });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  user.lastLoginAt = new Date().toISOString();
  persistUsers();
  addAudit('login', user.username, { ip: req.ip });
  const token = signToken({ username: user.username, role: user.role });
  res.json({ token, username: user.username, role: user.role });
});

// ─── User Management Routes (admin only) ────────────────────────────────────
// List all users
app.get('/api/users', requireAdmin, (req, res) => {
  const list = Array.from(users.values()).map(
    ({ username, userId, role, createdAt, lastLoginAt, suspended, badges }) =>
      ({ username, userId, role, createdAt, lastLoginAt, suspended: !!suspended, badges: badges || [] })
  );
  res.json({ users: list });
});

// Create user — admin only, supports role: 'admin' | 'checker'
app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (!['admin', 'checker'].includes(role)) return res.status(400).json({ error: 'Role must be admin or checker' });
  if (users.has(username.toLowerCase())) return res.status(409).json({ error: 'Username already taken' });
  const hash = await bcrypt.hash(password, 12);
  users.set(username.toLowerCase(), { username, userId: generateUserId(), passwordHash: hash, role, createdAt: new Date().toISOString() });
  persistUsers();
  addAudit('user_created', req.user.username, { target: username, role });
  res.json({ message: 'User created', username, role });
});

// Update user role (admin cannot demote themselves)
app.patch('/api/users/:username', requireAdmin, (req, res) => {
  const key = req.params.username.toLowerCase();
  const { role } = req.body;
  if (!['admin', 'checker'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (key === req.user.username.toLowerCase() && role !== 'admin') {
    return res.status(400).json({ error: 'Cannot demote your own admin account' });
  }
  const user = users.get(key);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const oldRole = user.role;
  user.role = role;
  persistUsers();
  addAudit('role_changed', req.user.username, { target: user.username, from: oldRole, to: role });
  res.json({ message: 'Role updated', username: user.username, role });
});

// Suspend / unsuspend user toggle
app.patch('/api/users/:username/suspend', requireAdmin, (req, res) => {
  const key = req.params.username.toLowerCase();
  if (key === req.user.username.toLowerCase())
    return res.status(400).json({ error: 'Cannot suspend your own account' });
  const user = users.get(key);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.suspended = !user.suspended;
  persistUsers();
  addAudit(user.suspended ? 'user_suspended' : 'user_unsuspended', req.user.username, { target: user.username });
  res.json({ message: user.suspended ? 'User suspended' : 'User unsuspended', suspended: user.suspended });
});

// Delete user (cannot delete self)
app.delete('/api/users/:username', requireAdmin, (req, res) => {
  const key = req.params.username.toLowerCase();
  if (key === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  if (!users.has(key)) return res.status(404).json({ error: 'User not found' });
  const u = users.get(key);
  users.delete(key);
  persistUsers();
  addAudit('user_deleted', req.user.username, { target: u.username });
  res.json({ message: 'User deleted' });
});

// Reset password (admin only)
app.post('/api/users/:username/reset-password', requireAdmin, async (req, res) => {
  const key = req.params.username.toLowerCase();
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const user = users.get(key);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.passwordHash = await bcrypt.hash(password, 12);
  persistUsers();
  addAudit('password_reset', req.user.username, { target: user.username });
  res.json({ message: 'Password reset' });
});

// Assign/remove badges for a user
app.patch('/api/users/:username/badges', requireAdmin, (req, res) => {
  const key = req.params.username.toLowerCase();
  const u = users.get(key);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { badges } = req.body; // array of badge strings
  if (!Array.isArray(badges)) return res.status(400).json({ error: 'badges must be an array' });
  const allowed = ['verified', 'trusted', 'vip'];
  u.badges = badges.filter(b => allowed.includes(b));
  persistUsers();
  addAudit('badges_updated', req.user.username, { target: u.username, badges: u.badges });
  res.json({ message: 'Badges updated', badges: u.badges });
});

// Online users — who has a waiting or scanning session right now
app.get('/api/admin/online', requireAdmin, (req, res) => {
  const online = new Set();
  for (const s of sessions.values()) {
    if (s.status === 'waiting' || s.status === 'scanning') online.add(s.createdBy);
  }
  res.json({ online: Array.from(online) });
});

// Legacy register kept for backwards compatibility — admin only now
app.post('/api/auth/register', requireAdmin, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (users.has(username.toLowerCase()))
    return res.status(409).json({ error: 'Username already taken' });
  const hash = await bcrypt.hash(password, 12);
  users.set(username.toLowerCase(), { username, userId: generateUserId(), passwordHash: hash, role: 'checker', createdAt: new Date().toISOString() });
  persistUsers();
  res.json({ message: 'Account created', username });
});

// Self-registration with optional invite code gate
app.post('/api/auth/signup', async (req, res) => {
  const { username, password, inviteCode } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (config.requireInviteCode) {
    if (!inviteCode) return res.status(403).json({ error: 'Invite code required' });
    const invite = invites[inviteCode.toUpperCase()];
    if (!invite) return res.status(403).json({ error: 'Invalid invite code' });
    // Expiry check
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date())
      return res.status(403).json({ error: 'Invite code has expired' });
    // Use-count check
    const usedCount = (invite.usedBy || []).length;
    const maxUses = invite.maxUses || 1;
    if (usedCount >= maxUses)
      return res.status(403).json({ error: 'Invite code has reached its use limit' });
  }
  if (users.has(username.toLowerCase()))
    return res.status(409).json({ error: 'Username already taken' });
  const hash = await bcrypt.hash(password, 12);
  users.set(username.toLowerCase(), { username, userId: generateUserId(), passwordHash: hash, role: 'checker', createdAt: new Date().toISOString() });
  if (config.requireInviteCode && inviteCode) {
    const inv = invites[inviteCode.toUpperCase()];
    if (inv) {
      if (!Array.isArray(inv.usedBy)) inv.usedBy = inv.usedBy ? [inv.usedBy] : [];
      inv.usedBy.push(username);
      if (!inv.firstUsedAt) inv.firstUsedAt = new Date().toISOString();
      inv.lastUsedAt = new Date().toISOString();
      persistInvites();
    }
  }
  persistUsers();
  addAudit('user_registered', username, { inviteCode: inviteCode || null });
  res.json({ message: 'Account created', username });
});

// ─── Admin — Stats ──────────────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const allSess = Array.from(sessions.values());
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek  = allSess.filter(s => new Date(s.createdAt).getTime() > weekAgo);
  const completed = allSess.filter(s => s.status === 'completed');
  const flagged   = completed.filter(s => (s.result?.flaggedItems || []).length > 0);
  const activeCheckers = new Set(thisWeek.map(s => s.createdBy)).size;
  res.json({
    totalSessions:     allSess.length,
    totalUsers:        users.size,
    sessionsThisWeek:  thisWeek.length,
    completedSessions: completed.length,
    flaggedSessions:   flagged.length,
    flaggedPercent:    completed.length ? Math.round(flagged.length / completed.length * 100) : 0,
    activeCheckers,
  });
});

// ─── Admin — Audit Log ───────────────────────────────────────────────────────────
app.get('/api/audit', requireAdmin, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  res.json({ audit: auditLog.slice(offset, offset + limit), total: auditLog.length });
});

// ─── Admin — CSV Export ───────────────────────────────────────────────────────────
app.get('/api/admin/export', requireAdmin, (req, res) => {
  const rows = Array.from(sessions.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const csvEsc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const header = ['ID','Target','Checker','Status','Risk Level','Risk Score','Flagged Count','Notes','Created At','Updated At'];
  const lines  = rows.map(s => [
    s.id, s.targetName, s.createdBy, s.status,
    s.result?.riskLevel || '', s.result?.riskScore || '',
    (s.result?.flaggedItems || []).length, s.notes, s.createdAt, s.updatedAt,
  ].map(csvEsc).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="sessions-${Date.now()}.csv"`);
  res.send([header.join(','), ...lines].join('\n'));
  addAudit('csv_export', req.user.username, { count: rows.length });
});

// ─── Admin — Server Config ──────────────────────────────────────────────────────────
app.get('/api/config', requireAdmin, (req, res) => res.json({ config }));
app.post('/api/config', requireAdmin, (req, res) => {
  const { sessionTtlHours, maxSessionsPerChecker, jwtExpiryHours, requireInviteCode } = req.body;
  if (sessionTtlHours       !== undefined) config.sessionTtlHours       = Math.max(1, parseInt(sessionTtlHours));
  if (maxSessionsPerChecker !== undefined) config.maxSessionsPerChecker = Math.max(0, parseInt(maxSessionsPerChecker));
  if (jwtExpiryHours        !== undefined) config.jwtExpiryHours        = Math.max(1, parseInt(jwtExpiryHours));
  if (requireInviteCode     !== undefined) config.requireInviteCode     = !!requireInviteCode;
  persistConfig();
  addAudit('config_changed', req.user.username, { sessionTtlHours, maxSessionsPerChecker, jwtExpiryHours, requireInviteCode });
  res.json({ message: 'Config saved', config });
});

// ─── Admin — Broadcast ─────────────────────────────────────────────────────────────
app.post('/api/admin/broadcast', requireAdmin, (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
  io.emit('admin_broadcast', { message: message.trim(), from: req.user.username, at: new Date().toISOString() });
  addAudit('broadcast', req.user.username, { message: message.trim() });
  res.json({ message: 'Broadcast sent' });
});

// ─── Global Chat ─────────────────────────────────────────────────────────────
app.get('/api/chat/messages', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
  const list = (Array.isArray(globalChat) ? globalChat.slice(-limit) : []).map(m => {
    const u = users.get(String(m.by || '').toLowerCase());
    return {
      ...m,
      userId: m.userId || u?.userId || null,
    };
  });
  res.json({ messages: list });
});

app.get('/api/chat/status', requireAuth, (req, res) => {
  const userObj = users.get(req.user.username.toLowerCase());
  const mutedUntil = userObj?.chatMutedUntil || null;
  const isMuted = !!(mutedUntil && new Date(mutedUntil).getTime() > Date.now());
  res.json({ muted: isMuted, mutedUntil: isMuted ? mutedUntil : null });
});

app.post('/api/chat/messages', requireAuth, (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message is required' });
  if (text.length > 500) return res.status(400).json({ error: 'Message is too long (max 500 chars)' });

  const userObj = users.get(req.user.username.toLowerCase());
  if (!userObj) return res.status(404).json({ error: 'User not found' });
  const hadUserId = !!userObj.userId;
  const userId = ensureUserId(userObj);
  if (!hadUserId) persistUsers();

  if (userObj.chatMutedUntil) {
    const mutedUntilMs = new Date(userObj.chatMutedUntil).getTime();
    if (mutedUntilMs > Date.now()) {
      return res.status(403).json({
        error: `You are muted until ${new Date(userObj.chatMutedUntil).toLocaleString()}`,
        mutedUntil: userObj.chatMutedUntil,
      });
    }
    delete userObj.chatMutedUntil;
    persistUsers();
  }

  const role = userObj?.role || req.user.role || 'checker';
  const badges = Array.isArray(userObj?.badges) ? userObj.badges : [];

  const message = {
    id: uuidv4(),
    text,
    by: req.user.username,
    userId,
    role,
    badges,
    timestamp: new Date().toISOString(),
  };

  if (!Array.isArray(globalChat)) globalChat = [];
  globalChat.push(message);
  if (globalChat.length > 500) globalChat = globalChat.slice(globalChat.length - 500);
  persistChat();

  io.emit('chat_message', { message });
  res.json({ message });
});

app.delete('/api/chat/messages/:id', requireAdmin, (req, res) => {
  const target = (Array.isArray(globalChat) ? globalChat : []).find(m => m.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Message not found' });
  target.deleted = true;
  target.deletedBy = req.user.username;
  target.deletedAt = new Date().toISOString();
  target.text = '';
  persistChat();
  addAudit('chat_message_deleted', req.user.username, { messageId: req.params.id });
  io.emit('chat_deleted', { message: target });
  res.json({ message: 'Chat message deleted' });
});

app.delete('/api/chat/messages', requireAdmin, (req, res) => {
  const count = Array.isArray(globalChat) ? globalChat.length : 0;
  globalChat = [];
  persistChat();
  addAudit('chat_cleared', req.user.username, { count });
  io.emit('chat_cleared', { by: req.user.username });
  res.json({ message: 'Chat cleared', count });
});

app.post('/api/chat/mute', requireAdmin, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const hours = Number(req.body?.hours);
  if (!username) return res.status(400).json({ error: 'Username is required' });
  if (!Number.isFinite(hours) || hours <= 0) return res.status(400).json({ error: 'Hours must be a positive number' });

  const key = username.toLowerCase();
  const target = users.get(key);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.username.toLowerCase() === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot mute yourself' });
  }

  const muteMs = Math.min(hours, 24 * 30) * 60 * 60 * 1000;
  const mutedUntil = new Date(Date.now() + muteMs).toISOString();
  target.chatMutedUntil = mutedUntil;
  const userId = ensureUserId(target);
  persistUsers();

  addAudit('chat_user_muted', req.user.username, { target: target.username, hours: Math.min(hours, 24 * 30) });
  io.to(`user:${target.username}`).emit('chat_muted', { mutedUntil, by: req.user.username });
  res.json({ message: 'User muted', username: target.username, userId, mutedUntil });
});

app.get('/api/chat/muted', requireAdmin, (req, res) => {
  const now = Date.now();
  const muted = Array.from(users.values())
    .filter(u => u.chatMutedUntil && new Date(u.chatMutedUntil).getTime() > now)
    .map(u => ({ username: u.username, userId: ensureUserId(u), mutedUntil: u.chatMutedUntil }))
    .sort((a, b) => new Date(a.mutedUntil) - new Date(b.mutedUntil));
  persistUsers();
  res.json({ muted });
});

app.post('/api/chat/unmute', requireAdmin, (req, res) => {
  const userId = String(req.body?.userId || '').trim().toUpperCase();
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const target = Array.from(users.values()).find(u => String(u.userId || '').toUpperCase() === userId);
  if (!target) return res.status(404).json({ error: 'User not found for this ID' });
  if (!target.chatMutedUntil || new Date(target.chatMutedUntil).getTime() <= Date.now()) {
    delete target.chatMutedUntil;
    persistUsers();
    return res.status(400).json({ error: 'User is not currently muted' });
  }

  delete target.chatMutedUntil;
  persistUsers();
  addAudit('chat_user_unmuted', req.user.username, { target: target.username, userId });
  io.to(`user:${target.username}`).emit('chat_unmuted', { by: req.user.username });
  res.json({ message: 'User unmuted', username: target.username, userId });
});


// ─── Profile Notes ─────────────────────────────────────────────────────────────────
app.get('/api/profiles/:name/notes', requireAuth, (req, res) => {
  res.json({ notes: profileNotes[req.params.name.toLowerCase()] || [] });
});
app.post('/api/profiles/:name/notes', requireAdmin, (req, res) => {
  const key = req.params.name.toLowerCase();
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Note text required' });
  if (!profileNotes[key]) profileNotes[key] = [];
  const note = { id: uuidv4(), text: text.trim(), by: req.user.username, at: new Date().toISOString() };
  profileNotes[key].unshift(note);
  persistNotes();
  res.json({ note });
});
app.delete('/api/profiles/:name/notes/:noteId', requireAdmin, (req, res) => {
  const key = req.params.name.toLowerCase();
  if (!profileNotes[key]) return res.status(404).json({ error: 'Not found' });
  profileNotes[key] = profileNotes[key].filter(n => n.id !== req.params.noteId);
  persistNotes();
  res.json({ message: 'Note deleted' });
});

// ─── Session Routes ───────────────────────────────────────────────────────────
app.post('/api/sessions', requireAuth, (req, res) => {
  if (config.maxSessionsPerChecker > 0 && req.user.role !== 'admin') {
    const active = Array.from(sessions.values())
      .filter(s => s.createdBy === req.user.username && s.status !== 'completed').length;
    if (active >= config.maxSessionsPerChecker)
      return res.status(429).json({ error: `Max active sessions (${config.maxSessionsPerChecker}) reached` });
  }
  const { targetName, notes } = req.body;
  const id = uuidv4();
  const session = {
    id,
    createdBy: req.user.username,
    targetName: targetName || 'Unknown',
    notes: notes || '',
    status: 'waiting',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: null
  };
  sessions.set(id, session);
  persistSessions();
  addAudit('session_created', req.user.username, { sessionId: id, targetName: session.targetName });
  res.json({ session });
});

app.get('/api/sessions', requireAuth, (req, res) => {
  let list = Array.from(sessions.values());
  if (req.user.role !== 'admin') list = list.filter(s => s.createdBy === req.user.username);
  res.json({ sessions: list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

app.get('/api/sessions/:id', requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.createdBy !== req.user.username && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  res.json({ session });
});

// Bulk delete sessions
app.delete('/api/sessions/bulk', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  let count = 0;
  for (const id of ids) {
    const session = sessions.get(id);
    if (!session) continue;
    if (session.createdBy !== req.user.username && req.user.role !== 'admin') continue;
    sessions.delete(id);
    addAudit('session_deleted', req.user.username, { sessionId: id, targetName: session.targetName, bulk: true });
    count++;
  }
  if (count) persistSessions();
  res.json({ message: `Deleted ${count} sessions`, count });
});

// Reassign session checker (admin only)
app.patch('/api/sessions/:id/assign', requireAdmin, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  const targetUser = users.get(username.toLowerCase());
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  const oldChecker = session.createdBy;
  session.createdBy = targetUser.username;
  session.updatedAt = new Date().toISOString();
  persistSessions();
  addAudit('session_assigned', req.user.username, { sessionId: session.id, targetName: session.targetName, from: oldChecker, to: targetUser.username });
  io.to(`user:${targetUser.username}`).emit('session_updated', { session });
  io.to('role:admin').emit('session_updated', { session });
  res.json({ message: 'Session reassigned', createdBy: session.createdBy });
});

// Client EXE download — token accepted via query param for direct browser downloads
app.get('/api/download/client', (req, res) => {
  const token = req.headers.authorization?.slice(7) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid token' }); }
  const exePath = path.join(__dirname, 'downloads/DetectableCC.exe');
  if (!require('fs').existsSync(exePath)) return res.status(404).json({ error: 'Client not found' });
  res.download(exePath, 'DetectableCC.exe');
});

// Public token validation — used by the .exe to verify the token before scanning
app.get('/api/verify/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status === 'completed') return res.status(409).json({ error: 'Session already completed' });
  res.json({
    ok: true,
    session: {
      targetName: session.targetName || '',
      createdBy:  session.createdBy  || '',
    },
  });
});

app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.createdBy !== req.user.username && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  sessions.delete(req.params.id);
  persistSessions();
  addAudit('session_deleted', req.user.username, { sessionId: req.params.id, targetName: session.targetName, forUser: session.createdBy });
  res.json({ message: 'Deleted' });
});

// ─── Client Submit Route (called by the .exe) ────────────────────────────────
// No auth middleware here - the sessionId IS the secret for this endpoint.
// Use HTTPS in production to protect the session token in transit.
app.post('/api/submit/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status === 'completed') {
    return res.status(409).json({ error: 'Session already submitted' });
  }

  const result = req.body;

  // Basic validation
  if (!result || typeof result !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  session.status = 'completed';
  session.updatedAt = new Date().toISOString();
  session.result = result;
  persistSessions();

  // ─── Evaluate alert rules ─────────────────────────────────────────────────
  const riskScore = result.riskScore || 0;
  const riskLevel = result.riskLevel || 'clean';
  const riskOrder = ['clean', 'low', 'medium', 'high', 'critical'];
  for (const rule of (config.alertRules || [])) {
    if (!rule.enabled) continue;
    const passes = rule.conditionType === 'score'
      ? riskScore >= rule.threshold
      : riskOrder.indexOf(riskLevel) >= riskOrder.indexOf(rule.threshold);
    if (!passes) continue;
    if (rule.action === 'flag') {
      session.flaggedByRule = rule.name || rule.id;
      persistSessions();
    }
    io.to('role:admin').emit('alert_rule_triggered', { rule, session: { id: session.id, targetName: session.targetName, riskScore, riskLevel } });
  }

  io.to(`session:${session.id}`).emit('scan_complete', { session });
  io.to(`user:${session.createdBy}`).emit('session_updated', { session });
  io.to('role:admin').emit('session_updated', { session });

  res.json({ message: 'Results received. Thank you.' });
});

// Update status to "scanning" (client is starting)
app.post('/api/submit/:sessionId/start', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  session.status = 'scanning';
  session.updatedAt = new Date().toISOString();
  persistSessions();

  io.to(`session:${session.id}`).emit('scan_started', { sessionId: session.id });
  io.to(`user:${session.createdBy}`).emit('session_updated', { session });
  io.to('role:admin').emit('session_updated', { session });

  res.json({ message: 'Scan started' });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('join_user', ({ token: t }) => {
    try {
      const payload = jwt.verify(t, JWT_SECRET);
      socket.join(`user:${payload.username}`);
      if (payload.role === 'admin') socket.join('role:admin');
    } catch {/* ignore invalid tokens */}
  });

  socket.on('watch_session', ({ sessionId, token: t }) => {
    try {
      jwt.verify(t, JWT_SECRET);
      socket.join(`session:${sessionId}`);
    } catch {/* ignore */}
  });

  socket.on('chat_typing', ({ token: t }) => {
    try {
      const payload = jwt.verify(t, JWT_SECRET);
      socket.broadcast.emit('chat_typing', { by: payload.username });
    } catch {/* ignore */}
  });
});

// ─── Session Notes ────────────────────────────────────────────────────────────
app.patch('/api/sessions/:id/notes', requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.createdBy !== req.user.username && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  const { notes } = req.body;
  session.notes = String(notes || '').slice(0, 2000);
  session.updatedAt = new Date().toISOString();
  persistSessions();
  addAudit('session_notes_updated', req.user.username, { sessionId: session.id });
  res.json({ message: 'Notes updated' });
});

// ─── Profiles API ────────────────────────────────────────────────────────────
app.get('/api/profiles', requireAuth, (req, res) => {
  let source = Array.from(sessions.values()).filter(s => s.status === 'completed');
  if (req.user.role !== 'admin') source = source.filter(s => s.createdBy === req.user.username);

  const map = new Map();
  for (const s of source) {
    const key = s.targetName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        targetName: s.targetName,
        scans: [],
        lastScan: s.updatedAt,
        highestRisk: 'clean',
        blacklisted: false,
        blacklistInfo: null,
        notes: profileNotes[key] || [],
      });
    }
    const p = map.get(key);
    p.scans.push({ id: s.id, riskLevel: s.result?.riskLevel, riskScore: s.result?.riskScore, date: s.updatedAt, by: s.createdBy });
    if (new Date(s.updatedAt) > new Date(p.lastScan)) p.lastScan = s.updatedAt;
    const order = ['clean','low','medium','high','critical'];
    if (order.indexOf(s.result?.riskLevel) > order.indexOf(p.highestRisk)) p.highestRisk = s.result.riskLevel;
  }
  res.json({ profiles: Array.from(map.values()).sort((a, b) => new Date(b.lastScan) - new Date(a.lastScan)) });
});

// Single profile
app.get('/api/profiles/:name', requireAuth, (req, res) => {
  const name = req.params.name.toLowerCase();
  let source = Array.from(sessions.values()).filter(s =>
    s.status === 'completed' && s.targetName.toLowerCase() === name);
  if (req.user.role !== 'admin') source = source.filter(s => s.createdBy === req.user.username);
  if (!source.length) return res.status(404).json({ error: 'Profile not found' });
  const targetName = source[0].targetName;
  const order = ['clean','low','medium','high','critical'];
  const scans = source.map(s => ({
    id: s.id, riskLevel: s.result?.riskLevel || 'clean',
    riskScore: s.result?.riskScore || 0,
    flaggedCount: (s.result?.flaggedItems || []).length,
    notes: s.notes || '', date: s.updatedAt, by: s.createdBy,
  })).sort((a, b) => new Date(b.date) - new Date(a.date));
  const highestRisk = scans.reduce((max, s) =>
    order.indexOf(s.riskLevel) > order.indexOf(max) ? s.riskLevel : max, 'clean');
  res.json({ profile: {
    targetName, scans, highestRisk, scanCount: scans.length,
    blacklisted: false, blacklistInfo: null,
    notes: profileNotes[name] || [],
  }});
});

// ─── Announcement Banner ─────────────────────────────────────────────────────
app.get('/api/banner', requireAuth, (req, res) => {
  // Auto-expire
  if (banner && banner.expiresAt && new Date(banner.expiresAt) < new Date()) {
    banner = null;
    persistBanner();
    io.emit('banner_updated', { banner: null });
  }
  res.json({ banner });
});
app.post('/api/banner', requireAdmin, (req, res) => {
  const { text, severity, expiresAt } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Banner text required' });
  const validSev = ['info', 'warning', 'critical'].includes(severity) ? severity : 'info';
  banner = {
    text: text.trim(),
    from: req.user.username,
    at: new Date().toISOString(),
    severity: validSev,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
  persistBanner();
  io.emit('banner_updated', { banner });
  addAudit('banner_set', req.user.username, { text: banner.text, severity: validSev });
  res.json({ banner });
});
app.delete('/api/banner', requireAdmin, (req, res) => {
  banner = null;
  persistBanner();
  io.emit('banner_updated', { banner: null });
  addAudit('banner_cleared', req.user.username, {});
  res.json({ message: 'Banner cleared' });
});

// ─── Client Download ─────────────────────────────────────────────────────────
const CLIENT_EXE = path.join(__dirname, 'downloads/DetectableCC.exe');
app.get('/api/download/client', (req, res) => {
  if (!fs.existsSync(CLIENT_EXE)) {
    return res.status(404).json({ error: 'Client binary not found. Please build the project first.' });
  }
  res.download(CLIENT_EXE, 'DetectableLV.exe');
});

// ─── Session Share ────────────────────────────────────────────────────────────
app.post('/api/sessions/:id/share', requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.createdBy !== req.user.username && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  if (session.status !== 'completed') return res.status(400).json({ error: 'Can only share completed sessions' });
  if (!session.shareToken) {
    session.shareToken = uuidv4();
    persistSessions();
    addAudit('session_shared', req.user.username, { sessionId: session.id, targetName: session.targetName });
  }
  res.json({ shareToken: session.shareToken });
});

app.delete('/api/sessions/:id/share', requireAuth, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.createdBy !== req.user.username && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });
  delete session.shareToken;
  persistSessions();
  res.json({ message: 'Share link revoked' });
});

// Public share — no auth required
app.get('/api/share/:token', (req, res) => {
  const session = Array.from(sessions.values()).find(s => s.shareToken === req.params.token);
  if (!session) return res.status(404).json({ error: 'Share link not found or expired' });
  const { id, targetName, status, createdAt, updatedAt, result } = session;
  // Omit internal/checker fields from public view
  const publicResult = result ? {
    riskLevel: result.riskLevel,
    riskScore: result.riskScore,
    flaggedItems: result.flaggedItems,
    systemInfo: result.systemInfo ? { os: result.systemInfo.os, cpu: result.systemInfo.cpu, gpu: result.systemInfo.gpu } : undefined,
  } : null;
  res.json({ session: { id, targetName, status, createdAt, updatedAt, result: publicResult } });
});

// ─── Verdict Override ─────────────────────────────────────────────────────────
app.patch('/api/sessions/:id/verdict', requireAdmin, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status !== 'completed') return res.status(400).json({ error: 'Session not completed' });
  const { verdict, reason } = req.body;
  const valid = ['clean', 'low', 'medium', 'high', 'critical'];
  if (!valid.includes(verdict)) return res.status(400).json({ error: 'Invalid verdict' });
  session.verdictOverride = { verdict, reason: (reason || '').slice(0, 500), by: req.user.username, at: new Date().toISOString() };
  session.updatedAt = new Date().toISOString();
  persistSessions();
  addAudit('verdict_override', req.user.username, { sessionId: session.id, targetName: session.targetName, verdict, reason });
  io.to(`session:${session.id}`).emit('verdict_overridden', { session });
  io.to(`user:${session.createdBy}`).emit('session_updated', { session });
  res.json({ message: 'Verdict overridden', verdictOverride: session.verdictOverride });
});

app.delete('/api/sessions/:id/verdict', requireAdmin, (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  delete session.verdictOverride;
  session.updatedAt = new Date().toISOString();
  persistSessions();
  addAudit('verdict_override_removed', req.user.username, { sessionId: session.id });
  res.json({ message: 'Verdict override removed' });
});

// ─── Session Templates ─────────────────────────────────────────────────────────
app.get('/api/templates', requireAuth, (req, res) => {
  res.json({ templates });
});
app.post('/api/templates', requireAdmin, (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template name required' });
  const tpl = { id: uuidv4(), name: name.trim(), description: (description || '').trim(), createdBy: req.user.username, createdAt: new Date().toISOString() };
  templates.push(tpl);
  persistTemplates();
  addAudit('template_created', req.user.username, { name: tpl.name });
  res.json({ template: tpl });
});
app.delete('/api/templates/:id', requireAdmin, (req, res) => {
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });
  const [removed] = templates.splice(idx, 1);
  persistTemplates();
  addAudit('template_deleted', req.user.username, { name: removed.name });
  res.json({ message: 'Template deleted' });
});

// ─── IP/HWID Cross-lookup ─────────────────────────────────────────────────────
app.get('/api/profiles/:name/related', requireAuth, (req, res) => {
  const name = req.params.name.toLowerCase();
  const profileSessions = Array.from(sessions.values()).filter(s =>
    s.status === 'completed' && s.targetName.toLowerCase() === name);
  if (!profileSessions.length) return res.json({ related: [] });
  // Collect hwids and ips from this profile's scans
  const hwids = new Set();
  const ips   = new Set();
  for (const s of profileSessions) {
    if (s.result?.systemInfo?.hwid) hwids.add(s.result.systemInfo.hwid);
    if (s.result?.systemInfo?.ipAddress || s.result?.ipAddress) ips.add(s.result?.systemInfo?.ipAddress || s.result?.ipAddress);
  }
  let source = Array.from(sessions.values()).filter(s =>
    s.status === 'completed' && s.targetName.toLowerCase() !== name);
  if (req.user.role !== 'admin') source = source.filter(s => s.createdBy === req.user.username);
  const related = [];
  for (const s of source) {
    const hwid = s.result?.systemInfo?.hwid;
    const ip   = s.result?.systemInfo?.ipAddress || s.result?.ipAddress;
    const matchHwid = hwid && hwids.has(hwid);
    const matchIp   = ip   && ips.has(ip);
    if (matchHwid || matchIp) {
      related.push({ id: s.id, targetName: s.targetName, date: s.updatedAt, riskLevel: s.result?.riskLevel, matchedOn: matchHwid ? 'hwid' : 'ip' });
    }
  }
  res.json({ related });
});

// ─── Alert Rules ──────────────────────────────────────────────────────────────
app.get('/api/alert-rules', requireAdmin, (req, res) => {
  res.json({ rules: config.alertRules || [] });
});
app.put('/api/alert-rules', requireAdmin, (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules must be an array' });
  config.alertRules = rules.map(r => ({
    id:            r.id || uuidv4(),
    name:          String(r.name || '').slice(0, 100),
    conditionType: ['score', 'level'].includes(r.conditionType) ? r.conditionType : 'score',
    threshold:     r.threshold,
    action:        ['auto_ban', 'flag'].includes(r.action) ? r.action : 'flag',
    enabled:       !!r.enabled,
  }));
  persistConfig();
  addAudit('alert_rules_updated', req.user.username, { count: config.alertRules.length });
  res.json({ rules: config.alertRules });
});

// ─── Invite Codes ─────────────────────────────────────────────────────────────
app.get('/api/invites', requireAdmin, (req, res) => {
  res.json({ invites: Object.values(invites) });
});
app.post('/api/invites', requireAdmin, (req, res) => {
  const code = uuidv4().slice(0, 8).toUpperCase();
  const maxUses  = Math.max(1, parseInt(req.body.maxUses) || 1);
  const expiresAt = req.body.expiresAt || null;
  invites[code] = {
    code,
    createdBy: req.user.username,
    createdAt: new Date().toISOString(),
    usedBy: [],
    firstUsedAt: null,
    lastUsedAt: null,
    maxUses,
    expiresAt,
  };
  persistInvites();
  addAudit('invite_created', req.user.username, { code, maxUses, expiresAt });
  res.json({ invite: invites[code] });
});
app.delete('/api/invites/:code', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!invites[code]) return res.status(404).json({ error: 'Invite not found' });
  delete invites[code];
  persistInvites();
  addAudit('invite_deleted', req.user.username, { code });
  res.json({ message: 'Invite deleted' });
});

// ─── HTML page routes (before SPA fallback) ───────────────────────────────────
app.get('/profiles/:name', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/profile.html'));
});
app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/share.html'));
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[detectable.cc] Server running on http://localhost:${PORT}`);
  if (defaultAdminSeededThisBoot) {
    console.log('[detectable.cc] Default login: admin / admin123  <- CHANGE IN PRODUCTION');
  } else {
    console.log('[detectable.cc] Existing users loaded from backend/data/users.json');
  }
});
