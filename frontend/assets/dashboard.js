/* dashboard.js  v4 */
(function(){const t=localStorage.getItem('dlv_theme');if(t)document.documentElement.setAttribute('data-theme',t);})();
const token = localStorage.getItem('dlv_token');
const user  = localStorage.getItem('dlv_user');
const role  = localStorage.getItem('dlv_role');
if (!token) window.location.href = '/';

// Wire up the download button with the auth token in the URL
const _dlBtn = document.getElementById('dlClientBtn');
if (_dlBtn && token) _dlBtn.href = `/api/download/client?token=${encodeURIComponent(token)}`;

// ─── Theme toggle ─────────────────────────────────────────────────────────────
(function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙';
  btn.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dlv_theme', next);
    btn.textContent = next === 'light' ? '☀️' : '🌙';
  });
})();

// ─── Live clock ───────────────────────────────────────────────────────────────
(function startClock() {
  function tick() {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2,'0');
    const mm  = String(now.getMinutes()).padStart(2,'0');
    const ss  = String(now.getSeconds()).padStart(2,'0');
    const el  = document.getElementById('topbarClock');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
  }
  tick(); setInterval(tick, 1000);
})();

// Sidebar user
const _sidebarUser   = document.getElementById('sidebarUsername');
const _sidebarAvatar = document.getElementById('sidebarAvatar');
const _roleLabel     = document.getElementById('sidebarRoleLabel');
if (_sidebarUser)   _sidebarUser.textContent   = user || '—';
if (_sidebarAvatar) _sidebarAvatar.textContent = (user || '?')[0].toUpperCase();
if (_roleLabel)     _roleLabel.textContent     = role === 'admin' ? 'Administrator' : 'Checker';

// Inject admin nav + topbar actions
if (role === 'admin') {
  const nav = document.getElementById('sidebarNav');
  if (nav) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="sidebar-section-label">Admin</div>
      <a href="/users.html" class="sidebar-link">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Users
      </a>
      <a href="/audit.html" class="sidebar-link">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Audit Log
      </a>
      <a href="/settings.html" class="sidebar-link">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </a>`;
    nav.appendChild(div);
  }

  // Inject export + broadcast buttons into topbar
  const topbarRight = document.querySelector('.topbar-right');
  if (topbarRight) {
    const adminBtns = document.createElement('div');
    adminBtns.style.cssText = 'display:flex;gap:8px;align-items:center';
    adminBtns.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="exportCSV()" title="Export all sessions to CSV">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export CSV
      </button>
      <button class="btn btn-ghost btn-sm" onclick="openBroadcastModal()" title="Send announcement to all online checkers">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        Broadcast
      </button>`;
    topbarRight.prepend(adminBtns);
  }

  loadAdminStats();
}

let allSessions   = [];
let activeFilter  = 'all';
let createdSessId = null;
let profileCache  = {}; // name.toLowerCase() → scans[]
let selectedIds   = new Set();
const chatState = { messages: [], typingTimer: null, mutedUntil: null };

const socket = io();

socket.on('connect', () => socket.emit('join_user', { token }));
socket.on('session_updated', () => loadSessions());
socket.on('banner_updated', ({ banner }) => renderBanner(banner));
socket.on('session_expiring', ({ sessionId, targetName, minutesLeft }) => {
  toast(`⚠ Session for "${esc(targetName)}" expires in ${minutesLeft} min`, 'warn');
});
socket.on('chat_message', ({ message }) => {
  chatState.messages.push(message);
  if (chatState.messages.length > 300) chatState.messages = chatState.messages.slice(chatState.messages.length - 300);
  renderChatMessages(true);
});
socket.on('chat_deleted', ({ id }) => {
  chatState.messages = chatState.messages.filter(m => m.id !== id);
  renderChatMessages(false);
});
socket.on('chat_cleared', () => {
  chatState.messages = [];
  renderChatMessages(false);
});
socket.on('chat_typing', ({ by }) => {
  if (!by || by === user) return;
  const hint = document.getElementById('chatTypingHint');
  if (!hint) return;
  hint.textContent = `${by} is typing...`;
  if (chatState.typingTimer) clearTimeout(chatState.typingTimer);
  chatState.typingTimer = setTimeout(() => { hint.textContent = ''; }, 1300);
});
socket.on('chat_muted', ({ mutedUntil }) => {
  setChatMutedState(mutedUntil || null);
  toast(`Chat muted until ${new Date(mutedUntil).toLocaleString()}`, 'warn');
});

// Notification bell
if (typeof initNotifBell === 'function') initNotifBell(socket);

// ─── Admin Stats ─────────────────────────────────────────────────────────────
async function loadAdminStats() {
  try {
    const res  = await apiFetch('/api/admin/stats');
    const data = await res.json();
    const s    = data;
    const bar  = document.getElementById('adminStatsBar');
    if (!bar) return;
    bar.innerHTML = `
      <div class="admin-stat"><div class="admin-stat-val">${s.totalSessions}</div><div class="admin-stat-lbl">Total Sessions</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${s.totalUsers}</div><div class="admin-stat-lbl">Users</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${s.sessionsThisWeek}</div><div class="admin-stat-lbl">This Week</div></div>
      <div class="admin-stat"><div class="admin-stat-val text-red">${s.flaggedSessions}</div><div class="admin-stat-lbl">Flagged (${s.flaggedPercent}%)</div></div>
      <div class="admin-stat"><div class="admin-stat-val text-blue">${s.activeCheckers}</div><div class="admin-stat-lbl">Active Checkers</div></div>`;
    bar.classList.remove('hidden');
  } catch (e) { console.error('adminStats', e); }
}

// ─── Load sessions ────────────────────────────────────────────────────────────
async function loadSessions() {
  try {
    const [sessRes, profRes] = await Promise.all([
      apiFetch('/api/sessions'),
      apiFetch('/api/profiles'),
    ]);
    const sessData = await sessRes.json();
    const profData = profRes.ok ? await profRes.json() : { profiles: [] };
    allSessions = sessData.sessions || [];
    // Build profile cache for sparklines
    profileCache = {};
    for (const p of (profData.profiles || [])) {
      profileCache[p.targetName.toLowerCase()] = p.scans || [];
    }
    // Clear skeleton cards on first real data load
    document.querySelectorAll('.skeleton-card').forEach(el => el.remove());
    renderStats();
    renderSessions();
    if (role === 'admin') loadAdminStats();
  } catch (e) { console.error(e); }
}

// ─── Announcement banner ──────────────────────────────────────────────────────
async function loadBanner() {
  try {
    const res  = await apiFetch('/api/banner');
    const data = await res.json();
    renderBanner(data.banner);
  } catch {}
}
function renderBanner(b) {
  const el = document.getElementById('announcementBanner');
  if (!el) return;
  if (!b || !b.text) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const sev   = b.severity || 'info';
  const ts    = b.at ? new Date(b.at).toLocaleString() : '';
  const expStr = b.expiresAt ? `  ·  Expires ${new Date(b.expiresAt).toLocaleString()}` : '';
  const sevLabel = { info: 'ℹ Info', warning: '⚠️ Warning', critical: '🔴 Critical' }[sev] || 'ℹ Info';
  el.innerHTML = `<div class="announcement-banner banner-sev-${sev}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
    <div class="announcement-banner-text">
      <div><strong>${sevLabel}</strong> &nbsp;${esc(b.text)}</div>
      <div class="announcement-banner-by">Set by ${esc(b.from)} &middot; ${ts}${expStr}</div>
    </div>
    <button class="announcement-banner-close" onclick="this.closest('.announcement-banner').parentElement.style.display='none'">&#x2715;</button>
  </div>`;
}

function renderStats() {
  animateCount('statTotal',     allSessions.length);
  animateCount('statWaiting',   allSessions.filter(s => s.status === 'waiting').length);
  animateCount('statScanning',  allSessions.filter(s => s.status === 'scanning').length);
  animateCount('statCompleted', allSessions.filter(s => s.status === 'completed').length);
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const duration = 600;
  const step     = 16;
  const steps    = duration / step;
  const inc      = (target - current) / steps;
  let   val      = current;
  const timer = setInterval(() => {
    val += inc;
    const rounded = Math.round(val);
    el.textContent = rounded;
    if ((inc > 0 && rounded >= target) || (inc < 0 && rounded <= target) || inc === 0) {
      el.textContent = target;
      clearInterval(timer);
    }
  }, step);
}

function renderSessions() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const filtered = allSessions.filter(s => {
    if (activeFilter !== 'all' && s.status !== activeFilter) return false;
    if (query && !s.targetName.toLowerCase().includes(query) &&
        !s.id.includes(query) && !(s.createdBy||'').toLowerCase().includes(query)) return false;
    return true;
  });

  const grid  = document.getElementById('sessionsList');
  const empty = document.getElementById('noSessions');
  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = filtered.map(s => {
    const riskLevel = s.result?.riskLevel || (s.status === 'completed' ? 'clean' : '');
    const flagCount = (s.result?.flaggedItems || []).length;
    const date      = new Date(s.createdAt).toLocaleString();
    const badge     = buildBadge(s.status, s.result);
    const byLabel   = role === 'admin' && s.createdBy !== user
      ? `<span class="session-meta-item" style="color:var(--accent);font-size:11px">by ${esc(s.createdBy)}</span>` : '';
    // Sparkline for completed sessions
    const sparkHtml = s.status === 'completed' ? buildSparkline(s.targetName) : '';
    // Share indicator
    const shareChip = s.shareToken ? `<span class="share-chip">🔗 Shared</span>` : '';
    const isSelected = selectedIds.has(s.id);
    return `
      <div class="session-card risk-${riskLevel}${isSelected ? ' session-selected' : ''}" id="card-${s.id}">
        <label class="session-checkbox" onclick="event.stopPropagation()">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelect('${s.id}', this.checked)">
        </label>
        <div style="flex:1;min-width:0;cursor:pointer" onclick="go('/session.html?id=${s.id}')">
          <div class="session-target">${esc(s.targetName)}</div>
          <div class="session-meta">
            <span class="session-meta-item text-muted">${s.id.slice(0,8)}…</span>
            <span class="session-meta-item text-muted">${date}</span>
            ${byLabel}
            ${s.notes ? `<span class="session-meta-item text-muted">${esc(s.notes)}</span>` : ''}
            ${s.status === 'completed' && s.result ? `
              <span class="session-meta-item">
                <span class="sev-pill sev-${riskLevel}">${riskLevel.toUpperCase()}</span>
                ${flagCount > 0 ? `<span class="text-muted" style="font-size:11px">${flagCount} flagged</span>` : ''}
              </span>` : ''}
            ${shareChip}
          </div>
          ${sparkHtml}
        </div>
        <div class="session-card-right">
          ${badge}
          <button class="btn btn-danger btn-sm"
            onclick="event.stopPropagation();deleteSession('${s.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

// ─── Global chat ─────────────────────────────────────────────────────────────
function _chatBadges(msg) {
  if ((msg.role || '').toLowerCase() === 'admin') {
    return '<span class="chat-badge chat-badge-admin">Admin</span>';
  }
  for (const b of (Array.isArray(msg.badges) ? msg.badges : [])) {
    if (String(b).toLowerCase() === 'verified') {
      return '<span class="chat-badge chat-badge-verified">Verified</span>';
    }
  }
  return '';
}

function _chatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderChatMessages(scrollBottom = false) {
  const list = document.getElementById('globalChatList');
  if (!list) return;
  const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
  if (!chatState.messages.length) {
    list.innerHTML = '<div class="text-muted" style="font-size:12px;padding:8px">No messages yet.</div>';
    return;
  }
  list.innerHTML = chatState.messages.map(m => {
    const muteBtn = role === 'admin' && (m.by || '').toLowerCase() !== (user || '').toLowerCase()
      ? `<button class="chat-delete-btn" onclick="muteChatUser('${encodeURIComponent(m.by || '')}')" title="Mute user">Mute</button>`
      : '';
    const delBtn = role === 'admin'
      ? `<button class="chat-delete-btn" onclick="deleteChatMessage('${m.id}')" title="Delete message">Delete</button>`
      : '';
    return `<div class="chat-row" id="chat-${m.id}">
      <div class="chat-row-head">
        <div class="chat-row-meta">
          <span class="chat-by">${esc(m.by || 'Unknown')}</span>
          ${m.userId ? `<span class="chat-time">${esc(m.userId)}</span>` : ''}
          ${_chatBadges(m)}
          <span class="chat-time">${_chatTime(m.timestamp)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">${muteBtn}${delBtn}</div>
      </div>
      <div class="chat-text">${esc(m.text)}</div>
    </div>`;
  }).join('');
  if (scrollBottom || nearBottom) list.scrollTop = list.scrollHeight;
}

async function loadChatMessages() {
  try {
    const res = await apiFetch('/api/chat/messages?limit=180');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chat failed');
    chatState.messages = Array.isArray(data.messages) ? data.messages : [];
    renderChatMessages(true);
  } catch (e) {
    console.error('chat', e);
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('chatSendBtn');
  if (!input || !btn) return;
  if (chatState.mutedUntil) {
    toast(`You are muted until ${new Date(chatState.mutedUntil).toLocaleString()}`, 'warn');
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  btn.disabled = true;
  try {
    const res = await apiFetch('/api/chat/messages', 'POST', { text });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send');
    input.value = '';
  } catch (e) {
    toast(`Chat: ${e.message}`, 'error');
  }
  btn.disabled = false;
}

async function deleteChatMessage(id) {
  if (role !== 'admin') return;
  const res = await apiFetch(`/api/chat/messages/${id}`, 'DELETE');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    toast(d.error || 'Delete failed', 'error');
  }
}

async function clearChatMessages() {
  if (role !== 'admin') return;
  if (!confirm('Clear all global chat messages?')) return;
  const res = await apiFetch('/api/chat/messages', 'DELETE');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    toast(d.error || 'Clear failed', 'error');
    return;
  }
  toast('Chat cleared', 'info');
}

async function muteChatUser(encodedUsername) {
  if (role !== 'admin') return;
  const username = decodeURIComponent(encodedUsername || '');
  const raw = prompt(`Mute ${username} for how many hours?`, '1');
  if (raw === null) return;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    toast('Enter a valid positive hour value', 'error');
    return;
  }
  const res = await apiFetch('/api/chat/mute', 'POST', { username, hours });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error || 'Mute failed', 'error');
    return;
  }
  toast(`${username} muted for ${hours}h`, 'success');
  loadMutedUsers();
}

function setChatMutedState(mutedUntil) {
  chatState.mutedUntil = mutedUntil;
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('chatSendBtn');
  if (!input || !btn) return;
  if (mutedUntil) {
    input.disabled = true;
    btn.disabled = true;
    input.placeholder = `Muted until ${new Date(mutedUntil).toLocaleString()}`;
  } else {
    input.disabled = false;
    btn.disabled = false;
    input.placeholder = 'Type a message...';
  }
}

async function loadChatStatus() {
  try {
    const res = await apiFetch('/api/chat/status');
    const data = await res.json();
    if (!res.ok) return;
    setChatMutedState(data.muted ? data.mutedUntil : null);
  } catch {}
}

function renderMutedUsers(rows) {
  const wrap = document.getElementById('chatMutedWrap');
  const list = document.getElementById('chatMutedList');
  if (!wrap || !list) return;
  if (role !== 'admin') {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  if (!rows.length) {
    list.innerHTML = '<div class="text-muted" style="font-size:11px">No muted users.</div>';
    return;
  }
  list.innerHTML = rows.map(r => `
    <div class="chat-muted-row">
      <div class="chat-muted-main">
        <div class="chat-muted-user">${esc(r.username)}</div>
        <div class="chat-muted-meta">${esc(r.userId || 'No ID')} · until ${new Date(r.mutedUntil).toLocaleString()}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="unmuteByUserId('${encodeURIComponent(r.userId || '')}')">Unmute</button>
    </div>`).join('');
}

async function loadMutedUsers() {
  if (role !== 'admin') return;
  try {
    const res = await apiFetch('/api/chat/muted');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Muted users fetch failed');
    renderMutedUsers(Array.isArray(data.muted) ? data.muted : []);
  } catch (e) {
    console.error('muted-users', e);
  }
}

async function unmuteByUserId(encodedUserId) {
  if (role !== 'admin') return;
  const userId = decodeURIComponent(encodedUserId || '');
  if (!userId) return;
  const res = await apiFetch('/api/chat/unmute', 'POST', { userId });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error || 'Unmute failed', 'error');
    return;
  }
  toast(`Unmuted ${data.username || userId}`, 'success');
  loadMutedUsers();
}

function initGlobalChat() {
  const clearBtn = document.getElementById('chatClearBtn');
  if (clearBtn && role === 'admin') clearBtn.classList.remove('hidden');
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    input.addEventListener('input', () => {
      if (!chatState.mutedUntil) socket.emit('chat_typing', { token });
    });
  }
  loadChatStatus();
  loadChatMessages();
  loadMutedUsers();
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
const RISK_COLORS_SPARK = { clean:'#10b981', low:'#5b6ef5', medium:'#f59e0b', high:'#ef4444', critical:'#dc2626' };
function buildSparkline(playerName) {
  const scans = (profileCache[playerName.toLowerCase()] || []).slice(0, 10).reverse();
  if (scans.length < 2) return '';
  const scores = scans.map(s => s.riskScore || 0);
  const max    = Math.max(...scores, 10);
  const W = 80, H = 24, pad = 2;
  const pts = scores.map((v, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v / max) * (H - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastLevel = scans[scans.length - 1]?.riskLevel || 'clean';
  const color = RISK_COLORS_SPARK[lastLevel] || '#5b6ef5';
  return `<div class="card-sparkline">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">
      <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
      <circle cx="${pts[pts.length-1].split(',')[0]}" cy="${pts[pts.length-1].split(',')[1]}" r="2.5" fill="${color}"/>
    </svg>
    <span class="card-sparkline-label">${scans.length} scans</span>
  </div>`;
}

function buildBadge(status, result) {
  if (status === 'completed' && result) {
    const fl = (result.flaggedItems || []).length;
    if (fl > 0) return `<span class="badge badge-flagged">${fl} Flagged</span>`;
    return `<span class="badge badge-clean">Clean</span>`;
  }
  if (status === 'scanning') return `<span class="badge badge-scanning">Scanning</span>`;
  return `<span class="badge badge-waiting">Waiting</span>`;
}

function filterSessions() { renderSessions(); }
function setFilter(el) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  activeFilter = el.dataset.filter;
  renderSessions();
}

// ─── New session modal ────────────────────────────────────────────────────────
async function openNewSessionModal() {
  document.getElementById('newSessionModal').classList.remove('hidden');
  document.getElementById('targetName').focus();
  await loadTemplatesForModal();
}
function closeNewSessionModal() {
  document.getElementById('newSessionModal').classList.add('hidden');
  document.getElementById('targetName').value = '';
  document.getElementById('sessionNotes').value = '';
  document.getElementById('templatePicker').value = '';
}
async function loadTemplatesForModal() {
  try {
    const res = await apiFetch('/api/templates');
    if (!res.ok) return;
    const { templates } = await res.json();
    const group = document.getElementById('templatePickerGroup');
    const picker = document.getElementById('templatePicker');
    if (!templates || !templates.length) { group.style.display = 'none'; return; }
    group.style.display = '';
    picker.innerHTML = '<option value="">— select a template —</option>' +
      templates.map(t => `<option value="${encodeURIComponent(t.description)}">${escapeHtml(t.name)}</option>`).join('');
  } catch {}
}
function applyTemplate(encodedDesc) {
  if (!encodedDesc) return;
  document.getElementById('sessionNotes').value = decodeURIComponent(encodedDesc);
}
async function createSession() {
  const btn        = document.getElementById('createBtn');
  const targetName = document.getElementById('targetName').value.trim() || 'Unknown';
  const notes      = document.getElementById('sessionNotes').value.trim();
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const res  = await apiFetch('/api/sessions', 'POST', { targetName, notes });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeNewSessionModal();
    createdSessId = data.session.id;
    document.getElementById('createdSessionId').value = createdSessId;
    document.getElementById('playerInstructions').textContent =
      `1. Download DetectableLV.exe\n2. Run as Administrator\n3. Enter token: ${createdSessId}`;
    document.getElementById('createdModal').classList.remove('hidden');
    loadSessions();
    toast('Session created', 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Create Session';
}
function closeCreatedModal() { document.getElementById('createdModal').classList.add('hidden'); createdSessId = null; }
function openSession() { if (createdSessId) go(`/session.html?id=${createdSessId}`); }
function copyToken() {
  navigator.clipboard.writeText(document.getElementById('createdSessionId').value)
    .then(() => toast('Token copied to clipboard', 'success'));
}

// ─── Register checker (legacy modal) ─────────────────────────────────────────
function openRegisterModal()  { document.getElementById('registerModal').classList.remove('hidden'); }
function closeRegisterModal() {
  document.getElementById('registerModal').classList.add('hidden');
  document.getElementById('regUsername').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('regError').classList.add('hidden');
}
async function registerChecker() {
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const err      = document.getElementById('regError');
  err.classList.add('hidden');
  try {
    const res  = await apiFetch('/api/auth/register', 'POST', { username, password });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeRegisterModal();
    toast(`Checker account '${username}' created`, 'success');
  } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
}

// ─── Delete / select sessions ────────────────────────────────────────────────
function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  _updateBulkBar();
  const card = document.getElementById('card-' + id);
  if (card) card.classList.toggle('session-selected', checked);
}
function _updateBulkBar() {
  const bar   = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  if (!bar) return;
  if (selectedIds.size > 0) {
    bar.classList.remove('hidden');
    count.textContent = `${selectedIds.size} selected`;
  } else {
    bar.classList.add('hidden');
  }
}
function selectAllSessions() {
  allSessions.forEach(s => selectedIds.add(s.id));
  renderSessions();
  _updateBulkBar();
}
function clearSelection() {
  selectedIds.clear();
  renderSessions();
  _updateBulkBar();
}
async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} session(s)? This cannot be undone.`)) return;
  const ids = Array.from(selectedIds);
  const res = await apiFetch('/api/sessions/bulk', 'DELETE', { ids });
  const data = await res.json();
  if (!res.ok) { toast('Bulk delete failed: ' + data.error, 'error'); return; }
  selectedIds.clear();
  toast(`Deleted ${data.count} session(s)`, 'info');
  loadSessions();
}
async function deleteSession(id) {
  if (!confirm('Delete this session? This cannot be undone.')) return;
  await apiFetch(`/api/sessions/${id}`, 'DELETE');
  loadSessions();
  toast('Session deleted', 'info');
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  const a = document.createElement('a');
  a.href = `/api/admin/export`;
  a.setAttribute('download', '');
  const headers = new Headers({ 'Authorization': `Bearer ${token}` });
  fetch(a.href, { headers }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported', 'success');
  }).catch(() => toast('Export failed', 'error'));
}

// ─── Broadcast modal ──────────────────────────────────────────────────────────
function openBroadcastModal() {
  document.getElementById('broadcastMsg').value = '';
  document.getElementById('broadcastError').classList.add('hidden');
  document.getElementById('broadcastModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('broadcastMsg').focus(), 50);
}
function closeBroadcastModal() { document.getElementById('broadcastModal').classList.add('hidden'); }
async function sendBroadcast() {
  const message = document.getElementById('broadcastMsg').value.trim();
  const err = document.getElementById('broadcastError');
  const btn = document.getElementById('broadcastBtn');
  err.classList.add('hidden');
  if (!message) { err.textContent = 'Message is required.'; err.classList.remove('hidden'); return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res  = await apiFetch('/api/admin/broadcast', 'POST', { message });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    closeBroadcastModal();
    toast('Broadcast sent to all online users', 'success');
  } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
  btn.disabled = false; btn.textContent = 'Send Broadcast';
}
// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c   = document.getElementById('toastContainer');
  const el  = document.createElement('div');
  el.className = `toast toast-${type}${type==='warn'?' toast-warn':''}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('hiding'); el.addEventListener('animationend', () => el.remove()); }, 4500);
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
function logout() { localStorage.clear(); window.location.href = '/'; }
function go(url) { window.location.href = url; }
function apiFetch(url, method = 'GET', body = null) {
  const opts = { method, headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(r => { if (r.status === 401) logout(); return r; });
}
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!document.getElementById('newSessionModal').classList.contains('hidden')) createSession();
  if (!document.getElementById('registerModal').classList.contains('hidden'))   registerChecker();
  if (!document.getElementById('broadcastModal').classList.contains('hidden'))  sendBroadcast();
});

loadBanner();
loadSessions();
initGlobalChat();

