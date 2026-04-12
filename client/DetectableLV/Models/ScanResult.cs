namespace DetectableLV.Models;

public class ScanResult
{
    public SystemInfo SystemInfo { get; set; } = new();
    public SystemFlags SystemFlags { get; set; } = new();
    public int RiskScore { get; set; }           // 0–100
    public string RiskLevel { get; set; } = "clean"; // clean | low | medium | high | critical
    public List<FlaggedItem> FlaggedItems { get; set; } = [];
    public List<ProcessInfo> Processes { get; set; } = [];
    public List<LoadedModule> SuspiciousModules { get; set; } = [];
    public List<NetworkConnection> NetworkConnections { get; set; } = [];
    public List<FileFinding> FileFindings { get; set; } = [];
    public List<RegistryFinding> RegistryFindings { get; set; } = [];
    public List<InstalledSoftware> InstalledSoftware { get; set; } = [];
    public List<ServiceEntry> Services { get; set; } = [];
    public List<ScheduledTaskEntry> ScheduledTasks { get; set; } = [];
    public List<RecentFileEntry> RecentFiles { get; set; } = [];
    public string? Screenshot { get; set; }
}

// ─── System ───────────────────────────────────────────────────────────────────
public class SystemInfo
{
    public string Username { get; set; } = "";
    public string ComputerName { get; set; } = "";
    public string Os { get; set; } = "";
    public string CpuName { get; set; } = "";
    public string TotalRam { get; set; } = "";
    public string GpuName { get; set; } = "";
    public string IpAddress { get; set; } = "";
    public string MacAddress { get; set; } = "";
    public string Hwid { get; set; } = "";
    public string ScreenRes { get; set; } = "";
    public string Timezone { get; set; } = "";
    public string Uptime { get; set; } = "";
    public string ScannedAt { get; set; } = "";
    public string ScannerVersion { get; set; } = "2.0.0";
}

public class SystemFlags
{
    public bool IsVirtualMachine { get; set; }
    public string? VmIndicator { get; set; }
    public bool DefenderDisabled { get; set; }
    public bool IFEOKeysFound { get; set; }
    public bool FiveMRunning { get; set; }
    public bool GtaRunning { get; set; }
    public bool VpnDetected { get; set; }
    public string? VpnProcess { get; set; }
    public bool RemoteAccessDetected { get; set; }
    public string? RemoteAccessProcess { get; set; }
    public bool SpoofedHwid { get; set; }
}

// ─── Flagged ──────────────────────────────────────────────────────────────────
public class FlaggedItem
{
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string Detail { get; set; } = "";
    public string Severity { get; set; } = "high"; // critical | high | medium | low
}

// ─── Processes & Modules ─────────────────────────────────────────────────────
public class ProcessInfo
{
    public string Name { get; set; } = "";
    public int Pid { get; set; }
    public string Path { get; set; } = "";
    public bool Suspicious { get; set; }
    public string? SuspicionReason { get; set; }
}

public class LoadedModule
{
    public string ProcessName { get; set; } = "";
    public int Pid { get; set; }
    public string ModuleName { get; set; } = "";
    public string ModulePath { get; set; } = "";
}

// ─── Network ──────────────────────────────────────────────────────────────────
public class NetworkConnection
{
    public string Protocol { get; set; } = "";
    public string LocalEndpoint { get; set; } = "";
    public string RemoteEndpoint { get; set; } = "";
    public string State { get; set; } = "";
    public int Pid { get; set; }
    public string ProcessName { get; set; } = "";
    public bool Suspicious { get; set; }
}

// ─── Files & Registry ────────────────────────────────────────────────────────
public class FileFinding
{
    public string Path { get; set; } = "";
    public string Note { get; set; } = "";
    public bool Suspicious { get; set; }
    public string Severity { get; set; } = "high";
}

public class RegistryFinding
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
    public bool Suspicious { get; set; }
    public string Category { get; set; } = "";
}

// ─── Software & Services ─────────────────────────────────────────────────────
public class InstalledSoftware
{
    public string Name { get; set; } = "";
    public string Publisher { get; set; } = "";
    public string Version { get; set; } = "";
    public string InstallDate { get; set; } = "";
    public bool Suspicious { get; set; }
}

public class ServiceEntry
{
    public string Name { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string State { get; set; } = "";
    public string StartType { get; set; } = "";
    public string PathName { get; set; } = "";
    public bool Suspicious { get; set; }
}

// ─── Tasks & Recent Files ────────────────────────────────────────────────────
public class ScheduledTaskEntry
{
    public string TaskName { get; set; } = "";
    public string TaskPath { get; set; } = "";
    public string Action { get; set; } = "";
    public string State { get; set; } = "";
    public bool Suspicious { get; set; }
}

public class RecentFileEntry
{
    public string Name { get; set; } = "";
    public string Target { get; set; } = "";
    public bool Suspicious { get; set; }
}
