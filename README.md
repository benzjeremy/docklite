# ⚡ Docklite

[![Go Reference](https://pkg.go.dev/badge/github.com/benzjeremy/docklite.svg)](https://pkg.go.dev/github.com/benzjeremy/docklite)
[![Go Report Card](https://goreportcard.com/badge/github.com/benzjeremy/docklite.svg)](https://goreportcard.com/report/github.com/benzjeremy/docklite)
[![CI](https://github.com/benzjeremy/docklite/actions/workflows/ci.yml/badge.svg)](https://github.com/benzjeremy/docklite/actions)
[![Coverage](https://codecov.io/gh/benzjeremy/docklite/branch/main/graph/badge.svg)](https://app.codecov.io/gh/benzjeremy/docklite)
[![Awesome Go](https://awesome.re/mentioned-badge.svg)](https://github.com/avelino/awesome-go#devops-tools)
[![Release](https://img.shields.io/badge/Release-Latest%20[Pre--Release]-emerald)](https://github.com/benzjeremy/docklite/releases/latest)
[![Status: Pre-Release](https://img.shields.io/badge/Status-Pre--Release%20%2F%20WIP-orange.svg)](https://github.com/benzjeremy/docklite)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-lightgrey)](#installation)

> [!IMPORTANT]
> ### 🚧 Pre-Release / Active Development Notice
> **This software is not yet finished and is under active development.**  
> All releases and binaries are **Pre-Releases** (Work in Progress), even if originally tagged or announced without a pre-release flag. Features, UI components, and API behaviors are subject to continuous refinement.

> **The radically lightweight, lightning-fast Portainer alternative written in Go & Astro.**  
> A single native binary for Linux and Windows, direct communication with the Docker socket (`docker.sock`), approx. 10–15 MB RAM usage, and zero framework overhead.

---

## 🎯 The Problem with Portainer & Why Docklite?

Portainer is excessively bloated for simple server and homelab setups:
- ❌ **Resource Heavy:** Consumes 150 to 300+ MB RAM for a simple daemon.
- ❌ **Cumbersome:** Dedicated database, complex user management, sluggish web interface.
- ❌ **Unnecessary Overhead:** When all you want is to inspect CPU/RAM stats, view logs, or restart a container.

**Docklite solves exactly this:**
- ⚡ **Minimal Footprint:** Only approx. **10–15 MB RAM** during active operation.
- ⚡ **Single Standalone Binary:** The complete Astro web interface is compiled into the Go binary via `go:embed`. No external Node.js or web server dependencies!
- ⚡ **In-Browser Container Exec:** Interactive terminal via WebSockets directly into any running container (`/bin/sh`, `/bin/bash`) with PTY window resize synchronization.
- ⚡ **Docker Compose Stack Inspector:** Automatic detection and grouping of Compose projects (`com.docker.compose.project`) with 1-click stack restart and stop.
- ⚡ **Volume & Network Management:** Clean up dangling volumes and networks (`POST /api/v1/volumes/prune`, `/networks/prune`).
- ⚡ **Direct Docker Socket:** Communicates natively over HTTP-over-Unix-Socket (`/var/run/docker.sock`) on Linux or Named Pipe (`//./pipe/docker_engine`) on Windows.
- ⚡ **Real-Time Monitoring:** Live CPU %, memory (with cgroup v1/v2 cache cleanup), network Rx/Tx, and block I/O via Server-Sent Events (SSE).
- ⚡ **Full Control:** Start, stop, restart, pause, remove, live logs, and interactive inspection with a single click.
- ⚡ **REST API:** Developer-friendly endpoints for custom automation scripts and monitoring tools.
- 🛡️ **Security by Design:** Host header validation (Anti-DNS-Rebinding), Anti-CSRF, Anti-CSWSH, strict CSP & security headers, optional authentication token (`--token`).

---

## 🚀 Quick Start

### 1. Download Precompiled Binaries (Linux / Windows)

Download the matching binary directly from the [Releases page (Latest)](https://github.com/benzjeremy/docklite/releases/latest):

- **Linux (AMD64):** Download `docklite-*-linux-amd64.tar.gz`, extract, and execute `./docklite`.
- **Windows (AMD64):** Download `docklite-*-windows-amd64.zip`, extract, and run `docklite.exe`.

### 2. Installation via Go (Always Latest)

```bash
go install github.com/benzjeremy/docklite@latest
docklite --port 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your web browser!

---

## ⚙️ CLI Options

```
Usage of docklite:
  -docker-host string
        Docker socket path or URI (default: unix:///var/run/docker.sock or npipe:////./pipe/docker_engine)
  -host string
        Host address to bind to (default: "127.0.0.1")
  -open
        Automatically open the default browser upon launch
  -port int
        HTTP port for dashboard and REST API (default: 8080)
  -token string
        Optional security token for API authentication (X-Docklite-Token)
  -version
        Show version and exit
```

Example with custom port 9090 and a secure token:
```bash
docklite --port 9090 --token "secret-token-123"
```

---

## 📡 REST API Specification

Docklite provides a direct REST API for quick integration into dashboards and shell scripts:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/ping` | Health check & Docker socket reachability |
| `GET` | `/api/v1/version` | Docklite and Docker Engine versions |
| `GET` | `/api/v1/system` | Host information, CPU cores, memory limits |
| `GET` | `/api/v1/containers` | Container list (`?all=true`, `?stats=true`) |
| `GET` | `/api/v1/containers/{id}` | Detailed container inspect (JSON) |
| `GET` | `/api/v1/containers/{id}/stats` | Live CPU%, Memory MB/Limit, Net & Block I/O |
| `GET` | `/api/v1/containers/{id}/logs` | Demuxed logs (`?tail=150`, `?timestamps=true`) |
| `POST` | `/api/v1/containers/{id}/start` | Start container |
| `POST` | `/api/v1/containers/{id}/stop` | Stop container (10s timeout) |
| `POST` | `/api/v1/containers/{id}/restart` | Restart container |
| `POST` | `/api/v1/containers/{id}/pause` | Pause container |
| `POST` | `/api/v1/containers/{id}/unpause` | Resume paused container |
| `GET` | `/api/v1/images` | Local Docker images and disk usage |
| `GET` | `/api/v1/live` | Server-Sent Events (SSE) stream of all containers every 2s |

---

## 📦 Build from Source

### Prerequisites
- Go >= 1.22
- Node.js >= 20 & npm

```bash
# 1. Clone repository
git clone https://github.com/benzjeremy/docklite.git
cd docklite

# 2. Build Astro Frontend
cd frontend
npm install
npm run build
cd ..

# 3. Compile Go Standalone Binary
go build -o docklite main.go
```

---

## 🛡️ License & Author

- **Developer:** Jeremy Benz ([@benzjeremy](https://github.com/benzjeremy))
- **License:** [GNU General Public License v3.0 (GPL-3.0)](LICENSE)
- **Support & Issues:** Please use the GitHub Issues page on this repository.
