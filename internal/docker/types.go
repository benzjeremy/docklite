package docker

import "time"

// SystemInfo represents Docker daemon host info.
type SystemInfo struct {
	ID                string    `json:"ID"`
	Containers        int       `json:"Containers"`
	ContainersRunning int       `json:"ContainersRunning"`
	ContainersPaused  int       `json:"ContainersPaused"`
	ContainersStopped int       `json:"ContainersStopped"`
	Images            int       `json:"Images"`
	Driver            string    `json:"Driver"`
	SystemTime        time.Time `json:"SystemTime"`
	LoggingDriver     string    `json:"LoggingDriver"`
	CgroupDriver      string    `json:"CgroupDriver"`
	KernelVersion     string    `json:"KernelVersion"`
	OperatingSystem   string    `json:"OperatingSystem"`
	OSVersion         string    `json:"OSVersion"`
	OSType            string    `json:"OSType"`
	Architecture      string    `json:"Architecture"`
	NCPU              int       `json:"NCPU"`
	MemTotal          int64     `json:"MemTotal"`
	ServerVersion     string    `json:"ServerVersion"`
	Name              string    `json:"Name"`
}

// DockerVersion represents engine version info.
type DockerVersion struct {
	Version       string `json:"Version"`
	ApiVersion    string `json:"ApiVersion"`
	MinAPIVersion string `json:"MinAPIVersion"`
	GitCommit     string `json:"GitCommit"`
	GoVersion     string `json:"GoVersion"`
	Os            string `json:"Os"`
	Arch          string `json:"Arch"`
	KernelVersion string `json:"KernelVersion"`
}

// PortMapping represents container port bindings.
type PortMapping struct {
	IP          string `json:"IP,omitempty"`
	PrivatePort uint16 `json:"PrivatePort"`
	PublicPort  uint16 `json:"PublicPort,omitempty"`
	Type        string `json:"Type"`
}

// ContainerSummary represents container list entries from Docker.
type ContainerSummary struct {
	ID         string            `json:"Id"`
	Names      []string          `json:"Names"`
	Image      string            `json:"Image"`
	ImageID    string            `json:"ImageID"`
	Command    string            `json:"Command"`
	Created    int64             `json:"Created"`
	State      string            `json:"State"`
	Status     string            `json:"Status"`
	Ports      []PortMapping     `json:"Ports"`
	Labels     map[string]string `json:"Labels"`
	SizeRw     int64             `json:"SizeRw,omitempty"`
	SizeRootFs int64             `json:"SizeRootFs,omitempty"`
}

// CleanContainer is an API-friendly presentation of a container.
type CleanContainer struct {
	ID        string            `json:"id"`
	ShortID   string            `json:"short_id"`
	Name      string            `json:"name"`
	Image     string            `json:"image"`
	Command   string            `json:"command"`
	Created   int64             `json:"created"`
	State     string            `json:"state"` // running, exited, paused, etc.
	Status    string            `json:"status"`
	Ports     []PortMapping     `json:"ports"`
	Labels    map[string]string `json:"labels"`
	Stats     *CalculatedStats  `json:"stats,omitempty"`
}

// RawStats represents the raw JSON from /containers/{id}/stats?stream=false
type RawStats struct {
	Read      time.Time `json:"read"`
	PreRead   time.Time `json:"preread"`
	NumProcs  int       `json:"num_procs"`
	PidsStats struct {
		Current uint64 `json:"current"`
		Limit   uint64 `json:"limit"`
	} `json:"pids_stats"`
	CPUStats struct {
		CPUUsage struct {
			TotalUsage        uint64   `json:"total_usage"`
			PercpuUsage       []uint64 `json:"percpu_usage"`
			UsageInKernelmode uint64   `json:"usage_in_kernelmode"`
			UsageInUsermode   uint64   `json:"usage_in_usermode"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage        uint64   `json:"total_usage"`
			PercpuUsage       []uint64 `json:"percpu_usage"`
			UsageInKernelmode uint64   `json:"usage_in_kernelmode"`
			UsageInUsermode   uint64   `json:"usage_in_usermode"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint32 `json:"online_cpus"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
		Stats struct {
			Cache             uint64 `json:"cache"`
			TotalCache        uint64 `json:"total_cache"`
			InactiveFile      uint64 `json:"inactive_file"`
			TotalInactiveFile uint64 `json:"total_inactive_file"`
		} `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IOServiceBytesRecursive []struct {
			Major uint64 `json:"major"`
			Minor uint64 `json:"minor"`
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
}

// CalculatedStats provides intuitive metrics for CPU, memory and I/O.
type CalculatedStats struct {
	CPUPercent      float64 `json:"cpu_percent"`
	MemoryUsage     uint64  `json:"memory_usage"`
	MemoryLimit     uint64  `json:"memory_limit"`
	MemoryPercent   float64 `json:"memory_percent"`
	NetRxBytes      uint64  `json:"net_rx_bytes"`
	NetTxBytes      uint64  `json:"net_tx_bytes"`
	BlockReadBytes  uint64  `json:"block_read_bytes"`
	BlockWriteBytes uint64  `json:"block_write_bytes"`
	PidsCurrent     uint64  `json:"pids_current"`
}

// ImageSummary represents Docker image details.
type ImageSummary struct {
	ID          string            `json:"Id"`
	ParentID    string            `json:"ParentId"`
	RepoTags    []string          `json:"RepoTags"`
	RepoDigests []string          `json:"RepoDigests"`
	Created     int64             `json:"Created"`
	Size        int64             `json:"Size"`
	SharedSize  int64             `json:"SharedSize"`
	VirtualSize int64             `json:"VirtualSize"`
	Labels      map[string]string `json:"Labels"`
	Containers  int64             `json:"Containers"`
}
