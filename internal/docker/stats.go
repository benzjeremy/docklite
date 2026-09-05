package docker

// CalculateStats parses raw Docker container stats into clean, human-readable numbers.
func CalculateStats(raw *RawStats) *CalculatedStats {
	if raw == nil {
		return &CalculatedStats{}
	}

	res := &CalculatedStats{
		PidsCurrent: raw.PidsStats.Current,
	}

	// 1. CPU Calculation
	cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage) - float64(raw.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(raw.CPUStats.SystemCPUUsage) - float64(raw.PreCPUStats.SystemCPUUsage)
	onlineCPUs := float64(raw.CPUStats.OnlineCPUs)
	if onlineCPUs == 0 {
		onlineCPUs = float64(len(raw.CPUStats.CPUUsage.PercpuUsage))
	}
	if onlineCPUs == 0 {
		onlineCPUs = 1.0
	}

	if systemDelta > 0.0 && cpuDelta > 0.0 {
		res.CPUPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0
	}

	// 2. Memory Calculation (accounting for cgroups v1 cache and v2 inactive_file)
	usage := raw.MemoryStats.Usage
	limit := raw.MemoryStats.Limit

	var cache uint64
	if raw.MemoryStats.Stats.TotalInactiveFile > 0 {
		cache = raw.MemoryStats.Stats.TotalInactiveFile
	} else if raw.MemoryStats.Stats.InactiveFile > 0 {
		cache = raw.MemoryStats.Stats.InactiveFile
	} else if raw.MemoryStats.Stats.TotalCache > 0 {
		cache = raw.MemoryStats.Stats.TotalCache
	} else if raw.MemoryStats.Stats.Cache > 0 {
		cache = raw.MemoryStats.Stats.Cache
	}

	if usage > cache {
		res.MemoryUsage = usage - cache
	} else {
		res.MemoryUsage = usage
	}
	res.MemoryLimit = limit

	if limit > 0 && res.MemoryUsage > 0 {
		res.MemoryPercent = (float64(res.MemoryUsage) / float64(limit)) * 100.0
	}

	// 3. Network I/O
	for _, netIf := range raw.Networks {
		res.NetRxBytes += netIf.RxBytes
		res.NetTxBytes += netIf.TxBytes
	}

	// 4. Block I/O
	for _, blk := range raw.BlkioStats.IOServiceBytesRecursive {
		switch blk.Op {
		case "read", "Read":
			res.BlockReadBytes += blk.Value
		case "write", "Write":
			res.BlockWriteBytes += blk.Value
		}
	}

	return res
}
