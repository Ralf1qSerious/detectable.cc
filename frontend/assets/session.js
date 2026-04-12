/* session.js  v2 */
(function(){const t=localStorage.getItem('dlv_theme');if(t)document.documentElement.setAttribute('data-theme',t);})();
const token = localStorage.getItem('dlv_token');
const user  = localStorage.getItem('dlv_user');
const role  = localStorage.getItem('dlv_role');
if (!token) window.location.href = '/';

const params    = new URLSearchParams(window.location.search);
const sessionId = params.get('id');
if (!sessionId) window.location.href = '/dashboard.html';

// Sidebar user
const _su = document.getElementById('sidebarUsername');
const _sa = document.getElementById('sidebarAvatar');
const _rl = document.getElementById('sidebarRoleLabel');
if (_su) _su.textContent = user || '—';
if (_sa) _sa.textContent = (user || '?')[0].toUpperCase();
if (_rl) _rl.textContent = role === 'admin' ? 'Administrator' : 'Checker';

// Theme toggle
const _themeBtn = document.getElementById('themeToggle');
if (_themeBtn) {
  _themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙';
  _themeBtn.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dlv_theme', next);
    _themeBtn.textContent = next === 'light' ? '☀️' : '🌙';
  });
}

// Inject admin nav
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
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Audit Log
      </a>
      <a href="/settings.html" class="sidebar-link">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </a>`;
    nav.appendChild(div);
  }
}

const socket = io();

// Re-join rooms on every connect (fixes missed events after socket reconnect)
socket.on('connect', () => {
  socket.emit('join_user',     { token });
  socket.emit('watch_session', { sessionId, token });
});
socket.on('scan_started',    ({ sessionId: sid }) => { if (sid === sessionId) showScanning(); });
socket.on('scan_complete',   ({ session })         => { if (session.id === sessionId) renderResults(session); });
socket.on('verdict_overridden', ({ session }) => { if (session.id === sessionId) { renderOverrideBanner(session.verdictOverride); syncOverrideUI(session.verdictOverride); } });
socket.on('session_expiring', ({ sessionId: sid, targetName, minutesLeft }) => {
  if (sid === sessionId) {
    toast(`⚠ Session for "${esc(targetName)}" expires in ${minutesLeft} min`, 'warn', 8000);
  }
});

// Notification bell
if (typeof initNotifBell === 'function') initNotifBell(socket);

// --- Polling fallback (catches any missed socket events) ---
let _pollTimer = null;
function startPolling() {
  stopPolling();
  _pollTimer = setInterval(async () => {
    try {
      const res  = await apiFetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const s    = data.session;
      if (s.status === 'completed') { stopPolling(); renderResults(s); }
      else if (s.status === 'scanning') showScanning();
    } catch { /* ignore */ }
  }, 5000);
}
function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// --- Load session ---
async function loadSession() {
  const res  = await apiFetch(`/api/sessions/${sessionId}`);
  const data = await res.json();
  if (!res.ok) { toast('Error: ' + data.error, 'error'); return; }
  const s = data.session;
  setHeader(s);
  if (s.status === 'waiting')        showWaiting(s);
  else if (s.status === 'scanning')  showScanning();
  else                               renderResults(s);
}

function setHeader(s) {
  document.title = `detectable.cc — ${s.targetName}`;
  document.getElementById('sessionTitle').textContent = s.targetName;
  document.getElementById('sessionMeta').textContent  =
    `Session by ${s.createdBy}  ·  ${new Date(s.createdAt).toLocaleString()}`;
  // Populate notes textarea
  const ta = document.getElementById('notesTextarea');
  if (ta) {
    ta.value = s.notes || '';
    onNotesInput();
  }
  // Admin: session assignment + ban button + verdict override
  if (role === 'admin') {
    const assignSec = document.getElementById('sessionAssignSection');
    if (assignSec) {
      assignSec.style.display = '';
      const assignedByEl = document.getElementById('assignedBy');
      if (assignedByEl) assignedByEl.textContent = `Currently assigned to: ${s.createdBy}`;
      loadCheckersForAssign(s.createdBy);
    }
    const banEl = document.getElementById('notesAdminBan');
    if (banEl) {
      banEl.innerHTML = `<a href="/profiles/${encodeURIComponent(s.targetName)}" class="btn btn-ghost btn-sm" style="font-size:12px">View Profile →</a>`;
      banEl.classList.remove('hidden');
    }
    if (s.status === 'completed') {
      const ovsec = document.getElementById('verdictOverrideSection');
      if (ovsec) ovsec.style.display = '';
      syncOverrideUI(s.verdictOverride);
      renderOverrideBanner(s.verdictOverride);
    }
  }
  // Show share button for completed sessions
  if (s.status === 'completed') {
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.style.display = '';
      shareBtn.dataset.shared = s.shareToken ? '1' : '0';
      shareBtn.textContent = s.shareToken ? '🔗 Shared' : 'Share';
    }
  }
}

// --- Status views ---
function showWaiting(s) {
  setBadge('waiting');
  show('waitingState'); hide('scanningState'); hide('resultsState');
  document.getElementById('waitTokenInput').value = s.id;
  startPolling();
}
function showScanning() {
  setBadge('scanning');
  hide('waitingState'); show('scanningState'); hide('resultsState');
  startPolling();
}
function copyWaitToken() {
  const val = document.getElementById('waitTokenInput').value;
  navigator.clipboard.writeText(val).then(() => toast('Token copied', 'success'));
}

// --- Render results ---
function renderResults(session) {
  const s = session;
  const r = s.result || {};
  setHeader(s);
  stopPolling();
  hide('waitingState'); hide('scanningState'); show('resultsState');

  const flagged   = r.flaggedItems         || [];
  const processes = r.processes            || [];
  const modules   = r.suspiciousModules    || [];
  const conns     = r.networkConnections   || [];
  const files     = r.fileFindings         || [];
  const registry  = r.registryFindings     || [];
  const installed = r.installedSoftware    || [];
  const services  = r.services             || [];
  const tasks     = r.scheduledTasks       || [];
  const recent    = r.recentFiles          || [];
  const sysInfo   = r.systemInfo           || {};
  const sysFlags  = r.systemFlags          || {};
  const riskScore = r.riskScore            || 0;
  const riskLevel = r.riskLevel            || 'clean';

  setBadge(flagged.length > 0 ? 'flagged' : 'completed');

  // Risk bar
  const scoreEl = document.getElementById('riskScoreNum');
  scoreEl.textContent = `${riskScore}/100`;
  scoreEl.className   = `risk-bar-score ${riskLevel}`;
  const fill = document.getElementById('riskBarFill');
  fill.style.width = `${riskScore}%`;
  fill.className   = `risk-bar-fill ${riskLevel}`;

  // Summary
  document.getElementById('summaryRow').innerHTML = [
    { label:'Flagged',   val: flagged.length,   cls: flagged.length > 0 ? 'text-red' : 'text-green' },
    { label:'Processes', val: processes.length,  cls: '' },
    { label:'Modules',   val: modules.length,    cls: modules.length > 0 ? 'text-red' : '' },
    { label:'Network',   val: conns.filter(c=>c.suspicious).length,   cls: '' },
    { label:'Services',  val: services.filter(sv=>sv.suspicious).length, cls: '' },
    { label:'Software',  val: installed.length,  cls: '' },
  ].map(i => `<div class="summary-card" style="min-width:100px">
    <div class="summary-num ${i.cls}">${i.val}</div>
    <div class="summary-lbl">${i.label}</div></div>`).join('');

  // Verdict
  const verdictMap = {
    clean:    { icon:'✓', title:'No Cheats Detected', sub:'The system scan appears clean.' },
    low:      { icon:'ℹ', title:'Low Risk', sub:'Minor flags found — review below.' },
    medium:   { icon:'⚠', title:'Medium Risk', sub:'Suspicious items found — further review recommended.' },
    high:     { icon:'⚑', title:'High Risk — Likely Cheating', sub:'Multiple high-severity flags detected.' },
    critical: { icon:'✖', title:'CRITICAL — Cheats Found', sub:`${flagged.filter(f=>f.severity==='critical').length} critical item(s) detected.` },
  };
  const v = verdictMap[riskLevel] || verdictMap.clean;
  document.getElementById('verdictBanner').className = `verdict-banner verdict-${riskLevel}`;
  document.getElementById('verdictIcon').textContent  = v.icon;
  document.getElementById('verdictTitle').textContent = v.title;
  document.getElementById('verdictSub').textContent   = v.sub;

  // Tab badges
  tabBadge('tb-processes', processes.filter(p=>p.suspicious).length, true);
  tabBadge('tb-modules',   modules.length, true);
  tabBadge('tb-network',   conns.filter(c=>c.suspicious).length, true);
  tabBadge('tb-files',     files.filter(f=>f.suspicious).length, true);
  tabBadge('tb-registry',  registry.filter(r=>r.suspicious).length, true);
  tabBadge('tb-software',  installed.filter(s=>s.suspicious).length, true);
  tabBadge('tb-services',  services.filter(sv=>sv.suspicious).length, true);
  tabBadge('tb-tasks',     tasks.filter(t=>t.suspicious).length, true);

  // System info
  const infoKeys = [
    ['username','Username'], ['computerName','Computer'],
    ['os','Operating System'], ['cpuName','CPU'],
    ['totalRam','RAM'], ['gpuName','GPU'],
    ['ipAddress','IP Address'], ['macAddress','MAC'],
    ['hwid','HWID'], ['screenRes','Screen'],
    ['timezone','Timezone'], ['uptime','Uptime'],
    ['scannedAt','Scanned At'], ['scannerVersion','Scanner'],
  ];
  document.getElementById('sysInfoGrid').innerHTML = infoKeys
    .filter(([k]) => sysInfo[k])
    .map(([k, lbl]) => `<div class="info-item"><div class="info-key">${lbl}</div><div class="info-value">${esc(sysInfo[k])}</div></div>`).join('');

  // System flags
  const flagDefs = [
    { key:'isVirtualMachine',     label:'Virtual Machine',    detail: sysFlags.vmIndicator || '', level:'on' },
    { key:'defenderDisabled',     label:'Defender Disabled',  detail:'Real-time protection off', level:'on' },
    { key:'ifeoKeysFound',        label:'IFEO Hooks Found',   detail:'Process launch hooks set', level:'on' },
    { key:'vpnDetected',          label:'VPN Running',        detail: sysFlags.vpnProcess || '', level:'warn' },
    { key:'remoteAccessDetected', label:'Remote Access Tool', detail: sysFlags.remoteAccessProcess || '', level:'warn' },
    { key:'fiveMRunning',         label:'FiveM Running',      detail:'', level:'warn' },
    { key:'gtaRunning',           label:'GTA5 Running',       detail:'', level:'warn' },
    { key:'spoofedHwid',          label:'HWID Spoofed',       detail:'', level:'on' },
  ];
  document.getElementById('flagsGrid').innerHTML = flagDefs.map(fd => {
    const active = !!sysFlags[fd.key];
    const cls    = active ? `flag-${fd.level}` : 'flag-ok';
    return `<div class="flag-item ${cls}"><div class="flag-dot"></div><div>
      <div class="flag-name">${fd.label}</div>
      ${active && fd.detail ? `<div class="flag-detail">${esc(fd.detail)}</div>` : ''}
    </div></div>`;
  }).join('');

  // Flagged items
  document.getElementById('flagCount').textContent = flagged.length;
  document.getElementById('flaggedList').innerHTML = flagged.length === 0
    ? '<p class="text-muted" style="font-size:13px">No flagged items detected.</p>'
    : flagged.sort((a,b) => sevOrder(a.severity) - sevOrder(b.severity)).map(f => `
        <div class="flagged-item sev-${f.severity}-item">
          <span class="sev-pill sev-${f.severity}">${f.severity}</span>
          <div class="flagged-item-body">
            <div class="flagged-name">${esc(f.name)}</div>
            <div class="flagged-category">${esc(f.category)}</div>
            ${f.detail ? `<div class="flagged-detail">${esc(f.detail)}</div>` : ''}
          </div>
          <button class="glossary-btn" title="What is this?" onclick="openGlossary(${JSON.stringify(f.name)},${JSON.stringify(f.category||'')},${JSON.stringify(f.severity||'high')},${JSON.stringify(f.detail||'')})">?</button>
        </div>`).join('');

  // Screenshot
  const ssSection = document.getElementById('screenshotSection');
  if (r.screenshot) {
    ssSection.classList.remove('hidden');
    document.getElementById('screenshotContainer').innerHTML =
      `<img src="data:image/jpeg;base64,${r.screenshot}" alt="Screenshot"
            style="cursor:zoom-in" onclick="openLightbox(this.src)" />`;
  } else { ssSection.classList.add('hidden'); }

  // Processes
  document.getElementById('processBody').innerHTML = processes.map(p => `
    <tr${p.suspicious ? ' class="row-flagged"' : ''}>
      <td><strong>${esc(p.name)}</strong>${p.suspicionReason ? `<br><span class="text-muted" style="font-size:11px">${esc(p.suspicionReason)}</span>` : ''}</td>
      <td class="text-muted">${p.pid}</td>
      <td class="text-muted" style="font-size:11px;font-family:var(--font-mono)">${esc(p.path||'—')}</td>
      <td>${p.suspicious ? '<span class="flag-cell-yes">&#9876; Flagged</span>' : '<span class="flag-cell-no">—</span>'}</td>
    </tr>`).join('');

  // Modules
  document.getElementById('modulesContent').innerHTML = modules.length === 0
    ? '<p class="text-muted">No suspicious modules detected.</p>'
    : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Module</th><th>Process</th><th>PID</th><th>Path</th></tr></thead><tbody>${
        modules.map(m => `<tr class="row-flagged"><td><strong>${esc(m.moduleName)}</strong></td><td>${esc(m.processName)}</td><td class="text-muted">${m.pid}</td><td class="text-muted" style="font-size:11px;font-family:var(--font-mono)">${esc(m.modulePath||'—')}</td></tr>`).join('')
      }</tbody></table></div>`;

  // Network
  document.getElementById('networkBody').innerHTML = conns.map(c => `
    <tr${c.suspicious ? ' class="row-flagged"' : ''}>
      <td>${esc(c.protocol)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(c.localEndpoint)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(c.remoteEndpoint)}</td>
      <td>${esc(c.state)}</td>
      <td class="text-muted">${c.pid}</td>
      <td>${esc(c.processName||'—')}</td>
      <td>${c.suspicious ? '<span class="flag-cell-yes">&#9876;</span>' : '<span class="flag-cell-no">—</span>'}</td>
    </tr>`).join('');

  // Files
  document.getElementById('filesFindings').innerHTML = files.length === 0
    ? '<p class="text-muted">No file findings.</p>'
    : `<div class="finding-list">${files.map(f => `
        <div class="finding-item ${f.suspicious ? 'is-suspicious' : 'is-ok'}">
          ${f.suspicious ? `<span class="sev-pill sev-${f.severity||'high'}">${f.severity||'high'}</span> ` : ''}
          <span>${esc(f.path)}</span>
          ${f.note ? `<span class="finding-note">${esc(f.note)}</span>` : ''}
        </div>`).join('')}</div>`;

  // Recent files
  const susRecent = recent.filter(r=>r.suspicious);
  document.getElementById('recentFiles').innerHTML = susRecent.length === 0
    ? '<p class="text-muted">No suspicious recent files.</p>'
    : `<div class="finding-list">${susRecent.map(r => `
        <div class="finding-item is-suspicious">
          <span class="sev-pill sev-medium">medium</span><span>${esc(r.name)}</span>
        </div>`).join('')}</div>`;

  // Registry
  document.getElementById('registryFindings').innerHTML = registry.length === 0
    ? '<p class="text-muted">No registry findings.</p>'
    : `<div class="finding-list">${registry.map(reg => `
        <div class="finding-item ${reg.suspicious ? 'is-suspicious' : 'is-ok'}">
          ${reg.suspicious ? '<span class="sev-pill sev-high">high</span> ' : ''}
          <div><span style="font-family:var(--font-mono);font-size:12px">${esc(reg.key)}</span>
          ${reg.value ? `<div class="finding-note">${esc(reg.value)}</div>` : ''}</div>
        </div>`).join('')}</div>`;

  // Software
  document.getElementById('softwareBody').innerHTML = installed.map(sw => `
    <tr${sw.suspicious ? ' class="row-flagged"' : ''}>
      <td><strong>${esc(sw.name)}</strong></td>
      <td class="text-muted">${esc(sw.publisher||'—')}</td>
      <td class="text-muted">${esc(sw.version||'—')}</td>
      <td class="text-muted">${esc(sw.installDate||'—')}</td>
      <td>${sw.suspicious ? '<span class="flag-cell-yes">&#9876;</span>' : '<span class="flag-cell-no">—</span>'}</td>
    </tr>`).join('');

  // Services
  document.getElementById('servicesBody').innerHTML = services
    .filter(sv => sv.suspicious || sv.state === 'Running')
    .map(sv => `
      <tr${sv.suspicious ? ' class="row-flagged"' : ''}>
        <td style="font-family:var(--font-mono);font-size:12px">${esc(sv.name)}</td>
        <td>${esc(sv.displayName||'—')}</td>
        <td><span class="badge" style="font-size:10px">${esc(sv.state||'—')}</span></td>
        <td class="text-muted">${esc(sv.startType||'—')}</td>
        <td class="text-muted" style="font-size:11px;font-family:var(--font-mono)">${esc(sv.pathName||'—')}</td>
        <td>${sv.suspicious ? '<span class="flag-cell-yes">&#9876;</span>' : '<span class="flag-cell-no">—</span>'}</td>
      </tr>`).join('');

  // Tasks
  const suspTasks = tasks.filter(t => t.suspicious);
  document.getElementById('tasksBody').innerHTML = (suspTasks.length ? suspTasks : tasks.slice(0,30)).map(t => `
    <tr${t.suspicious ? ' class="row-flagged"' : ''}>
      <td>${esc(t.taskName)}</td>
      <td class="text-muted" style="font-size:11px">${esc(t.taskPath||'—')}</td>
      <td class="text-muted" style="font-size:11px;font-family:var(--font-mono)">${esc(t.action||'—')}</td>
      <td>${esc(t.state||'—')}</td>
      <td>${t.suspicious ? '<span class="flag-cell-yes">&#9876;</span>' : '<span class="flag-cell-no">—</span>'}</td>
    </tr>`).join('');

  // Raw JSON
  document.getElementById('rawJson').textContent = JSON.stringify(r, null, 2);
}

// --- Tab switching ---
function switchTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
}
function tabBadge(id, count, flagStyle) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count > 0 ? count : '';
  el.className = count > 0 ? `tab-badge ${flagStyle ? 'has-flags' : ''}` : 'tab-badge';
}

// --- Helpers ---
function setBadge(status) {
  const b   = document.getElementById('statusBadge');
  const map = { waiting:['badge-waiting','Waiting'], scanning:['badge-scanning','Scanning'],
                completed:['badge-completed','Completed'], flagged:['badge-flagged','Flagged'] };
  const [cls, label] = map[status] || ['badge-waiting', status];
  b.className = `badge ${cls}`; b.textContent = label;
}
function sevOrder(s) { return { critical:0, high:1, medium:2, low:3 }[s] ?? 4; }
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function logout() { localStorage.clear(); window.location.href = '/'; }
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function apiFetch(url, method = 'GET', body = null) {
  const opts = { method, headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(r => { if (r.status === 401) logout(); return r; });
}
function toast(msg, type = 'info', dur = 3500) {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}${type==='warn'?' toast-warn':''}`; el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('hiding'); el.addEventListener('animationend', () => el.remove()); }, dur);
}

// ─── Notes ───────────────────────────────────────────────────────────────────
function onNotesInput() {
  const ta = document.getElementById('notesTextarea');
  const cc = document.getElementById('notesCharCount');
  if (ta && cc) cc.textContent = `${ta.value.length} / 2000`;
}
window.onNotesInput = onNotesInput;

async function saveNotes() {
  const ta = document.getElementById('notesTextarea');
  if (!ta) return;
  const r = await apiFetch(`/api/sessions/${sessionId}/notes`, 'PATCH', { notes: ta.value });
  if (r.ok) {
    const badge = document.getElementById('notesSavedBadge');
    badge.classList.add('show');
    setTimeout(() => badge.classList.remove('show'), 2500);
  } else {
    toast('Failed to save notes', 'error');
  }
}
window.saveNotes = saveNotes;


// ─── Screenshot lightbox ──────────────────────────────────────────────────────
function openLightbox(src) {
  let lb = document.getElementById('lightboxOverlay');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightboxOverlay';
    lb.innerHTML = `
      <div class="lb-backdrop" onclick="closeLightbox()"></div>
      <div class="lb-content">
        <button class="lb-close" onclick="closeLightbox()">&#x2715;</button>
        <img id="lbImg" src="" alt="Screenshot" />
      </div>`;
    document.body.appendChild(lb);
  }
  document.getElementById('lbImg').src = src;
  lb.classList.add('lb-open');
  document.addEventListener('keydown', _lbKeyHandler);
}
function closeLightbox() {
  const lb = document.getElementById('lightboxOverlay');
  if (lb) lb.classList.remove('lb-open');
  document.removeEventListener('keydown', _lbKeyHandler);
}
function _lbKeyHandler(e) { if (e.key === 'Escape') closeLightbox(); }

// ─── Session Share ────────────────────────────────────────────────────────────
async function shareSession() {
  const shareBtn = document.getElementById('shareBtn');
  const isShared = shareBtn && shareBtn.dataset.shared === '1';
  if (isShared) {
    // Already shared — show the link
    const url = `${location.origin}/share/${shareBtn.dataset.token}`;
    await navigator.clipboard.writeText(url);
    toast('Share link copied to clipboard!', 'success');
    return;
  }
  const r = await apiFetch(`/api/sessions/${sessionId}/share`, 'POST');
  if (!r.ok) { const e = await r.json(); toast(e.error || 'Failed to share', 'error'); return; }
  const { shareToken } = await r.json();
  const url = `${location.origin}/share/${shareToken}`;
  await navigator.clipboard.writeText(url);
  if (shareBtn) { shareBtn.dataset.shared = '1'; shareBtn.dataset.token = shareToken; shareBtn.textContent = '🔗 Shared'; }
  toast('Share link created & copied!', 'success', 5000);
}
window.shareSession = shareSession;

// ─── Verdict Override ─────────────────────────────────────────────────────────
function syncOverrideUI(override) {
  const sel = document.getElementById('verdictSelect');
  const reason = document.getElementById('verdictReason');
  const removeBtn = document.getElementById('removeOverrideBtn');
  if (!sel) return;
  if (override) {
    sel.value = override.verdict || '';
    if (reason) reason.value = override.reason || '';
    if (removeBtn) removeBtn.style.display = '';
  } else {
    sel.value = '';
    if (reason) reason.value = '';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}
function renderOverrideBanner(override) {
  const banner = document.getElementById('verdictOverrideBanner');
  const formBanner = document.getElementById('currentOverrideBanner');
  const COLORS = { clean:'#10b981', low:'#5b6ef5', medium:'#f59e0b', high:'#ef4444', critical:'#dc2626' };
  if (override) {
    const color = COLORS[override.verdict] || 'var(--accent)';
    const html = `<div class="verdict-override-notice" style="border-color:${color};color:${color}">
      <strong>⚠ Verdict Overridden:</strong> ${esc(override.verdict.toUpperCase())} by ${esc(override.by)}
      ${override.reason ? ` — <em>${esc(override.reason)}</em>` : ''}
    </div>`;
    if (banner) { banner.style.display = ''; banner.innerHTML = html; }
    if (formBanner) { formBanner.style.display = ''; formBanner.innerHTML = `Currently overridden to <strong>${esc(override.verdict)}</strong> by <strong>${esc(override.by)}</strong>${override.reason ? `: "${esc(override.reason)}"` : ''}`; }
  } else {
    if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
    if (formBanner) { formBanner.style.display = 'none'; formBanner.innerHTML = ''; }
  }
}
async function overrideVerdict() {
  const verdict = document.getElementById('verdictSelect').value;
  if (!verdict) { toast('Select a verdict to override', 'warn'); return; }
  const reason = document.getElementById('verdictReason').value;
  const r = await apiFetch(`/api/sessions/${sessionId}/verdict`, 'PATCH', { verdict, reason });
  if (r.ok) {
    const { verdictOverride } = await r.json();
    renderOverrideBanner(verdictOverride);
    syncOverrideUI(verdictOverride);
    toast('Verdict overridden', 'success');
  } else {
    const e = await r.json();
    toast(e.error || 'Failed to override verdict', 'error');
  }
}
window.overrideVerdict = overrideVerdict;
async function removeOverride() {
  const r = await apiFetch(`/api/sessions/${sessionId}/verdict`, 'DELETE');
  if (r.ok) {
    renderOverrideBanner(null);
    syncOverrideUI(null);
    toast('Verdict override removed', 'success');
  } else {
    const e = await r.json();
    toast(e.error || 'Failed to remove override', 'error');
  }
}
window.removeOverride = removeOverride;

// ─── Session Assignment ───────────────────────────────────────────────────────
let _checkerList = [];
async function loadCheckersForAssign(currentChecker) {
  try {
    const res = await apiFetch('/api/users');
    if (!res.ok) return;
    const { users } = await res.json();
    _checkerList = users.filter(u => !u.suspended);
    const picker = document.getElementById('assignPicker');
    if (!picker) return;
    picker.innerHTML = '<option value="">— select checker —</option>' +
      _checkerList.map(u =>
        `<option value="${u.username}"${u.username === currentChecker ? ' selected' : ''}>${u.username} (${u.role})</option>`
      ).join('');
  } catch {}
}
async function assignSession() {
  const picker = document.getElementById('assignPicker');
  const username = picker?.value;
  if (!username) { toast('Select a checker first', 'warn'); return; }
  const r = await apiFetch(`/api/sessions/${sessionId}/assign`, 'PATCH', { username });
  if (!r.ok) { const e = await r.json(); toast(e.error || 'Failed to reassign', 'error'); return; }
  const { createdBy } = await r.json();
  const assignedByEl = document.getElementById('assignedBy');
  if (assignedByEl) assignedByEl.textContent = `Currently assigned to: ${createdBy}`;
  toast(`Session reassigned to ${createdBy}`, 'success');
}
window.assignSession = assignSession;

// ─── Flagged Item Glossary ────────────────────────────────────────────────────
const GLOSSARY = {
  'aimbot':          'Automated aiming software that snaps or smoothly moves the crosshair onto enemies without player input. A direct competitive integrity violation.',
  'esp':             'Extra Sensory Perception cheat — renders enemy positions, loot, or health through walls. Also known as wallhack or radar.',
  'wallhack':        'Makes walls/objects transparent to see enemies through solid geometry. Similar to ESP.',
  'spoofer':         'Hardware ID (HWID) spoofer — changes serial numbers and hardware identifiers to evade hardware bans from anti-cheat systems.',
  'injector':        'DLL/code injector — loads unauthorized modules into game processes to enable cheats or bypass integrity checks.',
  'bypass':          'Software designed to disable, deceive, or circumvent anti-cheat systems (EAC, BattlEye, VAC, etc).',
  'trainer':         'A game trainer that modifies live memory values (ammo, health, speed) to give unfair advantages.',
  'macro':           'Automation script or macro tool that simulates rapid or perfectly timed inputs (e.g. rapid-fire, bunny-hop, no-recoil).',
  'recoil':          'Recoil script or macro — compensates for weapon recoil automatically, effectively giving a no-recoil advantage.',
  'trigger':         'Triggerbot — automatically shoots when crosshair is over an enemy hitbox without player input.',
  'radar':           'Radar cheat — shows all player positions on a map overlay or external display.',
  'driver':          'Kernel-mode driver — operates at ring-0 privilege level, often used by advanced cheats to evade user-mode anti-cheat.',
  'dumper':          'Memory dumper — extracts game data or decrypts obfuscated values, used for developing cheats or bypasses.',
  'debugger':        'Debugging tool — used to reverse-engineer running processes. Can be used to analyze and tamper with game internals.',
  'process hider':   'Software that conceals processes from task managers and anti-cheat scanners.',
  'virtual machine': 'The player appears to be in a VM — can indicate an attempt to hide hardware identity or run the game in an isolated sandbox.',
  'vm':              'Virtual machine indicator — hardware virtualization detected. May be used to hide real hardware from ban systems.',
  'hex editor':      'Memory editing software — can modify runtime values in a running game to gain unfair advantages.',
  'ifeo':            'Image File Execution Options hook — a Windows registry mechanism that can be used to intercept or redirect program launches.',
  'defender':        'Windows Defender / real-time protection is disabled — may indicate the user is hiding software that would be flagged.',
  'vpn':             'A VPN is active — can be used to mask the player\'s real IP address or region-hop.',
  'remote access':   'Remote access tool detected (e.g. AnyDesk, TeamViewer) — could indicate someone else is controlling the machine.',
  'default':         'This item was flagged as suspicious based on its name, path, or behavior pattern matching known cheat signatures. Review manually.',
};

function _glossaryExplain(name, category) {
  const key = `${name} ${category}`.toLowerCase();
  for (const [kw, text] of Object.entries(GLOSSARY)) {
    if (kw !== 'default' && key.includes(kw)) return text;
  }
  return GLOSSARY['default'];
}

function openGlossary(name, category, severity, detail) {
  document.getElementById('glossaryTitle').textContent = name;
  document.getElementById('glossarySevPill').outerHTML =
    `<span class="sev-pill sev-${severity}" id="glossarySevPill">${severity}</span>`;
  document.getElementById('glossaryCat').textContent = category || '';
  document.getElementById('glossaryExplain').textContent = _glossaryExplain(name, category);
  const detEl = document.getElementById('glossaryDetail');
  if (detail) { detEl.textContent = detail; detEl.style.display = ''; }
  else detEl.style.display = 'none';
  document.getElementById('glossaryModal').classList.remove('hidden');
}
function closeGlossary() {
  document.getElementById('glossaryModal').classList.add('hidden');
}
window.openGlossary = openGlossary;
window.closeGlossary = closeGlossary;

loadSession();
