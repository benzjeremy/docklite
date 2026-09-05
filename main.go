package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/benzjeremy/docklite/internal/api"
	"github.com/benzjeremy/docklite/internal/docker"
)

const (
	Version = "v1.0"
	Banner  = `
  ⚡ DOCKLITE %s
  Ultra-lightweight Docker Resource Monitor & Dashboard
  Zero-bloat Portainer alternative in Go & Astro
  Author: Jeremy Benz (@benzjeremy)
`
)

//go:embed dist/*
var distFS embed.FS

func main() {
	hostFlag := flag.String("host", "127.0.0.1", "Host address to bind to (e.g. 127.0.0.1 or 0.0.0.0)")
	portFlag := flag.Int("port", 8080, "Port for the HTTP web dashboard and REST API")
	dockerSockFlag := flag.String("docker-host", "", "Docker socket path or URI (e.g. unix:///var/run/docker.sock or npipe:////./pipe/docker_engine)")
	tokenFlag := flag.String("token", "", "Optional secret token for API authentication (X-Docklite-Token)")
	openBrowserFlag := flag.Bool("open", false, "Automatically open web browser on startup")
	versionFlag := flag.Bool("version", false, "Show version and exit")
	flag.Parse()

	if *versionFlag {
		fmt.Printf("docklite %s (%s/%s)\n", Version, runtime.GOOS, runtime.GOARCH)
		return
	}

	fmt.Printf(Banner, Version)

	// 1. Connect directly to Docker daemon socket
	dockerClient, err := docker.NewClient(*dockerSockFlag)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize Docker socket client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := dockerClient.Ping(ctx); err != nil {
		log.Printf("[WARN] Docker socket ping failed: %v", err)
		log.Printf("[WARN] Make sure Docker is running and current user has permissions on %s", dockerClient.Host())
	} else {
		log.Printf("✓ Connected to Docker daemon via %s", dockerClient.Host())
		if v, vErr := dockerClient.GetVersion(context.Background()); vErr == nil {
			log.Printf("✓ Docker Engine Version: %s (API %s, OS: %s/%s)", v.Version, v.ApiVersion, v.Os, v.Arch)
		}
	}

	// 2. Prepare embedded frontend filesystem
	staticSub, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatalf("[FATAL] Failed to load embedded frontend files: %v", err)
	}

	// 3. Configure security and allowed hosts per Jeremy's Coding Standards
	allowedHosts := []string{"localhost", "127.0.0.1", "[::1]"}
	if *hostFlag != "" && *hostFlag != "127.0.0.1" && *hostFlag != "0.0.0.0" {
		allowedHosts = append(allowedHosts, *hostFlag)
	}

	secConfig := api.SecurityConfig{
		Token:        *tokenFlag,
		AllowedHosts: allowedHosts,
	}

	// 4. Initialize API and Web Server
	srv := api.NewServer(dockerClient, secConfig, Version, staticSub)

	addr := fmt.Sprintf("%s:%d", *hostFlag, *portFlag)
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      srv.Handler(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown listener
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		dashboardURL := fmt.Sprintf("http://localhost:%d", *portFlag)
		if *hostFlag != "127.0.0.1" && *hostFlag != "0.0.0.0" {
			dashboardURL = fmt.Sprintf("http://%s:%d", *hostFlag, *portFlag)
		}

		log.Printf("🌐 Dashboard active at: %s", dashboardURL)
		log.Printf("📡 REST API available at: %s/api/v1/containers", dashboardURL)
		if *tokenFlag != "" {
			log.Printf("🔐 Token authentication enabled (Header: X-Docklite-Token)")
		}

		if *openBrowserFlag {
			time.Sleep(300 * time.Millisecond)
			openBrowser(dashboardURL)
		}

		ln, err := net.Listen("tcp", addr)
		if err != nil {
			log.Fatalf("[FATAL] Could not listen on %s: %v", addr, err)
		}
		if err := httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] HTTP server error: %v", err)
		}
	}()

	<-stopChan
	log.Println("\n🛑 Shutting down Docklite cleanly...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("[WARN] Server shutdown forced: %v", err)
	}
	log.Println("👋 Goodbye!")
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
