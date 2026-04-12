/* notify.js — shared notification bell for dashboard + session pages */
(function () {
  const MAX_NOTIFS = 50;
  let notifs = [];
  let unread  = 0;

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Bell HTML is injected by initNotifBell ────────────────────────────────
  function initNotifBell(socket) {
    // Inject bell into topbar
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    const wrap = document.createElement('div');
    wrap.className = 'notif-bell-wrap';
    wrap.id = 'notifBellWrap';
    wrap.innerHTML = `
      <button class="notif-bell-btn" id="notifBtn" title="Notifications" onclick="window.__toggleNotif()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="notif-badge hidden" id="notifBadge">0</span>
      </button>
      <div class="notif-dropdown hidden" id="notifDropdown">
        <div class="notif-header">
          <span>Notifications</span>
          <button class="notif-clear-btn" onclick="window.__clearNotifs()">Clear all</button>
        </div>
        <div class="notif-list" id="notifList">
          <div class="notif-empty">No notifications yet</div>
        </div>
      </div>`;

    // Insert before themeToggle
    const themeToggle = topbarRight.querySelector('#themeToggle');
    if (themeToggle) {
      topbarRight.insertBefore(wrap, themeToggle);
    } else {
      topbarRight.prepend(wrap);
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        document.getElementById('notifDropdown')?.classList.add('hidden');
      }
    });

    // ── Socket listeners ───────────────────────────────────────────────────
    if (!socket) return;

    socket.on('session_updated', ({ session }) => {
      if (session.status === 'completed') {
        const level = session.result?.riskLevel || 'clean';
        const flagCount = (session.result?.flaggedItems || []).length;
        if (level === 'high' || level === 'critical' || flagCount > 0) {
          const typeMap = { critical: 'danger', high: 'warn', medium: 'warn' };
          addNotif(
            `Scan complete: ${session.targetName}`,
            flagCount > 0 ? `${flagCount} flagged item${flagCount > 1 ? 's' : ''} · ${level.toUpperCase()}` : `${level.toUpperCase()} risk`,
            typeMap[level] || 'info',
            `/session.html?id=${session.id}`
          );
        }
      }
    });

    socket.on('alert_rule_triggered', ({ rule, session }) => {
      addNotif(
        `Alert rule triggered: ${_esc(rule.name || rule.id)}`,
        `${_esc(session.targetName)} — score ${session.riskScore} (${session.riskLevel})`,
        'danger',
        `/session.html?id=${session.id}`
      );
    });

    socket.on('session_expiring', ({ targetName, minutesLeft, sessionId }) => {
      addNotif(
        `Session expiring: ${_esc(targetName)}`,
        `Expires in ${minutesLeft} min`,
        'warn',
        sessionId ? `/session.html?id=${sessionId}` : null
      );
    });

    socket.on('admin_broadcast', ({ message, from }) => {
      addNotif(`Broadcast from ${_esc(from)}`, _esc(message), 'info', null);
      _showBroadcastModal(_esc(message), _esc(from));
    });
  }

  function _showBroadcastModal(safeMessage, safeFrom) {
    const existing = document.getElementById('broadcastBanner');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'broadcastBanner';
    el.className = 'broadcast-overlay';
    el.innerHTML = `
      <div class="broadcast-modal">
        <div class="broadcast-modal-header">
          <span class="broadcast-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          </span>
          <span class="broadcast-modal-title">Admin Broadcast</span>
          <span class="broadcast-from">from <strong>${safeFrom}</strong></span>
        </div>
        <div class="broadcast-modal-body">${safeMessage}</div>
        <div class="broadcast-modal-footer">
          <button class="btn btn-primary" onclick="document.getElementById('broadcastBanner').remove()">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    setTimeout(() => { const b = document.getElementById('broadcastBanner'); if (b) b.remove(); }, 30000);
  }

  function addNotif(title, body, type, link) {
    const n = { id: Date.now() + Math.random(), title, body, type: type || 'info', link, at: new Date(), read: false };
    notifs.unshift(n);
    if (notifs.length > MAX_NOTIFS) notifs = notifs.slice(0, MAX_NOTIFS);
    unread++;
    _renderBadge();
    _renderList();
  }

  function _renderBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function _renderList() {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!notifs.length) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = notifs.map(n => `
      <div class="notif-item notif-${n.type}${n.read ? ' notif-read' : ''}${n.link ? ' notif-clickable' : ''}"
           ${n.link ? `onclick="window.location.href='${n.link}'"` : ''}>
        <div class="notif-dot notif-dot-${n.type}"></div>
        <div class="notif-body">
          <div class="notif-title">${_esc(n.title)}</div>
          ${n.body ? `<div class="notif-sub">${_esc(n.body)}</div>` : ''}
          <div class="notif-time">${_timeAgo(n.at)}</div>
        </div>
      </div>`).join('');
  }

  function _timeAgo(date) {
    const secs = Math.floor((Date.now() - new Date(date)) / 1000);
    if (secs < 5)  return 'just now';
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
    return `${Math.floor(secs/3600)}h ago`;
  }

  // ── Globals exposed to onclick handlers ───────────────────────────────────
  window.__toggleNotif = function () {
    const dd = document.getElementById('notifDropdown');
    if (!dd) return;
    const opening = dd.classList.contains('hidden');
    dd.classList.toggle('hidden');
    if (opening) {
      // Mark all read
      notifs.forEach(n => n.read = true);
      unread = 0;
      _renderBadge();
      _renderList();
    }
  };

  window.__clearNotifs = function () {
    notifs = [];
    unread = 0;
    _renderBadge();
    _renderList();
  };

  window.addNotif = addNotif;
  window.initNotifBell = initNotifBell;
})();
