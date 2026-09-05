// Docklite Client Application Logic
// Direct communication with Docklite REST API and SSE stream

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
    // Fallback polling
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
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>Keine passenden Docker Container gefunden.</p></div>';
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Keine Container gefunden.</td></tr>';
    return;
  }

  // Render Grid Cards
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
      return '<a href="' + href + '" ' + target + ' class="port-badge">' + portText + '</a>';
    }).join('');

    const isRunning = c.state === 'running';

    return `
      <div class="container-card ${c.state}">
        <div class="card-header">
          <div class="container-title">
            <div class="container-name" title="${c.name}">${c.name}</div>
            <div class="container-image" title="${c.image}">${c.image}</div>
          </div>
          <span class="state-pill state-${c.state}">${c.status || c.state}</span>
        </div>

        <div class="metrics-section">
          <div class="metric-row">
            <div class="metric-info">
              <span class="name">CPU Auslastung</span>
              <span class="val">${cpuPercent}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill progress-cpu" style="width: ${Math.min(stats.cpu_percent || 0, 100)}%;"></div>
            </div>
          </div>

          <div class="metric-row">
            <div class="metric-info">
              <span class="name">Memory (${memPercent}%)</span>
              <span class="val">${memUsage} / ${memLimit}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill progress-mem" style="width: ${Math.min(stats.memory_percent || 0, 100)}%;"></div>
            </div>
          </div>

          <div class="io-stats">
            <div class="io-item" title="Netzwerk I/O: Empfangen / Gesendet">
              🌐 ↓ ${netRx} · ↑ ${netTx}
            </div>
            <div class="io-item" title="Block I/O: Gelesen / Geschrieben">
              💾 R: ${blkRead} · W: ${blkWrite}
            </div>
          </div>
        </div>

        <div class="ports-list">
          ${portsHtml || '<span style="font-size:0.7rem; color:var(--text-muted);">Keine Ports gebunden</span>'}
        </div>

        <div class="card-actions">
          <div class="action-group">
            ${isRunning ? 
              `<button class="btn btn-sm btn-danger" onclick="triggerAction('${c.id}', 'stop')">■ Stop</button>
               <button class="btn btn-sm" onclick="triggerAction('${c.id}', 'restart')">🔄 Restart</button>` :
              `<button class="btn btn-sm btn-success" onclick="triggerAction('${c.id}', 'start')">▶ Start</button>`
            }
          </div>
          <div class="action-group">
            <button class="btn btn-sm" onclick="openLogs('${c.id}', '${c.name}')">📜 Logs</button>
            <button class="btn btn-sm" onclick="openInspect('${c.id}', '${c.name}')">🔍 Info</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Render Table
  tableBody.innerHTML = filtered.map(c => {
    const stats = c.stats || {};
    const cpuPercent = (stats.cpu_percent || 0).toFixed(1) + '%';
    const memText = formatBytes(stats.memory_usage || 0);
    const isRunning = c.state === 'running';

    return `
      <tr>
        <td><span class="state-pill state-${c.state}">${c.state}</span></td>
        <td><strong>${c.name}</strong><br><span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${c.short_id}</span></td>
        <td style="font-family:var(--font-mono); font-size:0.75rem;">${c.image}</td>
        <td style="font-family:var(--font-mono);">${cpuPercent}</td>
        <td style="font-family:var(--font-mono);">${memText}</td>
        <td>${(c.ports || []).map(p => p.PublicPort ? (p.PublicPort + ':' + p.PrivatePort) : p.PrivatePort).join(', ') || '-'}</td>
        <td>
          <div style="display:flex; gap:0.35rem;">
            ${isRunning ? 
              `<button class="btn btn-sm btn-danger" onclick="triggerAction('${c.id}', 'stop')">Stop</button>` :
              `<button class="btn btn-sm btn-success" onclick="triggerAction('${c.id}', 'start')">Start</button>`
            }
            <button class="btn btn-sm" onclick="openLogs('${c.id}', '${c.name}')">Logs</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Container Actions
window.triggerAction = async function(id, action) {
  try {
    const res = await fetch('/api/v1/containers/' + id + '/' + action, { method: 'POST' });
    if (res.ok) {
      fetchData();
    } else {
      const err = await res.json();
      alert('Fehler: ' + (err.message || 'Aktion fehlgeschlagen'));
    }
  } catch (e) {
    alert('Netzwerkfehler: ' + e);
  }
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
  alert('Logs in Zwischenablage kopiert!');
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

// Images Modal
document.getElementById('btnImages').onclick = async () => {
  imagesModal.classList.add('active');
  const tb = document.getElementById('imagesTableBody');
  tb.innerHTML = '<tr><td colspan="4">Lade Images...</td></tr>';
  try {
    const res = await fetch('/api/v1/images');
    if (res.ok) {
      const imgs = await res.json();
      tb.innerHTML = imgs.map(img => {
        const tag = (img.RepoTags && img.RepoTags[0]) || '<none>';
        const shortId = (img.Id || '').replace('sha256:', '').substring(0, 12);
        const size = formatBytes(img.Size);
        const date = new Date(img.Created * 1000).toLocaleDateString('de-DE');
        return `
          <tr>
            <td><strong>${tag}</strong></td>
            <td style="font-family:var(--font-mono);">${shortId}</td>
            <td>${size}</td>
            <td>${date}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="4">Fehler beim Laden der Images.</td></tr>';
  }
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

document.getElementById('btnRefresh').onclick = fetchData;

// Initialize
fetchData();
initSSE();
