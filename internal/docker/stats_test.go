package docker

import (
	"encoding/json"
	"testing"
)

func TestCalculateStats_Nil(t *testing.T) {
	stats := CalculateStats(nil)
	if stats == nil {
		t.Fatal("expected non-nil stats for nil input")
	}
	if stats.CPUPercent != 0.0 || stats.MemoryUsage != 0 {
		t.Errorf("expected 0 for nil stats, got %+v", stats)
	}
}

func TestCalculateStats_Basic(t *testing.T) {
	rawJSON := `{
		"pids_stats": {"current": 5},
		"cpu_stats": {
			"cpu_usage": {"total_usage": 200000000},
			"system_cpu_usage": 2000000000,
			"online_cpus": 2
		},
		"precpu_stats": {
			"cpu_usage": {"total_usage": 100000000},
			"system_cpu_usage": 1000000000,
			"online_cpus": 2
		},
		"memory_stats": {
			"usage": 52428800,
			"limit": 104857600,
			"stats": {
				"total_inactive_file": 10485760
			}
		},
		"networks": {
			"eth0": {
				"rx_bytes": 1024,
				"tx_bytes": 2048
			}
		},
		"blkio_stats": {
			"io_service_bytes_recursive": [
				{"op": "Read", "value": 500},
				{"op": "Write", "value": 1500}
			]
		}
	}`

	var raw RawStats
	if err := json.Unmarshal([]byte(rawJSON), &raw); err != nil {
		t.Fatalf("failed to unmarshal test json: %v", err)
	}

	calc := CalculateStats(&raw)
	if calc.PidsCurrent != 5 {
		t.Errorf("expected 5 pids, got %d", calc.PidsCurrent)
	}

	// (100M / 1000M) * 2 * 100 = 20%
	if calc.CPUPercent < 19.9 || calc.CPUPercent > 20.1 {
		t.Errorf("expected ~20%% CPU, got %f", calc.CPUPercent)
	}

	// 50MB - 10MB = 40MB (41943040 bytes)
	expectedMem := uint64(52428800 - 10485760)
	if calc.MemoryUsage != expectedMem {
		t.Errorf("expected %d memory usage, got %d", expectedMem, calc.MemoryUsage)
	}

	// 40MB / 100MB = 40%
	if calc.MemoryPercent < 39.9 || calc.MemoryPercent > 40.1 {
		t.Errorf("expected ~40%% Mem, got %f", calc.MemoryPercent)
	}

	if calc.NetRxBytes != 1024 || calc.NetTxBytes != 2048 {
		t.Errorf("unexpected net bytes: rx=%d, tx=%d", calc.NetRxBytes, calc.NetTxBytes)
	}

	if calc.BlockReadBytes != 500 || calc.BlockWriteBytes != 1500 {
		t.Errorf("unexpected block bytes: read=%d, write=%d", calc.BlockReadBytes, calc.BlockWriteBytes)
	}
}
