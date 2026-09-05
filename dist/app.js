// Docklite v1.1 Client Logic
// Modern UI Interaction, In-App Toasts, Deletion & Prune Support

let containers = [];
let systemInfo = null;
let activeFilter = 'all';
let searchQuery = '';
let currentView = 'grid';
let currentLogContainerId = null;
let logPollTimer = null;
let sseSource = null;

// Elements
const grid = document.getElementById('containersGrid');
const tableBody = document.getElementById('containersTableBody');
const tableWrapper = document.getElementById('containersTableWrapper');
const searchInput = document.getElementById('searchInput');
const filterTabs = document.querySelectorAll('.filter-tab');
const btnViewGrid = document.getElementById('btnViewGrid');
const btnViewTable = document.getElementById('btnViewTable');

// Modals
const logsModal = document.getElementById('logsModal');
const inspectModal = document.getElementById('inspectModal');
const imagesModal = document.getElementById('imagesModal');
const apiDocsModal = document.getElementById('apiDocsModal');
const confirmModal = document.getElementById('confirmModal');
const toastContainer = document.getElementById('toastContainer');

// Modern Toast Notification System
function showToast(message, type = 'info') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✕';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = '<span style="font-weight:700; font-size:1rem;">' + icon + '</span><span>' + message + '</span>';
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// In-App Confirmation Modal (Replaces browser confirm)
function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmModal.classList.add('active');

  const btnConfirm = document.getElementById('btnExecuteConfirmAction');
  const btnCancel = document.getElementById('btnCancelConfirmAction');
  const btnClose = document.getElementById('btnCancelConfirm');

  const cleanup = () => {
    confirmModal.classList.remove('active');
    btnConfirm.onclick = null;
    btnCancel.onclick = null;
    btnClose.onclick = null;
  };

  btnCancel.onclick = cleanup;
  btnClose.onclick = cleanup;
  btnConfirm.onclick = () => {
    cleanup();
    onConfirm();
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// Connect to Server-Sent Events (SSE) for Real-Time Updates
function initSSE() {
  if (sseSource) {
    sseSource.close();
  }

  const liveText = document.getElementById('liveText');
  sseSource = new EventSource('/api/v1/live');

  sseSource.onopen = () => {
    liveText.textContent = 'Live (SSE)';
    document.getElementById('liveIndicator').style.borderColor = 'rgba(16, 185, 129, 0.3)';
  };

  sseSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.system) updateSystemStats(payload.system);
      if (payload.containers) {
        containers = payload.containers;
        renderContainers();
      }
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  sseSource.onerror = () => {
    liveText.textContent = 'Polling (Fallback)';
    document.getElementById('liveIndicator').style.borderColor = 'rgba(245, 158, 11, 0.4)';
    sseSource.close();
    sseSource = null;
    setTimeout(fetchData, 3000);
  };
}

async function fetchData() {
  try {
    const [sysRes, contRes] = await Promise.all([
      fetch('/api/v1/system'),
      fetch('/api/v1/containers?all=true&stats=true')
    ]);
    if (sysRes.ok) {
      systemInfo = await sysRes.json();
      updateSystemStats(systemInfo);
    }
    if (contRes.ok) {
      containers = await contRes.json();
      renderContainers();
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

function updateSystemStats(info) {
  systemInfo = info;
  document.getElementById('statContainersTotal').textContent = info.Containers || 0;
  document.getElementById('statContainersBreakdown').textContent = 
    (info.ContainersRunning || 0) + ' running · ' + (info.ContainersStopped || 0) + ' stopped';
  document.getElementById('statDockerVersion').textContent = info.ServerVersion || 'v-';
  document.getElementById('statDockerOS').textContent = (info.OperatingSystem || 'Linux') + ' (' + (info.Architecture || 'amd64') + ')';
  
  const memGb = info.MemTotal ? (info.MemTotal / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : '-';
  document.getElementById('statCpuMem').textContent = (info.NCPU || 0) + ' Cores · ' + memGb;
  document.getElementById('statHostInfo').textContent = info.Name || 'Docker Host';
  document.getElementById('statImagesTotal').textContent = info.Images || 0;
}

function renderContainers() {
  let runningCount = 0;
  let stoppedCount = 0;
  let pausedCount = 0;

  containers.forEach(c => {
    if (c.state === 'running') runningCount++;
    else if (c.state === 'paused') pausedCount++;
    else stoppedCount++;
  });

  document.getElementById('countAll').textContent = containers.length;
  document.getElementById('countRunning').textContent = runningCount;
  document.getElementById('countStopped').textContent = stoppedCount;
  document.getElementById('countPaused').textContent = pausedCount;

  const filtered = containers.filter(c => {
    if (activeFilter === 'running' && c.state !== 'running') return false;
    if (activeFilter === 'stopped' && (c.state === 'running' || c.state === 'paused')) return false;
    if (activeFilter === 'paused' && c.state !== 'paused') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = c.name && c.name.toLowerCase().includes(q);
      const matchImg = c.image && c.image.toLowerCase().includes(q);
      const matchID = c.short_id && c.short_id.toLowerCase().includes(q);
      return matchName || matchImg || matchID;
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p style="font-size:1.1rem; color:#64748b;">Keine passenden Docker Container gefunden.</p></div>';
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">Keine Container gefunden.</td></tr>';
    return;
  }

  // Render High-End Grid Cards
  grid.innerHTML = filtered.map(c => {
    const stats = c.stats || {};
    const cpuPercent = (stats.cpu_percent || 0).toFixed(1);
    const memPercent = (stats.memory_percent || 0).toFixed(1);
    const memUsage = formatBytes(stats.memory_usage || 0);
    const memLimit = stats.memory_limit ? formatBytes(stats.memory_limit) : '-';
    const netRx = formatBytes(stats.net_rx_bytes || 0);
    const netTx = formatBytes(stats.net_tx_bytes || 0);
    const blkRead = formatBytes(stats.block_read_bytes || 0);
    const blkWrite = formatBytes(stats.block_write_bytes || 0);

    const portsHtml = (c.ports || []).map(p => {
      const portText = p.PublicPort ? (p.PublicPort + ':' + p.PrivatePort + '/' + p.Type) : (p.PrivatePort + '/' + p.Type);
      const href = p.PublicPort ? ('http://localhost:' + p.PublicPort) : '#';
      const target = p.PublicPort ? 'target="_blank"' : '';
      return '<a href="' + href + '" ' + target + ' class="port-badge">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line></svg>' +
        portText + '</a>';
    }).join('');

    const isRunning = c.state === 'running';

    return `
      <div class="container-card ${c.state}">
        <div class="card-header">
          <div class="container-title">
            <div class="container-name-row">
              <span class="pulse-dot" style="background:${isRunning ? 'var(--success)' : 'var(--danger)'}; box-shadow:0 0 8px ${isRunning ? 'var(--success)' : 'var(--danger)'};"></span>
              <div class="container-name" title="${c.name}">${c.name}</div>
              <span class="id-pill" title="Container ID">${c.short_id}</span>
            </div>
            <div class="container-image" title="${c.image}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect></svg>
              ${c.image}
            </div>
          </div>
          <span class="state-pill state-${c.state}">${c.status || c.state}</span>
        </div>

        <div class="metrics-section">
          <div class="metric-card">
            <div class="metric-head">
              <span class="name">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect></svg>
                CPU Auslastung
              </span>
              <span class="val">${cpuPercent}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill progress-cpu" style="width: ${Math.min(stats.cpu_percent || 0, 100)}%;"></div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-head">
              <span class="name">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 19v-3"></path><path d="M10 19v-3"></path><path d="M14 19v-3"></path><path d="M18 19v-3"></path><rect x="2" y="5" width="20" height="10" rx="2"></rect></svg>
                Memory (${memPercent}%)
              </span>
              <span class="val">${memUsage} / ${memLimit}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill progress-mem" style="width: ${Math.min(stats.memory_percent || 0, 100)}%;"></div>
            </div>
          </div>

          <div class="io-stats">
            <div class="io-item" title="Netzwerk-Traffic (Empfangen / Gesendet)">
              🌐 ↓ <strong>${netRx}</strong> · ↑ <strong>${netTx}</strong>
            </div>
            <div class="io-item" title="Festplatten Block I/O (Read / Write)">
              💾 R: <strong>${blkRead}</strong> · W: <strong>${blkWrite}</strong>
            </div>
          </div>
        </div>

        <div class="ports-list">
          ${portsHtml || '<span style="font-size:0.75rem; color:var(--text-muted);">Keine Port-Bindings</span>'}
        </div>

        <div class="card-actions">
          <div class="action-group">
            ${isRunning ? 
              `<button class="btn btn-sm btn-danger" onclick="triggerAction('${c.id}', 'stop', '${c.name}')" title="Container stoppen">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
                Stop
              </button>
              <button class="btn btn-sm" onclick="triggerAction('${c.id}', 'restart', '${c.name}')" title="Neu starten">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Restart
              </button>` :
              `<button class="btn btn-sm btn-success" onclick="triggerAction('${c.id}', 'start', '${c.name}')" title="Container starten">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Start
              </button>`
            }
          </div>
          <div class="action-group">
            <button class="btn btn-sm" onclick="openLogs('${c.id}', '${c.name}')" title="Live-Logs anzeigen">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              Logs
            </button>
            <button class="btn btn-sm" onclick="openInspect('${c.id}', '${c.name}')" title="Container Details (JSON)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              Info
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteContainer('${c.id}', '${c.name}')" title="Container löschen">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Render Table View
  tableBody.innerHTML = filtered.map(c => {
    const stats = c.stats || {};
    const cpuPercent = (stats.cpu_percent || 0).toFixed(1) + '%';
    const memText = formatBytes(stats.memory_usage || 0);
    const isRunning = c.state === 'running';

    return `
      <tr>
        <td><span class="state-pill state-${c.state}">${c.state}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span class="pulse-dot" style="background:${isRunning ? 'var(--success)' : 'var(--danger)'}; width:6px; height:6px;"></span>
            <strong style="font-size:0.95rem; color:#fff;">${c.name}</strong>
          </div>
          <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${c.short_id}</span>
        </td>
        <td><span style="font-family:var(--font-mono); font-size:0.75rem; background:#111a2c; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid #20304f; color:#93c5fd;">${c.image}</span></td>
        <td><span style="font-family:var(--font-mono); font-weight:700; color:${stats.cpu_percent > 80 ? 'var(--danger)' : stats.cpu_percent > 40 ? 'var(--warning)' : '#38bdf8'};">${cpuPercent}</span></td>
        <td><span style="font-family:var(--font-mono); font-weight:700; color:#34d399;">${memText}</span></td>
        <td>${(c.ports || []).map(p => {
          const pt = p.PublicPort ? (p.PublicPort + ':' + p.PrivatePort) : p.PrivatePort;
          return `<span class="port-badge" style="font-size:0.72rem; padding:0.15rem 0.4rem;">${pt}</span>`;
        }).join(' ') || '<span style="color:var(--text-muted); font-size:0.75rem;">-</span>'}</td>
        <td>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            ${isRunning ? 
              `<button class="btn btn-sm btn-danger" onclick="triggerAction('${c.id}', 'stop', '${c.name}')" title="Container stoppen">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
                Stop
              </button>` :
              `<button class="btn btn-sm btn-success" onclick="triggerAction('${c.id}', 'start', '${c.name}')" title="Container starten">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Start
              </button>`
            }
            <button class="btn btn-sm" onclick="openLogs('${c.id}', '${c.name}')" title="Logs anzeigen">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line></svg>
              Logs
            </button>
            <button class="btn btn-sm" onclick="openInspect('${c.id}', '${c.name}')" title="JSON Details">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteContainer('${c.id}', '${c.name}')" title="Löschen">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Container Lifecycle Actions
window.triggerAction = async function(id, action, name) {
  try {
    const res = await fetch('/api/v1/containers/' + id + '/' + action, { method: 'POST' });
    if (res.ok) {
      showToast('Container "' + (name || id) + '" wurde ' + action + 't.', 'success');
      fetchData();
    } else {
      const err = await res.json();
      showToast('Fehler: ' + (err.message || 'Aktion fehlgeschlagen'), 'error');
    }
  } catch (e) {
    showToast('Netzwerkfehler: ' + e, 'error');
  }
};

// Delete Container with In-App Confirmation
window.deleteContainer = function(id, name) {
  showConfirm(
    '🗑️ Container löschen',
    'Möchtest du den Container "' + (name || id) + '" wirklich dauerhaft aus Docker löschen?',
    async () => {
      try {
        const res = await fetch('/api/v1/containers/' + id + '?force=true', { method: 'DELETE' });
        if (res.ok) {
          showToast('✓ Container "' + (name || id) + '" gelöscht!', 'success');
          fetchData();
        } else {
          const err = await res.json();
          showToast('Fehler beim Löschen: ' + (err.message || 'Fehlgeschlagen'), 'error');
        }
      } catch (e) {
        showToast('Netzwerkfehler: ' + e, 'error');
      }
    }
  );
};

// System Prune with Confirmation
document.getElementById('btnPruneSystem').onclick = function() {
  showConfirm(
    '🧹 Docker System aufräumen (Prune)',
    'Möchtest du alle gestoppten Container, ungenutzten Netzwerke und Dangling Images jetzt löschen?',
    async () => {
      try {
        showToast('Bereinige Docker-System...', 'info');
        const res = await fetch('/api/v1/system/prune', { method: 'POST' });
        if (res.ok) {
          showToast('✓ Docker erfolgreich aufgeräumt!', 'success');
          fetchData();
        } else {
          showToast('System Prune fehlgeschlagen.', 'error');
        }
      } catch (e) {
        showToast('Fehler bei Prune: ' + e, 'error');
      }
    }
  );
};

// --- LOGS SYSTEM (Colorized, Searchable, Downloadable) ---
let currentRawLogs = '';
let currentLogFilter = '';
let currentLogLevelFilter = 'all'; // 'all', 'error', 'warn'
let currentLogContainerName = '';

window.openLogs = async function(id, name) {
  currentLogContainerId = id;
  currentLogContainerName = name || id;
  document.getElementById('logsContainerName').textContent = currentLogContainerName;
  logsModal.classList.add('active');
  fetchLogs();
  if (logPollTimer) clearInterval(logPollTimer);
  logPollTimer = setInterval(fetchLogs, 2500);
};

async function fetchLogs() {
  if (!currentLogContainerId) return;
  const tail = document.getElementById('logsTailSelect').value;
  try {
    const res = await fetch('/api/v1/containers/' + currentLogContainerId + '/logs?tail=' + tail + '&timestamps=true');
    if (res.ok) {
      const data = await res.json();
      currentRawLogs = data.logs || '';
      renderStructuredLogs();
    }
  } catch (e) {
    document.getElementById('logsViewer').innerHTML = '<div style="padding:1rem; color:var(--danger);">Fehler beim Laden der Logs: ' + e + '</div>';
  }
}

function renderStructuredLogs() {
  const viewer = document.getElementById('logsViewer');
  if (!viewer) return;

  if (!currentRawLogs || currentRawLogs.trim() === '') {
    viewer.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">Keine Log-Einträge für diesen Container vorhanden.</div>';
    document.getElementById('logsLineCount').textContent = '0 Zeilen';
    return;
  }

  const lines = currentRawLogs.split('\n');
  let errorCount = 0;
  let warnCount = 0;

  const parsed = [];
  lines.forEach(rawLine => {
    if (!rawLine.trim()) return;

    // Detect timestamp (RFC3339 / ISO standard e.g. 2026-09-05T18:34:45.123456Z)
    let ts = '';
    let msg = rawLine;
    const tsMatch = rawLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s*(.*)$/);
    if (tsMatch) {
      ts = tsMatch[1].substring(11, 19); // HH:MM:SS
      msg = tsMatch[2];
    }

    // Detect level
    const lower = msg.toLowerCase();
    let level = 'info';
    if (lower.includes('err') || lower.includes('fatal') || lower.includes('panic') || lower.includes('crit')) {
      level = 'error';
      errorCount++;
    } else if (lower.includes('warn')) {
      level = 'warn';
      warnCount++;
    } else if (lower.includes('debug') || lower.includes('trace')) {
      level = 'debug';
    }

    parsed.push({ ts, msg, level, raw: rawLine });
  });

  document.getElementById('logsLineCount').textContent = `${parsed.length} Zeilen (${errorCount} Fehler, ${warnCount} Warnungen)`;

  // Filter lines
  const filtered = parsed.filter(item => {
    if (currentLogLevelFilter === 'error' && item.level !== 'error') return false;
    if (currentLogLevelFilter === 'warn' && item.level !== 'warn' && item.level !== 'error') return false;
    if (currentLogFilter) {
      return item.raw.toLowerCase().includes(currentLogFilter.toLowerCase());
    }
    return true;
  });

  if (filtered.length === 0) {
    viewer.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">Keine Logs entsprechen dem Filter.</div>';
    return;
  }

  viewer.innerHTML = filtered.map(item => {
    const badgeClass = 'log-badge-' + item.level;
    const msgClass = item.level === 'error' ? 'log-msg-error' : item.level === 'warn' ? 'log-msg-warn' : '';
    // Escape HTML in msg
    const escMsg = item.msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <div class="log-line">
        ${item.ts ? `<span class="log-ts">${item.ts}</span>` : ''}
        <span class="log-badge ${badgeClass}">${item.level}</span>
        <span class="log-msg ${msgClass}">${escMsg}</span>
      </div>
    `;
  }).join('');

  if (document.getElementById('logsAutoScroll').checked) {
    viewer.scrollTop = viewer.scrollHeight;
  }
}

// Log Search & Filters
const logsSearchInput = document.getElementById('logsSearchInput');
if (logsSearchInput) {
  logsSearchInput.oninput = (e) => {
    currentLogFilter = e.target.value.trim();
    renderStructuredLogs();
  };
}

document.getElementById('btnFilterAllLogs').onclick = () => {
  currentLogLevelFilter = 'all';
  renderStructuredLogs();
};
document.getElementById('btnFilterErrorLogs').onclick = () => {
  currentLogLevelFilter = 'error';
  renderStructuredLogs();
};
document.getElementById('btnFilterWarnLogs').onclick = () => {
  currentLogLevelFilter = 'warn';
  renderStructuredLogs();
};

document.getElementById('btnCloseLogs').onclick = () => {
  logsModal.classList.remove('active');
  currentLogContainerId = null;
  if (logPollTimer) clearInterval(logPollTimer);
};

document.getElementById('btnCopyLogs').onclick = () => {
  navigator.clipboard.writeText(currentRawLogs);
  showToast('✓ Logs in Zwischenablage kopiert!', 'success');
};

document.getElementById('btnDownloadLogs').onclick = () => {
  const blob = new Blob([currentRawLogs], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentLogContainerName || 'container') + '-logs.log';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Log-Datei wird heruntergeladen!', 'success');
};

document.getElementById('logsTailSelect').onchange = fetchLogs;

// --- INTERACTIVE STRUCTURED INSPECT SYSTEM ---
let currentInspectData = null;
let currentInspectId = null;
let currentInspectTab = 'overview';

window.openInspect = async function(id, name) {
  currentInspectId = id;
  document.getElementById('inspectContainerName').textContent = name || id;
  inspectModal.classList.add('active');
  currentInspectTab = 'overview';
  
  // Set tab active
  document.querySelectorAll('.inspect-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === 'overview');
  });

  const content = document.getElementById('inspectTabContent');
  content.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:3rem;">Lade Container Details via Docker-Socket...</div>';

  try {
    const res = await fetch('/api/v1/containers/' + id);
    if (res.ok) {
      currentInspectData = await res.json();
      
      const state = (currentInspectData.State && currentInspectData.State.Status) || 'unknown';
      const badge = document.getElementById('inspectStateBadge');
      badge.textContent = state;
      badge.className = 'state-pill state-' + state;

      renderInspectTab();
    } else {
      content.innerHTML = '<div style="color:var(--danger); padding:2rem;">Fehler: Container konnte nicht inspiziert werden.</div>';
    }
  } catch (e) {
    content.innerHTML = '<div style="color:var(--danger); padding:2rem;">Netzwerkfehler: ' + e + '</div>';
  }
};

function renderInspectTab() {
  const content = document.getElementById('inspectTabContent');
  if (!currentInspectData) return;

  const d = currentInspectData;
  const state = d.State || {};
  const config = d.Config || {};
  const hostConfig = d.HostConfig || {};
  const net = d.NetworkSettings || {};

  if (currentInspectTab === 'overview') {
    const createdDate = d.Created ? new Date(d.Created).toLocaleString('de-DE') : '-';
    const startedDate = state.StartedAt ? new Date(state.StartedAt).toLocaleString('de-DE') : '-';
    const finishedDate = state.FinishedAt && state.FinishedAt !== '0001-01-01T00:00:00Z' ? new Date(state.FinishedAt).toLocaleString('de-DE') : '-';
    const cmdStr = (config.Cmd || []).join(' ') || '-';
    const entryStr = (config.Entrypoint || []).join(' ') || '-';

    content.innerHTML = `
      <div class="inspect-card-grid">
        <div class="inspect-card">
          <div class="inspect-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            Status & Laufzeit
          </div>
          <table class="kv-table">
            <tr><td class="key">Status:</td><td class="val"><span class="state-pill state-${state.Status}">${state.Status}</span></td></tr>
            <tr><td class="key">PID:</td><td class="val">${state.Pid || 0}</td></tr>
            <tr><td class="key">Exit Code:</td><td class="val">${state.ExitCode !== undefined ? state.ExitCode : '-'}</td></tr>
            <tr><td class="key">OOM Killed:</td><td class="val" style="color:${state.OOMKilled ? 'var(--danger)' : '#10b981'};">${state.OOMKilled ? 'Ja (Speichermangel)' : 'Nein'}</td></tr>
            <tr><td class="key">Erstellt:</td><td class="val">${createdDate}</td></tr>
            <tr><td class="key">Gestartet:</td><td class="val">${startedDate}</td></tr>
            <tr><td class="key">Beendet:</td><td class="val">${finishedDate}</td></tr>
            <tr><td class="key">Restart Count:</td><td class="val">${d.RestartCount || 0}</td></tr>
          </table>
        </div>

        <div class="inspect-card">
          <div class="inspect-card-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect></svg>
            Container & Image Info
          </div>
          <table class="kv-table">
            <tr><td class="key">Name:</td><td class="val">${d.Name || '-'}</td></tr>
            <tr><td class="key">ID:</td><td class="val">${(d.Id || '').substring(0, 16)}...</td></tr>
            <tr><td class="key">Image:</td><td class="val" style="color:#93c5fd;">${config.Image || '-'}</td></tr>
            <tr><td class="key">Image ID:</td><td class="val">${(d.Image || '').replace('sha256:', '').substring(0, 16)}</td></tr>
            <tr><td class="key">Plattform:</td><td class="val">${d.Platform || 'linux/amd64'}</td></tr>
            <tr><td class="key">Arbeitsverz.:</td><td class="val">${config.WorkingDir || '/'}</td></tr>
            <tr><td class="key">Entrypoint:</td><td class="val">${entryStr}</td></tr>
            <tr><td class="key">Kommando:</td><td class="val">${cmdStr}</td></tr>
          </table>
        </div>
      </div>
    `;
  } else if (currentInspectTab === 'network') {
    const ports = net.Ports || {};
    const portsList = Object.keys(ports).map(cPort => {
      const bindings = ports[cPort];
      if (!bindings || bindings.length === 0) {
        return `<tr><td class="key">${cPort}:</td><td class="val" style="color:var(--text-muted);">Nur Container-intern</td></tr>`;
      }
      return bindings.map(b => {
        const hostPort = b.HostPort;
        const hostIp = b.HostIp === '0.0.0.0' ? 'localhost' : b.HostIp;
        return `<tr><td class="key">${cPort} ➔</td><td class="val"><a href="http://${hostIp}:${hostPort}" target="_blank" class="port-badge">http://${hostIp}:${hostPort} ↗</a></td></tr>`;
      }).join('');
    }).join('');

    const networks = net.Networks || {};
    const netDetails = Object.keys(networks).map(netName => {
      const n = networks[netName];
      return `
        <tr><td class="key">Netzwerk-Name:</td><td class="val"><strong style="color:var(--info);">${netName}</strong></td></tr>
        <tr><td class="key">IP-Adresse:</td><td class="val">${n.IPAddress || '-'}</td></tr>
        <tr><td class="key">Gateway:</td><td class="val">${n.Gateway || '-'}</td></tr>
        <tr><td class="key">MAC-Adresse:</td><td class="val">${n.MacAddress || '-'}</td></tr>
      `;
    }).join('');

    content.innerHTML = `
      <div class="inspect-card-grid">
        <div class="inspect-card">
          <div class="inspect-card-title">🌐 IP & Netzwerke</div>
          <table class="kv-table">
            <tr><td class="key">IP-Adresse (Primary):</td><td class="val">${net.IPAddress || '-'}</td></tr>
            <tr><td class="key">Gateway (Primary):</td><td class="val">${net.Gateway || '-'}</td></tr>
            <tr><td class="key">MAC-Adresse:</td><td class="val">${net.MacAddress || '-'}</td></tr>
            ${netDetails}
          </table>
        </div>

        <div class="inspect-card">
          <div class="inspect-card-title">🔌 Port Weiterleitungen & Bindings</div>
          <table class="kv-table">
            ${portsList || '<tr><td colspan="2" style="color:var(--text-muted); padding:1rem;">Keine Port-Bindings konfiguriert.</td></tr>'}
          </table>
        </div>
      </div>
    `;
  } else if (currentInspectTab === 'mounts') {
    const mounts = d.Mounts || [];
    if (mounts.length === 0) {
      content.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:3rem;">Keine gemounteten Volumes oder Bind-Mounts für diesen Container.</div>';
      return;
    }

    content.innerHTML = `
      <div class="table-responsive active">
        <table>
          <thead>
            <tr>
              <th>Typ</th>
              <th>Host Quelle (Source)</th>
              <th>Container Ziel (Destination)</th>
              <th>Modus</th>
              <th>RW</th>
            </tr>
          </thead>
          <tbody>
            ${mounts.map(m => `
              <tr>
                <td><span class="id-pill">${m.Type || 'volume'}</span></td>
                <td style="font-family:var(--font-mono); font-size:0.75rem; color:#93c5fd;">${m.Source || m.Name || '-'}</td>
                <td style="font-family:var(--font-mono); font-size:0.75rem; color:#f1f5f9;">${m.Destination || '-'}</td>
                <td>${m.Mode || 'rw'}</td>
                <td><span class="state-pill ${m.RW ? 'state-running' : 'state-stopped'}">${m.RW ? 'Read/Write' : 'Read-Only'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (currentInspectTab === 'env') {
    const envs = config.Env || [];
    if (envs.length === 0) {
      content.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:3rem;">Keine Umgebungsvariablen definiert.</div>';
      return;
    }

    content.innerHTML = `
      <div style="margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:0.82rem; color:var(--text-muted);">${envs.length} Umgebungsvariablen gefunden</div>
        <div class="search-box" style="min-width:240px; padding:0.25rem 0.6rem;">
          <input type="text" id="envFilterInput" placeholder="Env filtern..." style="font-size:0.78rem;" />
        </div>
      </div>
      <div id="envListContainer" style="display:flex; flex-direction:column; gap:0.5rem; max-height:450px; overflow-y:auto;">
        ${envs.map(e => {
          const idx = e.indexOf('=');
          const k = idx > -1 ? e.substring(0, idx) : e;
          const v = idx > -1 ? e.substring(idx + 1) : '';
          return `
            <div class="env-row" style="background:#090e18; border:1px solid #1a273e; border-radius:8px; padding:0.6rem 0.9rem; display:flex; align-items:center; justify-content:space-between; gap:1rem;">
              <div style="display:flex; align-items:baseline; gap:0.6rem; overflow:hidden;">
                <strong style="color:var(--info); font-family:var(--font-mono); font-size:0.8rem;">${k}</strong>
                <span style="color:#94a3b8; font-family:var(--font-mono); font-size:0.78rem; word-break:break-all;">${v}</span>
              </div>
              <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${v.replace(/'/g, "\\'")}'); showToast('✓ Wert kopiert!', 'info');" title="Wert kopieren" style="flex-shrink:0;">📋</button>
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.getElementById('envFilterInput').oninput = (ev) => {
      const q = ev.target.value.toLowerCase();
      document.querySelectorAll('.env-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    };
  } else if (currentInspectTab === 'processes') {
    content.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:3rem;">Lade aktive Prozesse aus dem Container (Top)...</div>';
    fetch('/api/v1/containers/' + currentInspectId + '/top')
      .then(r => r.json())
      .then(topData => {
        if (!topData.Titles || !topData.Processes || topData.Processes.length === 0) {
          content.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:3rem;">Keine aktiven Prozesse gefunden (Container gestoppt?).</div>';
          return;
        }

        content.innerHTML = `
          <div class="table-responsive active">
            <table>
              <thead>
                <tr>
                  ${topData.Titles.map(t => `<th>${t}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${topData.Processes.map(proc => `
                  <tr>
                    ${proc.map(cell => `<td style="font-family:var(--font-mono); font-size:0.78rem;">${cell}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      })
      .catch(err => {
        content.innerHTML = '<div style="color:var(--danger); padding:2rem;">Prozesse konnten nicht geladen werden: ' + err + '</div>';
      });
  } else if (currentInspectTab === 'update') {
    const policy = (hostConfig.RestartPolicy && hostConfig.RestartPolicy.Name) || 'no';

    content.innerHTML = `
      <div class="inspect-card" style="max-width:560px; margin:0 auto;">
        <div class="inspect-card-title">🛡️ Restart Policy & Container Update</div>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">
          Passe das Verhalten von Docker beim Absturz oder Neustart des Hosts direkt an.
        </p>
        <div style="display:flex; flex-direction:column; gap:1rem; margin-top:0.5rem;">
          <div>
            <label style="font-size:0.75rem; color:#94a3b8; display:block; margin-bottom:0.4rem;">Restart-Richtlinie:</label>
            <select id="updateRestartPolicy" class="btn" style="width:100%; background:#080c14; border:1px solid #1e293b; color:#fff; padding:0.55rem 0.8rem; border-radius:8px;">
              <option value="no" ${policy === 'no' ? 'selected' : ''}>no (Nicht automatisch neu starten)</option>
              <option value="always" ${policy === 'always' ? 'selected' : ''}>always (Immer automatisch neu starten)</option>
              <option value="unless-stopped" ${policy === 'unless-stopped' ? 'selected' : ''}>unless-stopped (Neu starten, außer manuell gestoppt)</option>
              <option value="on-failure" ${policy === 'on-failure' ? 'selected' : ''}>on-failure (Nur bei Fehler-Exitcode neu starten)</option>
            </select>
          </div>

          <button class="btn btn-primary" id="btnExecuteUpdateContainer" style="justify-content:center; padding:0.65rem;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Änderungen speichern & anwenden
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnExecuteUpdateContainer').onclick = async () => {
      const selected = document.getElementById('updateRestartPolicy').value;
      try {
        showToast('Aktualisiere Container...', 'info');
        const res = await fetch('/api/v1/containers/' + currentInspectId + '/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ RestartPolicy: { Name: selected } })
        });
        if (res.ok) {
          showToast('✓ Restart-Policy erfolgreich auf "' + selected + '" gesetzt!', 'success');
          // Reload inspect
          window.openInspect(currentInspectId, document.getElementById('inspectContainerName').textContent);
        } else {
          showToast('Fehler beim Aktualisieren des Containers.', 'error');
        }
      } catch (e) {
        showToast('Fehler: ' + e, 'error');
      }
    };
  } else if (currentInspectTab === 'raw') {
    content.innerHTML = `
      <pre class="terminal-output" style="height:460px;">${JSON.stringify(d, null, 2)}</pre>
    `;
  }
}

// Inspect Tab Clicking
document.querySelectorAll('.inspect-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.inspect-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentInspectTab = tab.getAttribute('data-tab');
    renderInspectTab();
  };
});

document.getElementById('btnCopyInspectJson').onclick = () => {
  if (currentInspectData) {
    navigator.clipboard.writeText(JSON.stringify(currentInspectData, null, 2));
    showToast('✓ Vollständiges JSON in Zwischenablage kopiert!', 'success');
  }
};

document.getElementById('btnCloseInspect').onclick = () => {
  inspectModal.classList.remove('active');
  currentInspectId = null;
  currentInspectData = null;
};

// --- IMAGE PULL SYSTEM ---
const pullImageModal = document.getElementById('pullImageModal');
const btnOpenPullModal = document.getElementById('btnOpenPullModal');
const btnClosePullImage = document.getElementById('btnClosePullImage');
const btnQuickPullFromImagesModal = document.getElementById('btnQuickPullFromImagesModal');

function openPullModal(presetImg = '', presetTag = 'latest') {
  if (presetImg) {
    document.getElementById('pullImageInput').value = presetImg;
    document.getElementById('pullTagInput').value = presetTag;
  }
  document.getElementById('pullProgressBox').style.display = 'none';
  document.getElementById('pullProgressBox').textContent = '';
  pullImageModal.classList.add('active');
}

if (btnOpenPullModal) btnOpenPullModal.onclick = () => openPullModal();
if (btnQuickPullFromImagesModal) {
  btnQuickPullFromImagesModal.onclick = () => {
    imagesModal.classList.remove('active');
    openPullModal();
  };
}
if (btnClosePullImage) btnClosePullImage.onclick = () => pullImageModal.classList.remove('active');

document.querySelectorAll('.quick-pull-preset').forEach(el => {
  el.onclick = (e) => {
    e.preventDefault();
    document.getElementById('pullImageInput').value = el.getAttribute('data-img');
    document.getElementById('pullTagInput').value = el.getAttribute('data-tag');
  };
});

document.getElementById('btnExecutePull').onclick = async () => {
  const image = document.getElementById('pullImageInput').value.trim();
  const tag = document.getElementById('pullTagInput').value.trim() || 'latest';
  if (!image) {
    showToast('Bitte einen Image-Namen eingeben!', 'warning');
    return;
  }

  const box = document.getElementById('pullProgressBox');
  box.style.display = 'block';
  box.textContent = `⏳ Ziehe Image "${image}:${tag}" über Docker-Socket...\nDies kann je nach Image-Größe einen Moment dauern.`;

  try {
    const res = await fetch('/api/v1/images/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, tag })
    });

    if (res.ok) {
      const data = await res.json();
      box.textContent = `✓ Image "${image}:${tag}" erfolgreich heruntergeladen!\n\n` + (data.output || '');
      showToast(`✓ Image "${image}:${tag}" geladen!`, 'success');
      fetchData();
    } else {
      const err = await res.json();
      box.textContent = `✕ Fehler beim Pull: ${err.message || 'Unbekannter Fehler'}`;
      showToast('Image Pull fehlgeschlagen.', 'error');
    }
  } catch (e) {
    box.textContent = `✕ Netzwerkfehler: ${e}`;
    showToast('Fehler bei Pull: ' + e, 'error');
  }
};

// --- VOLUMES & NETWORKS SYSTEM ---
const volumesModal = document.getElementById('volumesModal');
const btnVolumes = document.getElementById('btnVolumes');
const btnCloseVolumes = document.getElementById('btnCloseVolumes');
const btnTabVol = document.getElementById('btnTabVol');
const btnTabNet = document.getElementById('btnTabNet');
const volContainer = document.getElementById('volContainer');
const netContainer = document.getElementById('netContainer');

if (btnVolumes) {
  btnVolumes.onclick = () => {
    volumesModal.classList.add('active');
    loadVolumesAndNetworks();
  };
}

if (btnCloseVolumes) btnCloseVolumes.onclick = () => volumesModal.classList.remove('active');

btnTabVol.onclick = () => {
  btnTabVol.classList.add('active');
  btnTabNet.classList.remove('active');
  volContainer.style.display = 'block';
  netContainer.style.display = 'none';
};

btnTabNet.onclick = () => {
  btnTabNet.classList.add('active');
  btnTabVol.classList.remove('active');
  volContainer.style.display = 'none';
  netContainer.style.display = 'block';
};

async function loadVolumesAndNetworks() {
  const volTb = document.getElementById('volumesTableBody');
  const netTb = document.getElementById('networksTableBody');
  volTb.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1.5rem;">Lade Volumes...</td></tr>';
  netTb.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem;">Lade Netzwerke...</td></tr>';

  try {
    const [volRes, netRes] = await Promise.all([
      fetch('/api/v1/volumes'),
      fetch('/api/v1/networks')
    ]);

    if (volRes.ok) {
      const volData = await volRes.json();
      const vols = volData.Volumes || [];
      document.getElementById('volCount').textContent = vols.length;
      if (vols.length === 0) {
        volTb.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Keine Volumes vorhanden.</td></tr>';
      } else {
        volTb.innerHTML = vols.map(v => `
          <tr>
            <td><strong style="color:#fff;">${v.Name}</strong></td>
            <td><span class="id-pill">${v.Driver || 'local'}</span></td>
            <td>${v.Scope || 'local'}</td>
            <td style="font-family:var(--font-mono); font-size:0.75rem; color:#93c5fd;">${v.Mountpoint || '-'}</td>
          </tr>
        `).join('');
      }
    }

    if (netRes.ok) {
      const nets = await netRes.json();
      document.getElementById('netCount').textContent = nets.length;
      if (nets.length === 0) {
        netTb.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Keine Netzwerke vorhanden.</td></tr>';
      } else {
        netTb.innerHTML = nets.map(n => {
          const shortId = (n.Id || '').substring(0, 12);
          const ipam = n.IPAM && n.IPAM.Config && n.IPAM.Config[0];
          const subnet = ipam ? (ipam.Subnet + (ipam.Gateway ? ' (GW: ' + ipam.Gateway + ')' : '')) : '-';
          return `
            <tr>
              <td><strong style="color:#fff;">${n.Name}</strong></td>
              <td style="font-family:var(--font-mono); color:#93c5fd;">${shortId}</td>
              <td><span class="id-pill">${n.Driver || 'bridge'}</span></td>
              <td>${n.Scope || 'local'}</td>
              <td style="font-family:var(--font-mono); font-size:0.75rem;">${subnet}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    volTb.innerHTML = '<tr><td colspan="4">Fehler beim Laden.</td></tr>';
    netTb.innerHTML = '<tr><td colspan="5">Fehler beim Laden.</td></tr>';
  }
}

// --- IMAGES MODAL ---
document.getElementById('btnImages').onclick = async () => {
  imagesModal.classList.add('active');
  loadImages();
};

async function loadImages() {
  const tb = document.getElementById('imagesTableBody');
  tb.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem;">Lade Images...</td></tr>';
  try {
    const res = await fetch('/api/v1/images');
    if (res.ok) {
      const imgs = await res.json();
      if (imgs.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Keine Images gefunden.</td></tr>';
        return;
      }
      tb.innerHTML = imgs.map(img => {
        const tag = (img.RepoTags && img.RepoTags[0]) || '<none>';
        const shortId = (img.Id || '').replace('sha256:', '').substring(0, 12);
        const size = formatBytes(img.Size);
        const date = new Date(img.Created * 1000).toLocaleDateString('de-DE');
        return `
          <tr>
            <td><strong style="color:#fff;">${tag}</strong></td>
            <td style="font-family:var(--font-mono); color:#93c5fd;">${shortId}</td>
            <td style="font-family:var(--font-mono);">${size}</td>
            <td>${date}</td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="deleteImage('${shortId}', '${tag}')" title="Image löschen">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Löschen
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="5">Fehler beim Laden der Images.</td></tr>';
  }
}

window.deleteImage = function(id, tag) {
  showConfirm(
    '🗑️ Docker Image löschen',
    'Möchtest du das Image "' + tag + '" (' + id + ') wirklich aus Docker entfernen?',
    async () => {
      try {
        const res = await fetch('/api/v1/images/' + id + '?force=true', { method: 'DELETE' });
        if (res.ok) {
          showToast('✓ Image "' + tag + '" gelöscht!', 'success');
          loadImages();
          fetchData();
        } else {
          const err = await res.json();
          showToast('Fehler beim Löschen: ' + (err.message || 'Wird möglicherweise noch von einem Container genutzt'), 'error');
        }
      } catch (e) {
        showToast('Netzwerkfehler: ' + e, 'error');
      }
    }
  );
};

document.getElementById('btnCloseImages').onclick = () => {
  imagesModal.classList.remove('active');
};

// API Docs Modal
document.getElementById('btnApiDocs').onclick = () => apiDocsModal.classList.add('active');
document.getElementById('btnCloseApiDocs').onclick = () => apiDocsModal.classList.remove('active');

// Filter tabs
filterTabs.forEach(tab => {
  tab.onclick = () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.getAttribute('data-filter');
    renderContainers();
  };
});

// Search input
searchInput.oninput = (e) => {
  searchQuery = e.target.value.trim();
  renderContainers();
};

// View toggle
btnViewGrid.onclick = () => {
  currentView = 'grid';
  btnViewGrid.classList.add('active');
  btnViewTable.classList.remove('active');
  grid.style.display = 'grid';
  tableWrapper.classList.remove('active');
};

btnViewTable.onclick = () => {
  currentView = 'table';
  btnViewTable.classList.add('active');
  btnViewGrid.classList.remove('active');
  grid.style.display = 'none';
  tableWrapper.classList.add('active');
};

document.getElementById('btnRefresh').onclick = () => {
  fetchData();
  showToast('✓ Daten aktualisiert', 'info');
};

// Start
fetchData();
initSSE();

