//go:build !windows

package docker

import (
	"context"
	"net"
	"strings"
)

// defaultHost returns the standard Docker host for Unix/Linux systems.
func defaultHost() string {
	return "unix:///var/run/docker.sock"
}

// dialContext handles Unix domain socket connections or TCP on Linux/macOS.
func dialContext(ctx context.Context, host string) (net.Conn, error) {
	var d net.Dialer
	if strings.HasPrefix(host, "unix://") {
		path := strings.TrimPrefix(host, "unix://")
		return d.DialContext(ctx, "unix", path)
	}
	if strings.HasPrefix(host, "tcp://") {
		addr := strings.TrimPrefix(host, "tcp://")
		return d.DialContext(ctx, "tcp", addr)
	}
	if strings.HasPrefix(host, "/") {
		return d.DialContext(ctx, "unix", host)
	}
	return d.DialContext(ctx, "tcp", host)
}
