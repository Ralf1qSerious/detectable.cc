using System.Diagnostics;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using Microsoft.Win32;
using DetectableLV.Models;

namespace DetectableLV;

public static class Scanner
{
    // ─── Cheat process fragments (matched as substrings, case-insensitive) ────
    private static readonly HashSet<string> CheatProcessFragments = new(StringComparer.OrdinalIgnoreCase)
    {
        // FiveM menus
        "eulen","lumia","kiddion","stand","phantom","cherax","yimmenu",
        "fivemcheat","fivemhack","gtahack","ragecheat","orbital","paragon",
        "zyros","menyoo","trainerv","nativeinvoker","midnight","midnightx",
        "scarlet","nightmare","ghostmenu","novamenu","civmod",
        "modmenu","gtamenu","gta5mod","ragemod","fivemmod",
        // Injectors
        "extremeinjector","xenosinjector","xenos64","xenos32","dllinjector",
        "winject","processinjector","injector64","injector32","dllinject",
        // RE / debugging
        "cheatengine","x64dbg","x32dbg","ollydbg","reclass","reclass64",
        "ghidra","retdec","ilspy","dnspy","de4dot","ida64","ida32","idapro",
        "binaryninja","pestudio","hxd","winhex","memorize","memreduct",
        // Packet
        "wireshark","fiddler","charlesproxy","mitmproxy","burpsuite",
        // Spoofers
        "hwidspoofr","spoofer","serialspoofr","guidspoofer","hwidspoof",
        "spoof64","spoof32","kmsauto","hwid_bypass",
        // Process tools (medium)
        "processhacker","procmon","procexp",
        // Remote access (medium)
        "teamviewer","anydesk","screenconnect","logmein","ultraviewer",
        // VPN (medium)
        "nordvpn","expressvpn","mullvadvpn","protonvpn","surfshark",
        "privateinternetaccess","cyberghost","ipvanish",
        // Misc
        "dumper","codecave","sigscanner","patternscan",
    };

    private static readonly HashSet<string> MediumSeverityFragments = new(StringComparer.OrdinalIgnoreCase)
    {
        "teamviewer","anydesk","screenconnect","logmein","ultraviewer",
        "nordvpn","expressvpn","mullvadvpn","protonvpn","surfshark",
        "privateinternetaccess","cyberghost","ipvanish",
        "wireshark","processhacker","procmon","procexp","pestudio",
    };

    private static readonly HashSet<string> CheatModuleFragments = new(StringComparer.OrdinalIgnoreCase)
    {
        "eulen","lumia","kiddion","stand","yimmenu","cherax","phantom",
        "orbital","paragon","zyros","midnight","scarlet",
        "xenos","winject","dllinject","cheatengine","dbk32","dbk64",
        "trainer","modmenu","hack","cheat","inject","loader",
    };

    private static readonly (string path, string severity)[] CheatDirectories =
    [
        (@"%APPDATA%\Kiddion's Modest Menu",            "critical"),
        (@"%APPDATA%\Stand",                             "critical"),
        (@"%APPDATA%\Cherax",                            "critical"),
        (@"%APPDATA%\Eulen",                             "critical"),
        (@"%APPDATA%\Lumia",                             "critical"),
        (@"%APPDATA%\PhantomX",                          "critical"),
        (@"%APPDATA%\Zyros",                             "critical"),
        (@"%APPDATA%\Paragon",                           "critical"),
        (@"%APPDATA%\Orbital",                           "critical"),
        (@"%APPDATA%\Midnight",                          "critical"),
        (@"%APPDATA%\Scarlet",                           "critical"),
        (@"%APPDATA%\GhostMenu",                         "critical"),
        (@"%LOCALAPPDATA%\Eulen",                        "critical"),
        (@"%LOCALAPPDATA%\YimMenu",                      "critical"),
        (@"%LOCALAPPDATA%\Stand",                        "critical"),
        (@"%LOCALAPPDATA%\Lumia",                        "critical"),
        (@"%LOCALAPPDATA%\FiveM\FiveM.app\plugins",      "high"),
        (@"%LOCALAPPDATA%\FiveM\FiveM.app\data\scripts", "medium"),
        (@"%TEMP%\Eulen",                                "critical"),
        (@"%TEMP%\kiddion",                              "critical"),
        (@"C:\Program Files\Cheat Engine 7.5",           "high"),
        (@"C:\Program Files\Cheat Engine 7.4",           "high"),
        (@"C:\Program Files (x86)\Cheat Engine 7.5",     "high"),
        (@"C:\Program Files (x86)\Cheat Engine 7.4",     "high"),
        (@"%LOCALAPPDATA%\x64dbg",                       "high"),
        (@"%LOCALAPPDATA%\dnSpy",                        "high"),
    ];

    private static readonly HashSet<string> SuspiciousFileNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "eulen.dll","eulen.exe","eulen_loader.exe",
        "lumia.dll","lumia.exe","lumia_loader.exe",
        "kiddions_modest_menu.exe","kiddion.exe",
        "stand.dll","stand_loader.exe",
        "cherax.dll","cherax_loader.exe","cherax.exe",
        "phantomx.dll","phantomx.exe","phantom.dll",
        "yimmenu.dll","yimmenu.exe",
        "orbital.dll","orbital.exe",
        "zyros.dll","zyros.exe",
        "paragon.dll","paragon.exe",
        "midnight.dll","midnight.exe","midnightx.dll",
        "scarlet.dll","scarlet.exe",
        "extreme_injector.exe","extremeinjector.exe",
        "xenos64.exe","xenos32.exe","xenosinjector.exe",
        "winject.exe","winject64.exe",
        "cheatengine-x86_64.exe","cheatengine.exe",
        "x64dbg.exe","x32dbg.exe",
        "processhacker.exe","processhacker3.exe",
        "reclass.exe","reclass64.exe","reclass.net.exe",
        "dnspy.exe","dnspy64.exe",
        "spoofer.exe","hwid_spoofer.exe","serialspoof.exe","hwidspoof.exe",
        "kmsauto.exe","kmsauto_net.exe",
        "inject.exe","injector.exe","loader.exe",
        "dbk32.sys","dbk64.sys",
    };

    private static readonly HashSet<string> SuspiciousServiceFragments = new(StringComparer.OrdinalIgnoreCase)
    {
        "dbk32","dbk64","cheatengine",
        "eulen","lumia","stand","cherax","yimmenu",
        "spoofer","hwid","xenos","injector",
    };

    private static readonly HashSet<string> GameExecutables = new(StringComparer.OrdinalIgnoreCase)
    {
        "GTA5.exe","GTAVLauncher.exe","FiveM.exe",
        "FiveM_b2802_GTAProcess.exe","RagePluginHook.exe",
    };

    private static readonly (RegistryHive hive, string subKey, string category)[] RegistryChecks =
    [
        (RegistryHive.CurrentUser,  @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",              "Startup (HKCU)"),
        (RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",              "Startup (HKLM)"),
        (RegistryHive.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",  "Startup (WOW)"),
        (RegistryHive.CurrentUser,  @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",          "RunOnce (HKCU)"),
        (RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",          "RunOnce (HKLM)"),
    ];

    private static readonly string[] QuickScanDirs =
    [
        Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "Local", "Temp"),
    ];

    // ─── Main entry point ─────────────────────────────────────────────────────
    public static ScanResult Run(Action<string> log)
    {
        var result = new ScanResult();
        var flags  = result.FlaggedItems;
        result.SystemFlags = new SystemFlags();

        log("Collecting system information…");
        result.SystemInfo = CollectSystemInfo();

        log("Detecting virtual machine indicators…");
        DetectVirtualMachine(result.SystemFlags, flags);

        log("Checking Windows Defender status…");
        CheckDefenderStatus(result.SystemFlags, flags);

        log("Scanning running processes…");
        result.Processes = ScanProcesses(result.SystemFlags, flags);

        log("Scanning loaded DLL modules in processes…");
        result.SuspiciousModules = ScanLoadedModules(flags);

        log("Scanning active network connections…");
        result.NetworkConnections = ScanNetworkConnections(result.Processes, flags);

        log("Scanning Windows services and kernel drivers…");
        result.Services = ScanServices(flags);

        log("Scanning scheduled tasks…");
        result.ScheduledTasks = ScanScheduledTasks(flags);

        log("Scanning known cheat directories…");
        result.FileFindings.AddRange(ScanCheatDirectories(flags));

        log("Scanning user directories for suspicious executables…");
        result.FileFindings.AddRange(ScanQuickDirs(flags));

        log("Scanning FiveM application data…");
        result.FileFindings.AddRange(ScanFiveMData(flags));

        log("Scanning registry startup and IFEO hooks…");
        result.RegistryFindings = ScanRegistry(result.SystemFlags, flags);

        log("Scanning recently opened files…");
        result.RecentFiles = ScanRecentFiles(flags);

        log("Enumerating installed software…");
        result.InstalledSoftware = GetInstalledSoftware(flags);

        log("Capturing screenshot…");
        result.Screenshot = TakeScreenshot();

        log("Calculating risk score…");
        (result.RiskScore, result.RiskLevel) = ComputeRiskScore(result);

        log($"Scan complete — Risk: {result.RiskLevel.ToUpper()} ({result.RiskScore}/100) — {flags.Count} flagged item(s).");
        return result;
    }

    // ─── System Info ──────────────────────────────────────────────────────────
    private static SystemInfo CollectSystemInfo()
    {
        var info = new SystemInfo
        {
            Username     = Environment.UserName,
            ComputerName = Environment.MachineName,
            Os           = RuntimeInformation.OSDescription,
            ScannedAt    = DateTime.UtcNow.ToString("o"),
            Timezone     = TimeZoneInfo.Local.DisplayName,
            Uptime       = FormatUptime(Environment.TickCount64),
        };
        try
        {
            var b = System.Windows.Forms.Screen.PrimaryScreen?.Bounds;
            if (b.HasValue) info.ScreenRes = $"{b.Value.Width}x{b.Value.Height}";
        }
        catch { }
        try
        {
            using var s = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor");
            foreach (ManagementObject o in s.Get()) info.CpuName = o["Name"]?.ToString()?.Trim() ?? "";
        }
        catch { }
        try
        {
            using var s = new ManagementObjectSearcher("SELECT TotalVisibleMemorySize FROM Win32_OperatingSystem");
            foreach (ManagementObject o in s.Get())
                if (ulong.TryParse(o["TotalVisibleMemorySize"]?.ToString(), out var kb))
                    info.TotalRam = $"{kb / 1024 / 1024} GB";
        }
        catch { }
        try
        {
            using var s = new ManagementObjectSearcher("SELECT Name FROM Win32_VideoController");
            var gpus = new List<string>();
            foreach (ManagementObject o in s.Get())
            {
                var n = o["Name"]?.ToString();
                if (!string.IsNullOrWhiteSpace(n)) gpus.Add(n.Trim());
            }
            info.GpuName = string.Join(", ", gpus);
        }
        catch { }
        try
        {
            var raw = new StringBuilder(Environment.MachineName);
            using (var s = new ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor"))
                foreach (ManagementObject o in s.Get()) raw.Append(o["ProcessorId"]);
            using (var s = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BaseBoard"))
                foreach (ManagementObject o in s.Get()) raw.Append(o["SerialNumber"]);
            info.Hwid = Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(raw.ToString())));
        }
        catch { }
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var ua in nic.GetIPProperties().UnicastAddresses)
                    if (ua.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                        && !IPAddress.IsLoopback(ua.Address))
                    {
                        info.IpAddress  = ua.Address.ToString();
                        info.MacAddress = BitConverter.ToString(
                            nic.GetPhysicalAddress().GetAddressBytes()).Replace('-', ':');
                        break;
                    }
                if (!string.IsNullOrEmpty(info.IpAddress)) break;
            }
        }
        catch { }
        return info;
    }

    private static string FormatUptime(long ms)
    {
        var ts = TimeSpan.FromMilliseconds(ms);
        return $"{(int)ts.TotalHours}h {ts.Minutes}m";
    }

    // ─── VM Detection ─────────────────────────────────────────────────────────
    private static void DetectVirtualMachine(SystemFlags sf, List<FlaggedItem> flags)
    {
        var vmStrings = new[] { "vmware","virtualbox","vbox","qemu","xen",
                                "microsoft corporation","innotek","parallels","bhyve" };
        try
        {
            using var s = new ManagementObjectSearcher(
                "SELECT Manufacturer,Model FROM Win32_ComputerSystem");
            foreach (ManagementObject o in s.Get())
            {
                var mfg   = (o["Manufacturer"]?.ToString() ?? "").ToLowerInvariant();
                var model = (o["Model"]?.ToString()        ?? "").ToLowerInvariant();
                var m     = vmStrings.FirstOrDefault(v => (mfg + model).Contains(v));
                if (m == null) continue;
                sf.IsVirtualMachine = true;
                sf.VmIndicator      = $"{o["Manufacturer"]} / {o["Model"]}";
                flags.Add(new FlaggedItem { Name="Virtual Machine", Category="System",
                    Detail=sf.VmIndicator, Severity="medium" });
                return;
            }
        }
        catch { }
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Services\Disk\Enum");
            var val = key?.GetValue("0")?.ToString()?.ToLowerInvariant() ?? "";
            var m   = vmStrings.FirstOrDefault(v => val.Contains(v));
            if (m != null)
            {
                sf.IsVirtualMachine = true;
                sf.VmIndicator      = $"Disk enum: {val}";
                flags.Add(new FlaggedItem { Name="Virtual Machine (Disk)", Category="System",
                    Detail=sf.VmIndicator, Severity="medium" });
            }
        }
        catch { }
    }

    // ─── Defender ─────────────────────────────────────────────────────────────
    private static void CheckDefenderStatus(SystemFlags sf, List<FlaggedItem> flags)
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows Defender\Real-Time Protection");
            if (key?.GetValue("DisableRealtimeMonitoring") is int i && i == 1)
            {
                sf.DefenderDisabled = true;
                flags.Add(new FlaggedItem { Name="Windows Defender Disabled", Category="System",
                    Detail="Real-time protection off — possible cheat evasion", Severity="high" });
            }
        }
        catch { }
    }

    // ─── Processes ────────────────────────────────────────────────────────────
    private static List<ProcessInfo> ScanProcesses(SystemFlags sf, List<FlaggedItem> flags)
    {
        var list = new List<ProcessInfo>();
        foreach (var p in Process.GetProcesses())
        {
            string path = "";
            try { path = p.MainModule?.FileName ?? ""; } catch { }
            var (susp, reason, sev) = ClassifyProcess(p.ProcessName);
            list.Add(new ProcessInfo { Name=p.ProcessName, Pid=p.Id, Path=path,
                Suspicious=susp, SuspicionReason=reason });
            if (susp)
                flags.Add(new FlaggedItem { Name=p.ProcessName, Category="Process",
                    Detail=$"PID {p.Id}" + (string.IsNullOrEmpty(path) ? "" : $" — {path}"),
                    Severity=sev });

            var lower = p.ProcessName.ToLowerInvariant();
            if (lower is "fivem" or "fivem_b2802_gtaprocess") sf.FiveMRunning = true;
            if (lower is "gta5" or "gtav")                    sf.GtaRunning   = true;
            if (susp && MediumSeverityFragments.Any(f => lower.Contains(f)))
            {
                if (lower.Contains("vpn") || lower is "nordvpn" or "expressvpn"
                    or "mullvadvpn" or "protonvpn" or "surfshark")
                { sf.VpnDetected = true; sf.VpnProcess = p.ProcessName; }
                else if (lower is "teamviewer" or "anydesk" or "screenconnect"
                    or "ultraviewer" or "logmein")
                { sf.RemoteAccessDetected = true; sf.RemoteAccessProcess = p.ProcessName; }
            }
            p.Dispose();
        }
        return [.. list.OrderBy(x => x.Name)];
    }

    private static (bool susp, string? reason, string sev) ClassifyProcess(string name)
    {
        var lower = name.ToLowerInvariant();
        foreach (var f in MediumSeverityFragments)
            if (lower.Contains(f)) return (true, $"Matches '{f}'", "medium");
        foreach (var f in CheatProcessFragments)
            if (lower.Contains(f))
            {
                var sev = f is "cheatengine" or "x64dbg" or "x32dbg"
                    or "ollydbg" or "processhacker" ? "high" : "critical";
                return (true, $"Matches '{f}'", sev);
            }
        return (false, null, "");
    }

    // ─── Loaded Modules ───────────────────────────────────────────────────────
    private static List<LoadedModule> ScanLoadedModules(List<FlaggedItem> flags)
    {
        var found = new List<LoadedModule>();
        foreach (var proc in Process.GetProcesses())
        {
            try
            {
                foreach (ProcessModule mod in proc.Modules)
                {
                    var ml = mod.ModuleName.ToLowerInvariant();
                    if (!CheatModuleFragments.Any(f => ml.Contains(f))) continue;
                    found.Add(new LoadedModule { ProcessName=proc.ProcessName, Pid=proc.Id,
                        ModuleName=mod.ModuleName, ModulePath=mod.FileName ?? "" });
                    flags.Add(new FlaggedItem { Name=mod.ModuleName, Category="Loaded Module",
                        Detail=$"In {proc.ProcessName} (PID {proc.Id}) — {mod.FileName}",
                        Severity="critical" });
                }
            }
            catch { }
            finally { proc.Dispose(); }
        }
        return found;
    }

    // ─── Network Connections ──────────────────────────────────────────────────
    private static List<NetworkConnection> ScanNetworkConnections(
        List<ProcessInfo> processes, List<FlaggedItem> flags)
    {
        var pidToName  = processes.ToDictionary(p => p.Pid, p => p.Name);
        var suspicious = processes.Where(p => p.Suspicious).Select(p => p.Pid).ToHashSet();
        var conns      = new List<NetworkConnection>();
        try
        {
            var psi = new ProcessStartInfo("netstat", "-ano")
            { RedirectStandardOutput=true, UseShellExecute=false, CreateNoWindow=true };
            using var proc = Process.Start(psi);
            if (proc == null) return conns;
            var output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(5000);

            var rx = new Regex(
                @"^\s*(TCP|UDP)\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s+(\d+)\s*$",
                RegexOptions.Multiline | RegexOptions.IgnoreCase);
            foreach (Match m in rx.Matches(output))
            {
                if (!int.TryParse(m.Groups[5].Value, out var pid)) continue;
                var proto  = m.Groups[1].Value.ToUpper();
                var local  = m.Groups[2].Value;
                var remote = m.Groups[3].Value;
                var state  = m.Groups[4].Value;
                pidToName.TryGetValue(pid, out var pn);
                var susp = suspicious.Contains(pid);
                conns.Add(new NetworkConnection { Protocol=proto, LocalEndpoint=local,
                    RemoteEndpoint=remote, State=state, Pid=pid, ProcessName=pn ?? "",
                    Suspicious=susp });
                if (susp && state.Equals("ESTABLISHED", StringComparison.OrdinalIgnoreCase))
                    flags.Add(new FlaggedItem { Name=$"Active connection: {pn}",
                        Category="Network", Detail=$"{proto} {local} → {remote}", Severity="high" });
            }
        }
        catch { }
        return [.. conns.OrderBy(c => c.ProcessName)];
    }

    // ─── Services ─────────────────────────────────────────────────────────────
    private static List<ServiceEntry> ScanServices(List<FlaggedItem> flags)
    {
        var list = new List<ServiceEntry>();
        try
        {
            using var s = new ManagementObjectSearcher(
                "SELECT Name,DisplayName,State,StartMode,PathName FROM Win32_Service");
            foreach (ManagementObject o in s.Get())
            {
                var name = o["Name"]?.ToString() ?? "";
                var disp = o["DisplayName"]?.ToString() ?? "";
                var st   = o["State"]?.ToString() ?? "";
                var sm   = o["StartMode"]?.ToString() ?? "";
                var path = o["PathName"]?.ToString() ?? "";
                var susp = SuspiciousServiceFragments.Any(f =>
                    (name + disp + path).ToLowerInvariant().Contains(f));
                list.Add(new ServiceEntry { Name=name, DisplayName=disp, State=st,
                    StartType=sm, PathName=path, Suspicious=susp });
                if (susp)
                    flags.Add(new FlaggedItem { Name=name, Category="Service",
                        Detail=$"{disp} — {st} — {path}", Severity="high" });
            }
        }
        catch { }
        // Kernel drivers via registry
        try
        {
            using var sk = Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Services");
            if (sk != null)
                foreach (var sn in sk.GetSubKeyNames())
                {
                    using var sub = sk.OpenSubKey(sn);
                    var img = sub?.GetValue("ImagePath")?.ToString()?.ToLowerInvariant() ?? "";
                    if (!img.EndsWith(".sys")) continue;
                    var sl = sn.ToLowerInvariant();
                    if (!SuspiciousServiceFragments.Any(f => sl.Contains(f)) &&
                        !SuspiciousFileNames.Any(f => img.Contains(f.ToLowerInvariant()))) continue;
                    if (list.Any(x => x.Name.Equals(sn, StringComparison.OrdinalIgnoreCase))) continue;
                    list.Add(new ServiceEntry { Name=sn,
                        DisplayName=sub?.GetValue("DisplayName")?.ToString() ?? sn,
                        PathName=img, Suspicious=true });
                    flags.Add(new FlaggedItem { Name=sn, Category="Kernel Driver",
                        Detail=$"Suspicious driver: {img}", Severity="critical" });
                }
        }
        catch { }
        return [.. list.OrderBy(x => x.Name)];
    }

    // ─── Scheduled Tasks ──────────────────────────────────────────────────────
    private static List<ScheduledTaskEntry> ScanScheduledTasks(List<FlaggedItem> flags)
    {
        var tasks = new List<ScheduledTaskEntry>();
        try
        {
            var psi = new ProcessStartInfo("powershell.exe",
                "-NonInteractive -NoProfile -WindowStyle Hidden -Command " +
                "\"Get-ScheduledTask | ForEach-Object { $t=$_; " +
                "$a=($t.Actions|Where-Object{$_.Execute}|Select-Object -First 1); " +
                "[PSCustomObject]@{Name=$t.TaskName;Path=$t.TaskPath;" +
                "State=$t.State.ToString();Action=if($a){$a.Execute}else{''}} } | " +
                "ConvertTo-Json -Depth 2 -Compress\"")
            { RedirectStandardOutput=true, RedirectStandardError=true,
              UseShellExecute=false, CreateNoWindow=true };
            using var proc = Process.Start(psi);
            if (proc == null) return tasks;
            var json = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(10000);

            List<Dictionary<string, string>>? parsed = null;
            try { parsed = Newtonsoft.Json.JsonConvert.DeserializeObject<
                    List<Dictionary<string, string>>>(json); }
            catch
            {
                // Might be a single object, not array
                try
                {
                    var single = Newtonsoft.Json.JsonConvert.DeserializeObject<
                        Dictionary<string, string>>(json);
                    if (single != null) parsed = [single];
                }
                catch { }
            }
            if (parsed == null) return tasks;

            foreach (var d in parsed)
            {
                var name   = DGet(d, "Name");
                var path   = DGet(d, "Path");
                var state  = DGet(d, "State");
                var action = DGet(d, "Action");
                var lower  = (name + path + action).ToLowerInvariant();
                var susp   = CheatProcessFragments.Any(f => lower.Contains(f)) ||
                             SuspiciousFileNames.Any(f => lower.Contains(
                                 f.ToLowerInvariant().Replace(".exe","").Replace(".dll","")));
                tasks.Add(new ScheduledTaskEntry { TaskName=name, TaskPath=path,
                    Action=action, State=state, Suspicious=susp });
                if (susp)
                    flags.Add(new FlaggedItem { Name=name, Category="Scheduled Task",
                        Detail=$"{action} [{state}]", Severity="high" });
            }
        }
        catch { }
        return [.. tasks.OrderBy(t => t.TaskName)];
    }
    private static string DGet(Dictionary<string, string> d, string k) =>
        d.TryGetValue(k, out var v) ? v ?? "" : "";

    // ─── Known cheat directories ──────────────────────────────────────────────
    private static List<FileFinding> ScanCheatDirectories(List<FlaggedItem> flags)
    {
        var results = new List<FileFinding>();
        foreach (var (rawPath, sev) in CheatDirectories)
        {
            var path   = Environment.ExpandEnvironmentVariables(rawPath);
            var exists = Directory.Exists(path) || File.Exists(path);
            results.Add(new FileFinding { Path=path,
                Note=exists ? "Found on disk" : "Not present", Suspicious=exists, Severity=sev });
            if (exists)
                flags.Add(new FlaggedItem { Name=Path.GetFileName(path), Category="File System",
                    Detail=$"Known cheat path: {path}", Severity=sev });
        }
        return results;
    }

    // ─── Surface file scan ────────────────────────────────────────────────────
    private static List<FileFinding> ScanQuickDirs(List<FlaggedItem> flags)
    {
        var results = new List<FileFinding>();
        foreach (var dir in QuickScanDirs)
        {
            if (!Directory.Exists(dir)) continue;
            try
            {
                foreach (var file in Directory.EnumerateFiles(dir, "*",
                    SearchOption.TopDirectoryOnly)
                    .Where(f => { var e=Path.GetExtension(f).ToLowerInvariant();
                                  return e is ".exe" or ".dll" or ".sys"; }))
                {
                    var fn = Path.GetFileName(file);
                    if (!SuspiciousFileNames.Contains(fn)) continue;
                    results.Add(new FileFinding { Path=file,
                        Note="Matches known cheat file name", Suspicious=true, Severity="high" });
                    flags.Add(new FlaggedItem { Name=fn, Category="File System",
                        Detail=$"Suspicious file: {file}", Severity="high" });
                }
            }
            catch { }
        }
        return results;
    }

    // ─── FiveM specific ───────────────────────────────────────────────────────
    private static List<FileFinding> ScanFiveMData(List<FlaggedItem> flags)
    {
        var results = new List<FileFinding>();
        var fivemBase = Environment.ExpandEnvironmentVariables(
            @"%LOCALAPPDATA%\FiveM\FiveM.app");
        if (!Directory.Exists(fivemBase)) return results;

        var pluginsDir = Path.Combine(fivemBase, "plugins");
        if (Directory.Exists(pluginsDir))
        {
            foreach (var file in Directory.EnumerateFiles(pluginsDir, "*.dll"))
            {
                var name  = Path.GetFileName(file).ToLowerInvariant();
                var known = new[] { "ennui-asi-loader" };
                var susp  = !known.Any(k => name.Contains(k));
                results.Add(new FileFinding { Path=file,
                    Note=susp ? "Unknown plugin DLL in FiveM plugins" : "Known plugin",
                    Suspicious=susp, Severity="high" });
                if (susp)
                    flags.Add(new FlaggedItem { Name=Path.GetFileName(file),
                        Category="FiveM Plugin", Detail=$"Unknown DLL: {file}",
                        Severity="high" });
            }
        }

        var crashDir = Path.Combine(fivemBase, "crashes");
        if (Directory.Exists(crashDir))
        {
            var dumps = Directory.GetFiles(crashDir, "*.dmp");
            if (dumps.Length > 5)
                results.Add(new FileFinding { Path=crashDir,
                    Note=$"{dumps.Length} crash dumps — possible cheat-induced crashes",
                    Suspicious=false, Severity="low" });
        }
        return results;
    }

    // ─── Registry ─────────────────────────────────────────────────────────────
    private static List<RegistryFinding> ScanRegistry(SystemFlags sf, List<FlaggedItem> flags)
    {
        var results = new List<RegistryFinding>();
        foreach (var (hive, subKey, cat) in RegistryChecks)
        {
            try
            {
                using var key = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64)
                                           .OpenSubKey(subKey);
                if (key == null) continue;
                foreach (var valueName in key.GetValueNames())
                {
                    var data  = key.GetValue(valueName)?.ToString() ?? "";
                    var lower = (valueName + data).ToLowerInvariant();
                    var susp  = CheatProcessFragments.Any(f => lower.Contains(f)) ||
                                SuspiciousFileNames.Any(f => lower.Contains(f.ToLowerInvariant()));
                    results.Add(new RegistryFinding { Key=$@"{HiveName(hive)}\{subKey}\{valueName}",
                        Value=data, Suspicious=susp, Category=cat });
                    if (susp)
                        flags.Add(new FlaggedItem { Name=valueName, Category="Registry Startup",
                            Detail=$"Suspicious startup entry: {data}", Severity="high" });
                }
            }
            catch { }
        }
        // IFEO
        try
        {
            using var ifeo = Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options");
            if (ifeo != null)
                foreach (var exeName in ifeo.GetSubKeyNames())
                {
                    using var sub = ifeo.OpenSubKey(exeName);
                    var dbg = sub?.GetValue("Debugger")?.ToString();
                    if (string.IsNullOrWhiteSpace(dbg)) continue;
                    var susp = GameExecutables.Contains(exeName) ||
                               CheatProcessFragments.Any(f =>
                                   (exeName + dbg).ToLowerInvariant().Contains(f));
                    results.Add(new RegistryFinding {
                        Key=$@"HKLM\...\IFEO\{exeName}\Debugger", Value=dbg,
                        Suspicious=susp, Category="IFEO" });
                    if (susp)
                    {
                        sf.IFEOKeysFound = true;
                        flags.Add(new FlaggedItem { Name=exeName, Category="IFEO Hook",
                            Detail=$"Process launch hooked → {dbg}", Severity="critical" });
                    }
                }
        }
        catch { }
        return results;
    }

    // ─── Recent Files ─────────────────────────────────────────────────────────
    private static List<RecentFileEntry> ScanRecentFiles(List<FlaggedItem> flags)
    {
        var results = new List<RecentFileEntry>();
        var recentDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            @"Microsoft\Windows\Recent");
        if (!Directory.Exists(recentDir)) return results;
        try
        {
            foreach (var lnk in Directory.EnumerateFiles(recentDir, "*.lnk"))
            {
                var name  = Path.GetFileNameWithoutExtension(lnk);
                var lower = name.ToLowerInvariant();
                var susp  = CheatProcessFragments.Any(f => lower.Contains(f)) ||
                            SuspiciousFileNames.Any(f =>
                                lower.Contains(Path.GetFileNameWithoutExtension(f).ToLowerInvariant()));
                results.Add(new RecentFileEntry { Name=name, Target=lnk, Suspicious=susp });
                if (susp)
                    flags.Add(new FlaggedItem { Name=name, Category="Recent Files",
                        Detail=$"Recently accessed: {name}", Severity="medium" });
            }
        }
        catch { }
        return [.. results.OrderByDescending(r => r.Suspicious).ThenBy(r => r.Name)];
    }

    // ─── Installed Software ───────────────────────────────────────────────────
    private static List<InstalledSoftware> GetInstalledSoftware(List<FlaggedItem> flags)
    {
        var list = new List<InstalledSoftware>();
        var rps  = new[]
        {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        };
        foreach (var rp in rps)
        {
            try
            {
                using var key = Registry.LocalMachine.OpenSubKey(rp);
                if (key == null) continue;
                foreach (var sub in key.GetSubKeyNames())
                {
                    using var sk = key.OpenSubKey(sub);
                    var name = sk?.GetValue("DisplayName")?.ToString();
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    var susp = CheatProcessFragments.Any(f =>
                        name.ToLowerInvariant().Contains(f));
                    var e = new InstalledSoftware { Name=name,
                        Publisher  =sk?.GetValue("Publisher")?.ToString() ?? "",
                        Version    =sk?.GetValue("DisplayVersion")?.ToString() ?? "",
                        InstallDate=sk?.GetValue("InstallDate")?.ToString() ?? "",
                        Suspicious =susp };
                    list.Add(e);
                    if (susp)
                        flags.Add(new FlaggedItem { Name=name, Category="Installed Software",
                            Detail=$"Publisher: {e.Publisher}  Ver: {e.Version}", Severity="high" });
                }
            }
            catch { }
        }
        return [.. list.OrderBy(x => x.Name)];
    }

    // ─── Screenshot (JPEG 70% quality to keep payload small) ──────────────────
    private static string? TakeScreenshot()
    {
        try
        {
            var screen = System.Windows.Forms.Screen.PrimaryScreen;
            if (screen == null) return null;
            var b = screen.Bounds;
            // Scale down to max 1920-wide to cap payload size
            int w = Math.Min(b.Width, 1920);
            int h = (int)(b.Height * ((double)w / b.Width));
            using var full   = new Bitmap(b.Width, b.Height, PixelFormat.Format32bppArgb);
            using var g      = Graphics.FromImage(full);
            g.CopyFromScreen(b.Location, Point.Empty, b.Size);
            using var scaled = new Bitmap(full, new System.Drawing.Size(w, h));
            // JPEG encoder at 70% quality
            var jpegCodec = System.Drawing.Imaging.ImageCodecInfo
                .GetImageEncoders()
                .First(c => c.FormatID == ImageFormat.Jpeg.Guid);
            using var ep = new System.Drawing.Imaging.EncoderParameters(1);
            ep.Param[0] = new System.Drawing.Imaging.EncoderParameter(
                System.Drawing.Imaging.Encoder.Quality, 70L);
            using var ms = new MemoryStream();
            scaled.Save(ms, jpegCodec, ep);
            return Convert.ToBase64String(ms.ToArray());
        }
        catch { return null; }
    }

    // ─── Risk Score ───────────────────────────────────────────────────────────
    private static (int score, string level) ComputeRiskScore(ScanResult r)
    {
        int score = 0;
        foreach (var f in r.FlaggedItems)
            score += f.Severity switch
            {
                "critical" => 30,
                "high"     => 15,
                "medium"   => 5,
                _          => 2
            };
        if (r.SystemFlags.DefenderDisabled) score += 10;
        if (r.SystemFlags.IFEOKeysFound)   score += 15;
        if (r.SystemFlags.IsVirtualMachine) score += 5;
        if (r.SystemFlags.VpnDetected)     score += 3;
        score = Math.Min(score, 100);
        return (score, score switch
        {
            0      => "clean",
            <= 20  => "low",
            <= 50  => "medium",
            <= 80  => "high",
            _      => "critical"
        });
    }

    private static string HiveName(RegistryHive h) => h switch
    {
        RegistryHive.CurrentUser  => "HKCU",
        RegistryHive.LocalMachine => "HKLM",
        _                         => h.ToString()
    };
}

