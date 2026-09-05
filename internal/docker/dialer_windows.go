//go:build windows

package docker

import (
	"context"
	"net"
	"strings"

	"github.com/Microsoft/go-winio"
)

// defaultHost returns the standard Docker named pipe for Windows.
func defaultHost() string {
	return "npipe:////./pipe/docker_engine"
}

// dialContext handles Windows named pipe connections or TCP.
func dialContext(ctx context.Context, host string) (net.Conn, error) {
	if strings.HasPrefix(host, "npipe://") {
		path := strings.TrimPrefix(host, "npipe://")
		return winio.DialPipeContext(ctx, path)
	}
	if strings.HasPrefix(host, "//./pipe/") {
		return winio.DialPipeContext(ctx, host)
	}
	if strings.HasPrefix(host, "tcp://") {
		addr := strings.TrimPrefix(host, "tcp://")
		var d net.Dialer
		return d.DialContext(ctx, "tcp", addr)
	}
	var d net.Dialer
	return d.DialContext(ctx, "tcp", host)
}
