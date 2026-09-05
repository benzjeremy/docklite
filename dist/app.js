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
        <td><strong>${c.name}</strong><br><span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${c.short_id}</span></td>
        <td style="font-family:var(--font-mono); font-size:0.75rem; color:#93c5fd;">${c.image}</td>
        <td style="font-family:var(--font-mono); font-weight:600;">${cpuPercent}</td>
        <td style="font-family:var(--font-mono); font-weight:600;">${memText}</td>
        <td>${(c.ports || []).map(p => p.PublicPort ? (p.PublicPort + ':' + p.PrivatePort) : p.PrivatePort).join(', ') || '-'}</td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            ${isRunning ? 
              `<button class="btn btn-sm btn-danger" onclick="triggerAction('${c.id}', 'stop', '${c.name}')">Stop</button>` :
              `<button class="btn btn-sm btn-success" onclick="triggerAction('${c.id}', 'start', '${c.name}')">Start</button>`
            }
            <button class="btn btn-sm" onclick="openLogs('${c.id}', '${c.name}')">Logs</button>
            <button class="btn btn-sm btn-danger" onclick="deleteContainer('${c.id}', '${c.name}')">Löschen</button>
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

// Logs Modal
window.openLogs = async function(id, name) {
  currentLogContainerId = id;
  document.getElementById('logsContainerName').textContent = name;
  logsModal.classList.add('active');
  fetchLogs();
  if (logPollTimer) clearInterval(logPollTimer);
  logPollTimer = setInterval(fetchLogs, 2500);
};

async function fetchLogs() {
  if (!currentLogContainerId) return;
  const tail = document.getElementById('logsTailSelect').value;
  const pre = document.getElementById('logsOutput');
  try {
    const res = await fetch('/api/v1/containers/' + currentLogContainerId + '/logs?tail=' + tail + '&timestamps=true');
    if (res.ok) {
      const data = await res.json();
      pre.textContent = data.logs || '(Keine Logs vorhanden)';
      pre.scrollTop = pre.scrollHeight;
    }
  } catch (e) {
    pre.textContent = 'Fehler beim Laden der Logs: ' + e;
  }
}

document.getElementById('btnCloseLogs').onclick = () => {
  logsModal.classList.remove('active');
  currentLogContainerId = null;
  if (logPollTimer) clearInterval(logPollTimer);
};

document.getElementById('btnCopyLogs').onclick = () => {
  const text = document.getElementById('logsOutput').textContent;
  navigator.clipboard.writeText(text);
  showToast('✓ Logs in Zwischenablage kopiert!', 'success');
};

document.getElementById('logsTailSelect').onchange = fetchLogs;

// Inspect Modal
window.openInspect = async function(id, name) {
  document.getElementById('inspectContainerName').textContent = name;
  inspectModal.classList.add('active');
  const pre = document.getElementById('inspectOutput');
  pre.textContent = 'Lade Container Details...';
  try {
    const res = await fetch('/api/v1/containers/' + id);
    if (res.ok) {
      const data = await res.json();
      pre.textContent = JSON.stringify(data, null, 2);
    } else {
      pre.textContent = 'Container konnte nicht inspiziert werden.';
    }
  } catch (e) {
    pre.textContent = 'Fehler: ' + e;
  }
};

document.getElementById('btnCloseInspect').onclick = () => {
  inspectModal.classList.remove('active');
};

// Images Modal with Delete Support
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
