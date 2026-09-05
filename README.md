# ⚡ Docklite

[![Go Reference](https://pkg.go.dev/badge/github.com/benzjeremy/docklite.svg)](https://pkg.go.dev/github.com/benzjeremy/docklite)
[![Go Report Card](https://goreportcard.com/badge/github.com/benzjeremy/docklite.svg)](https://goreportcard.com/report/github.com/benzjeremy/docklite)
[![CI](https://github.com/benzjeremy/docklite/actions/workflows/ci.yml/badge.svg)](https://github.com/benzjeremy/docklite/actions)
[![Coverage](https://codecov.io/gh/benzjeremy/docklite/branch/main/graph/badge.svg)](https://app.codecov.io/gh/benzjeremy/docklite)
[![Release](https://img.shields.io/badge/Release-Latest-emerald)](https://github.com/benzjeremy/docklite/releases/latest)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows-lightgrey)](#installation)

> **Die radikal schlanke, blitzschnelle Portainer-Alternative in Go & Astro.**  
> Eine einzige native Binary für Linux und Windows, direkte Kommunikation mit dem Docker-Socket (`docker.sock`), ca. 10–15 MB RAM-Verbrauch und null Framework-Overhead.

---

## 🎯 Das Portainer-Problem & Warum Docklite?

Portainer ist für einfache Server- und Homelab-Setups maßlos überdimensioniert:
- ❌ **Ressourcenfresser:** 150 bis 300+ MB RAM für einen simplen Daemon.
- ❌ **Schwerfällig:** Eigene Datenbank, komplexe Benutzerverwaltungen, langsame Weboberfläche.
- ❌ **Viel zu viel Ballast:** Wenn man nur kurz CPU- und RAM-Werte checken, Logs einsehen oder einen Container neu starten will.

**Docklite löst genau dieses Problem:**
- ⚡ **Minimalistischer Footprint:** Nur ca. **10–15 MB RAM** im laufenden Betrieb.
- ⚡ **Single Standalone Binary:** Die komplette Astro-Weboberfläche ist per `go:embed` fest in der Go-Binary einkompiliert. Keine externen Node.js- oder Webserver-Abhängigkeiten!
- ⚡ **Direkter Docker-Socket:** Kommuniziert nativ über HTTP-over-Unix-Socket (`/var/run/docker.sock`) auf Linux oder Named Pipe (`//./pipe/docker_engine`) auf Windows.
- ⚡ **Echtzeit-Monitoring:** Live CPU %, Memory (mit cgroup v1/v2 Cache-Bereinigung), Netzwerk Rx/Tx und Block-I/O via Server-Sent Events (SSE).
- ⚡ **Volle Kontrolle:** Starten, Stoppen, Neustarten, Pausieren, Löschen, Live-Logs und interaktiver Inspector auf Knopfdruck.
- ⚡ **REST API:** Entwicklerfreundliche Endpunkte für eigene Automatisierungs-Skripte und Monitoring-Tools.
- 🛡️ **Security by Design:** Host-Header-Validierung (Anti-DNS-Rebinding), Anti-CSRF, strikte CSP- & Security-Header, optionales Token (`--token`).

---

## 🚀 Schnellstart

### 1. Vorkompilierte Binary herunterladen (Linux / Windows)

Lade die passende Datei direkt von der [Releases-Seite (Latest)](https://github.com/benzjeremy/docklite/releases/latest) herunter:

- **Linux (AMD64):** `docklite-*-linux-amd64.tar.gz` herunterladen, entpacken und `./docklite` ausführen.
- **Windows (AMD64):** `docklite-*-windows-amd64.zip` herunterladen, entpacken und `docklite.exe` starten.

### 2. Installation via Go (Immer die neueste Version)

```bash
go install github.com/benzjeremy/docklite@latest
docklite --port 8080
```

Öffne anschließend [http://localhost:8080](http://localhost:8080) in deinem Browser!

---

## ⚙️ CLI-Optionen

```
Usage of docklite:
  -docker-host string
        Docker socket path or URI (Standard: unix:///var/run/docker.sock bzw. npipe:////./pipe/docker_engine)
  -host string
        Host-Adresse zum Binden (Standard: "127.0.0.1")
  -open
        Öffnet nach dem Start automatisch den Standardbrowser
  -port int
        HTTP-Port für Dashboard und REST API (Standard: 8080)
  -token string
        Optionales Sicherheits-Token für API-Authentifizierung (X-Docklite-Token)
  -version
        Zeigt die Version an und beendet sich
```

Beispiel mit Port 9090 und sicherem Token:
```bash
docklite --port 9090 --token "geheimes-token-123"
```

---

## 📡 REST API Spezifikation

Docklite bietet eine direkte REST API für schnelle Integration in Dashboards und Shell-Skripte:

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/v1/ping` | Health-Check & Docker-Socket Erreichbarkeit |
| `GET` | `/api/v1/version` | Versionen von Docklite und Docker Engine |
| `GET` | `/api/v1/system` | Host-Informationen, CPU-Kerne, Arbeitsspeicher |
| `GET` | `/api/v1/containers` | Container-Liste (`?all=true`, `?stats=true`) |
| `GET` | `/api/v1/containers/{id}` | Ausführlicher Container-Inspect (JSON) |
| `GET` | `/api/v1/containers/{id}/stats` | Live CPU%, Memory MB/Limit, Net & Block I/O |
| `GET` | `/api/v1/containers/{id}/logs` | Demuxte Logs (`?tail=150`, `?timestamps=true`) |
| `POST` | `/api/v1/containers/{id}/start` | Container starten |
| `POST` | `/api/v1/containers/{id}/stop` | Container stoppen (10s Timeout) |
| `POST` | `/api/v1/containers/{id}/restart` | Container neu starten |
| `POST` | `/api/v1/containers/{id}/pause` | Container pausieren |
| `POST` | `/api/v1/containers/{id}/unpause` | Pausierten Container fortsetzen |
| `GET` | `/api/v1/images` | Lokale Docker Images und Speichergrößen |
| `GET` | `/api/v1/live` | Server-Sent Events (SSE) Stream aller Container alle 2s |

---

## 📦 Selbst bauen

### Voraussetzungen
- Go >= 1.22
- Node.js >= 20 & npm

```bash
# 1. Repository klonen
git clone https://github.com/benzjeremy/docklite.git
cd docklite

# 2. Astro Frontend bauen
cd frontend
npm install
npm run build
cd ..

# 3. Go Standalone Binary kompilieren
go build -o docklite main.go
```

---

## 🛡️ Lizenz & Autor

- **Entwickler:** Jeremy Benz ([@benzjeremy](https://github.com/benzjeremy))
- **Lizenz:** [GNU General Public License v3.0 (GPL-3.0)](LICENSE)
- **Kontakt / Bug Reports:** Bitte GitHub Issues auf diesem Repository nutzen!
