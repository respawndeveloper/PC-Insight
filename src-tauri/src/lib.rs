use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use serde_json::Value;
use sysinfo::{Disks, Networks, System};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct NetSnapshot {
    at: Instant,
    totals: HashMap<String, (u64, u64)>,
}

pub struct AppState {
    system: Mutex<System>,
    net: Mutex<NetSnapshot>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct OsInfo {
    name: String,
    version: String,
    long_version: String,
    kernel: String,
    hostname: String,
    uptime: u64,
    boot_time: u64,
    distribution_id: String,
    edition: Option<String>,
    build: Option<String>,
    display_version: Option<String>,
    install_date: Option<String>,
    registered_user: Option<String>,
    organization: Option<String>,
    product_id: Option<String>,
    system_drive: Option<String>,
    windows_dir: Option<String>,
    locale: Option<String>,
    time_zone: Option<String>,
    os_arch: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct MachineInfo {
    manufacturer: Option<String>,
    model: Option<String>,
    system_type: Option<String>,
    domain: Option<String>,
    user: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct CpuInfo {
    brand: String,
    vendor: String,
    arch: String,
    physical_cores: Option<usize>,
    logical_cores: usize,
    frequency_mhz: u64,
    max_clock_mhz: Option<u64>,
    socket: Option<String>,
    l2_cache_kb: Option<u64>,
    l3_cache_kb: Option<u64>,
    virtualization: Option<bool>,
    usage: f32,
    per_core: Vec<f32>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct MemoryInfo {
    total: u64,
    used: u64,
    available: u64,
    total_swap: u64,
    used_swap: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct MemoryModule {
    slot: Option<String>,
    bank: Option<String>,
    capacity: u64,
    speed: Option<u64>,
    rated_speed: Option<u64>,
    manufacturer: Option<String>,
    part_number: Option<String>,
    memory_type: Option<u64>,
    form_factor: Option<u64>,
    voltage: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct DiskInfo {
    name: String,
    mount_point: String,
    file_system: String,
    kind: String,
    total: u64,
    available: u64,
    removable: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct GpuInfo {
    name: String,
    vendor: Option<String>,
    memory: Option<u64>,
    driver: Option<String>,
    driver_date: Option<String>,
    resolution: Option<String>,
    refresh: Option<u64>,
    processor: Option<String>,
    status: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    name: Option<String>,
    manufacturer: Option<String>,
    year: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct NetworkInfo {
    name: String,
    received: u64,
    transmitted: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct BoardInfo {
    manufacturer: Option<String>,
    product: Option<String>,
    version: Option<String>,
    bios_vendor: Option<String>,
    bios_version: Option<String>,
    bios_date: Option<String>,
    secure_boot: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    os: OsInfo,
    machine: MachineInfo,
    cpu: CpuInfo,
    memory: MemoryInfo,
    memory_modules: Vec<MemoryModule>,
    disks: Vec<DiskInfo>,
    gpus: Vec<GpuInfo>,
    monitors: Vec<MonitorInfo>,
    networks: Vec<NetworkInfo>,
    board: Option<BoardInfo>,
    probe_error: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProcessInfo {
    pid: u32,
    name: String,
    cpu: f32,
    memory: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct NetworkRate {
    name: String,
    rx: u64,
    tx: u64,
    received: u64,
    transmitted: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct LiveStats {
    cpu_usage: f32,
    per_core: Vec<f32>,
    memory_used: u64,
    swap_used: u64,
    uptime: u64,
    process_count: usize,
    processes: Vec<ProcessInfo>,
    network_rates: Vec<NetworkRate>,
    rx_rate: u64,
    tx_rate: u64,
}

fn clean(value: Option<&Value>) -> Option<String> {
    let text = value?.as_str()?.trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn number(value: Option<&Value>) -> Option<u64> {
    let value = value?;
    if let Some(n) = value.as_u64() {
        return Some(n);
    }
    if let Some(n) = value.as_f64() {
        if n >= 0.0 {
            return Some(n as u64);
        }
    }
    value.as_str()?.trim().parse::<u64>().ok()
}

fn boolean(value: Option<&Value>) -> Option<bool> {
    value?.as_bool()
}

fn as_list(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(items)) => items.clone(),
        Some(Value::Null) | None => Vec::new(),
        Some(other) => vec![other.clone()],
    }
}

pub struct Probe {
    value: Option<Value>,
    error: Option<String>,
}

#[cfg(target_os = "windows")]
fn base64_utf16le(text: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut bytes: Vec<u8> = Vec::with_capacity(text.len() * 2);
    for unit in text.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }

    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn run_powershell(program: &str, encoded: &str) -> Result<Value, String> {
    let output = Command::new(program)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            encoded,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("{}: {}", program, error))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let text = stdout.trim();
    if text.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("{}: пустой ответ", program)
        } else {
            format!("{}: {}", program, stderr)
        });
    }

    let start = match text.find('{') {
        Some(index) => index,
        None => {
            return Err(format!(
                "{}: {}",
                program,
                text.chars().take(180).collect::<String>()
            ))
        }
    };

    serde_json::from_str::<Value>(&text[start..])
        .map_err(|error| format!("{}: {}", program, error))
}

#[cfg(target_os = "windows")]
fn probe_windows() -> Probe {
    let script = include_str!("winprobe.ps1");
    let encoded = base64_utf16le(script);
    let mut errors: Vec<String> = Vec::new();

    for program in ["powershell.exe", "pwsh.exe"] {
        match run_powershell(program, &encoded) {
            Ok(value) => {
                return Probe {
                    value: Some(value),
                    error: None,
                }
            }
            Err(error) => errors.push(error),
        }
    }

    Probe {
        value: None,
        error: Some(errors.join(" | ")),
    }
}

#[cfg(not(target_os = "windows"))]
fn probe_windows() -> Probe {
    Probe {
        value: None,
        error: None,
    }
}

#[cfg(target_os = "windows")]
fn probe_sensors() -> Probe {
    let script = include_str!("sensors.ps1");
    let encoded = base64_utf16le(script);
    let mut errors: Vec<String> = Vec::new();

    for program in ["powershell.exe", "pwsh.exe"] {
        match run_powershell(program, &encoded) {
            Ok(value) => {
                return Probe {
                    value: Some(value),
                    error: None,
                }
            }
            Err(error) => errors.push(error),
        }
    }

    Probe {
        value: None,
        error: Some(errors.join(" | ")),
    }
}

#[cfg(not(target_os = "windows"))]
fn probe_sensors() -> Probe {
    Probe {
        value: None,
        error: None,
    }
}

#[cfg(not(target_os = "windows"))]
fn run_command(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(target_os = "linux")]
fn fallback_gpus() -> Vec<GpuInfo> {
    let raw = match run_command("sh", &["-c", "lspci -mm | grep -Ei 'vga|3d|display'"]) {
        Some(value) => value,
        None => return Vec::new(),
    };

    raw.lines()
        .filter_map(|line| {
            let parts: Vec<String> = line
                .split('"')
                .map(|chunk| chunk.trim().to_string())
                .filter(|chunk| !chunk.is_empty())
                .collect();
            Some(GpuInfo {
                vendor: parts.get(2).cloned(),
                name: parts.get(3).cloned()?,
                ..Default::default()
            })
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn fallback_gpus() -> Vec<GpuInfo> {
    let raw = match run_command("system_profiler", &["-json", "SPDisplaysDataType"]) {
        Some(value) => value,
        None => return Vec::new(),
    };
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    as_list(parsed.get("SPDisplaysDataType"))
        .iter()
        .filter_map(|item| {
            Some(GpuInfo {
                name: clean(item.get("sppci_model"))?,
                vendor: clean(item.get("spdisplays_vendor")),
                ..Default::default()
            })
        })
        .collect()
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn fallback_gpus() -> Vec<GpuInfo> {
    Vec::new()
}

#[cfg(target_os = "linux")]
fn fallback_board() -> Option<BoardInfo> {
    let read = |path: &str| {
        std::fs::read_to_string(path)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    };
    Some(BoardInfo {
        manufacturer: read("/sys/devices/virtual/dmi/id/board_vendor"),
        product: read("/sys/devices/virtual/dmi/id/board_name"),
        version: read("/sys/devices/virtual/dmi/id/board_version"),
        bios_vendor: read("/sys/devices/virtual/dmi/id/bios_vendor"),
        bios_version: read("/sys/devices/virtual/dmi/id/bios_version"),
        bios_date: read("/sys/devices/virtual/dmi/id/bios_date"),
        secure_boot: None,
    })
}

#[cfg(not(target_os = "linux"))]
fn fallback_board() -> Option<BoardInfo> {
    None
}

fn average(values: &[f32]) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f32>() / values.len() as f32
}

fn per_core_usage(system: &System) -> Vec<f32> {
    system.cpus().iter().map(|cpu| cpu.cpu_usage()).collect()
}

#[tauri::command]
fn get_system_info(state: tauri::State<'_, AppState>) -> Result<SystemInfo, String> {
    let mut system = state.system.lock().map_err(|e| e.to_string())?;
    system.refresh_all();

    let cores = per_core_usage(&system);
    let first_cpu = system.cpus().first();

    let mut cpu = CpuInfo {
        brand: first_cpu
            .map(|cpu| cpu.brand().trim().to_string())
            .unwrap_or_else(|| "Неизвестный процессор".to_string()),
        vendor: first_cpu
            .map(|cpu| cpu.vendor_id().trim().to_string())
            .unwrap_or_default(),
        arch: std::env::consts::ARCH.to_string(),
        physical_cores: system.physical_core_count(),
        logical_cores: system.cpus().len(),
        frequency_mhz: first_cpu.map(|cpu| cpu.frequency()).unwrap_or(0),
        usage: average(&cores),
        per_core: cores,
        ..Default::default()
    };

    let memory = MemoryInfo {
        total: system.total_memory(),
        used: system.used_memory(),
        available: system.available_memory(),
        total_swap: system.total_swap(),
        used_swap: system.used_swap(),
    };

    let mut os = OsInfo {
        name: System::name().unwrap_or_else(|| "Неизвестно".to_string()),
        version: System::os_version().unwrap_or_default(),
        long_version: System::long_os_version().unwrap_or_default(),
        kernel: System::kernel_version().unwrap_or_default(),
        hostname: System::host_name().unwrap_or_else(|| "Компьютер".to_string()),
        uptime: System::uptime(),
        boot_time: System::boot_time(),
        distribution_id: System::distribution_id(),
        ..Default::default()
    };

    let disks = Disks::new_with_refreshed_list()
        .iter()
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().trim().to_string(),
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            file_system: disk.file_system().to_string_lossy().to_string(),
            kind: disk.kind().to_string(),
            total: disk.total_space(),
            available: disk.available_space(),
            removable: disk.is_removable(),
        })
        .collect();

    let networks = Networks::new_with_refreshed_list()
        .iter()
        .map(|(name, data)| NetworkInfo {
            name: name.clone(),
            received: data.total_received(),
            transmitted: data.total_transmitted(),
        })
        .collect();

    let mut machine = MachineInfo::default();
    let mut board = fallback_board();
    let mut gpus = fallback_gpus();
    let mut monitors: Vec<MonitorInfo> = Vec::new();
    let mut memory_modules: Vec<MemoryModule> = Vec::new();

    let probe_result = probe_windows();
    let probe_error = probe_result.error.clone();

    if let Some(probe) = probe_result.value {
        if let Some(node) = probe.get("os") {
            os.edition = clean(node.get("caption"));
            os.build = clean(node.get("build"));
            os.display_version = clean(node.get("displayVersion"));
            os.install_date = clean(node.get("installDate"));
            os.registered_user = clean(node.get("registeredUser"));
            os.organization = clean(node.get("organization"));
            os.product_id = clean(node.get("productId"));
            os.system_drive = clean(node.get("systemDrive"));
            os.windows_dir = clean(node.get("windowsDir"));
            os.locale = clean(node.get("locale"));
            os.time_zone = clean(node.get("timeZone"));
            os.os_arch = clean(node.get("arch"));
            if let (Some(build), Some(ubr)) = (os.build.clone(), number(node.get("ubr"))) {
                os.build = Some(format!("{}.{}", build, ubr));
            }
            if let Some(caption) = os.edition.clone() {
                os.long_version = caption;
            }
        }

        if let Some(node) = probe.get("machine") {
            machine = MachineInfo {
                manufacturer: clean(node.get("manufacturer")),
                model: clean(node.get("model")),
                system_type: clean(node.get("systemType")),
                domain: clean(node.get("domain")),
                user: clean(node.get("user")),
            };
        }

        if let Some(node) = probe.get("cpu") {
            cpu.socket = clean(node.get("socket"));
            cpu.max_clock_mhz = number(node.get("maxClock"));
            cpu.l2_cache_kb = number(node.get("l2"));
            cpu.l3_cache_kb = number(node.get("l3"));
            cpu.virtualization = boolean(node.get("virtualization"));
            if let Some(cores) = number(node.get("cores")) {
                cpu.physical_cores = Some(cores as usize);
            }
            if let Some(name) = clean(node.get("name")) {
                cpu.brand = name;
            }
        }

        if let Some(node) = probe.get("board") {
            board = Some(BoardInfo {
                manufacturer: clean(node.get("manufacturer")),
                product: clean(node.get("product")),
                version: clean(node.get("version")),
                bios_vendor: clean(node.get("biosVendor")),
                bios_version: clean(node.get("biosVersion")),
                bios_date: clean(node.get("biosDate")),
                secure_boot: boolean(node.get("secureBoot")),
            });
        }

        let probed_gpus: Vec<GpuInfo> = as_list(probe.get("gpus"))
            .iter()
            .filter_map(|item| {
                Some(GpuInfo {
                    name: clean(item.get("name"))?,
                    vendor: clean(item.get("vendor")),
                    memory: number(item.get("memory")),
                    driver: clean(item.get("driver")),
                    driver_date: clean(item.get("driverDate")),
                    resolution: clean(item.get("resolution")),
                    refresh: number(item.get("refresh")),
                    processor: clean(item.get("processor")),
                    status: clean(item.get("status")),
                })
            })
            .collect();
        if !probed_gpus.is_empty() {
            gpus = probed_gpus;
        }

        memory_modules = as_list(probe.get("memoryModules"))
            .iter()
            .map(|item| MemoryModule {
                slot: clean(item.get("slot")),
                bank: clean(item.get("bank")),
                capacity: number(item.get("capacity")).unwrap_or(0),
                speed: number(item.get("speed")),
                rated_speed: number(item.get("ratedSpeed")),
                manufacturer: clean(item.get("manufacturer")),
                part_number: clean(item.get("partNumber")),
                memory_type: number(item.get("memoryType")),
                form_factor: number(item.get("formFactor")),
                voltage: number(item.get("voltage")),
            })
            .collect();

        monitors = as_list(probe.get("monitors"))
            .iter()
            .map(|item| MonitorInfo {
                name: clean(item.get("name")),
                manufacturer: clean(item.get("manufacturer")),
                year: number(item.get("year")),
            })
            .filter(|item| item.name.is_some())
            .collect();
    }

    Ok(SystemInfo {
        os,
        machine,
        cpu,
        memory,
        memory_modules,
        disks,
        gpus,
        monitors,
        networks,
        board,
        probe_error,
    })
}

#[tauri::command]
fn get_live_stats(state: tauri::State<'_, AppState>) -> Result<LiveStats, String> {
    let mut system = state.system.lock().map_err(|e| e.to_string())?;
    system.refresh_all();

    let cores = per_core_usage(&system);

    let mut processes: Vec<ProcessInfo> = system
        .processes()
        .iter()
        .map(|(pid, process)| ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().to_string(),
            cpu: process.cpu_usage(),
            memory: process.memory(),
        })
        .collect();
    let process_count = processes.len();
    processes.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.memory.cmp(&a.memory))
    });
    processes.truncate(10);

    let networks = Networks::new_with_refreshed_list();
    let mut totals: HashMap<String, (u64, u64)> = HashMap::new();
    for (name, data) in networks.iter() {
        totals.insert(name.clone(), (data.total_received(), data.total_transmitted()));
    }

    let mut snapshot = state.net.lock().map_err(|e| e.to_string())?;
    let elapsed = snapshot.at.elapsed().as_secs_f64().max(0.2);

    let mut network_rates: Vec<NetworkRate> = Vec::new();
    let mut rx_rate = 0u64;
    let mut tx_rate = 0u64;

    for (name, (received, transmitted)) in totals.iter() {
        let (prev_rx, prev_tx) = snapshot.totals.get(name).copied().unwrap_or((*received, *transmitted));
        let rx = ((received.saturating_sub(prev_rx)) as f64 / elapsed) as u64;
        let tx = ((transmitted.saturating_sub(prev_tx)) as f64 / elapsed) as u64;
        rx_rate += rx;
        tx_rate += tx;
        network_rates.push(NetworkRate {
            name: name.clone(),
            rx,
            tx,
            received: *received,
            transmitted: *transmitted,
        });
    }

    network_rates.sort_by(|a, b| (b.rx + b.tx).cmp(&(a.rx + a.tx)));
    snapshot.totals = totals;
    snapshot.at = Instant::now();

    Ok(LiveStats {
        cpu_usage: average(&cores),
        per_core: cores,
        memory_used: system.used_memory(),
        swap_used: system.used_swap(),
        uptime: System::uptime(),
        process_count,
        processes,
        network_rates,
        rx_rate,
        tx_rate,
    })
}

#[tauri::command]
fn get_sensors() -> Result<Value, String> {
    let probe = probe_sensors();
    match probe.value {
        Some(mut value) => {
            if let Value::Object(map) = &mut value {
                map.insert("available".into(), Value::Bool(true));
            }
            Ok(value)
        }
        None => Ok(serde_json::json!({
            "available": false,
            "admin": false,
            "source": Value::Null,
            "temperatures": [],
            "fans": [],
            "gpu": [],
            "storage": [],
            "error": probe.error,
        })),
    }
}

#[tauri::command]
fn relaunch_as_admin(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let path = exe.to_string_lossy().replace('\'', "''");
        let script = format!(
            "Start-Process -FilePath '{}' -Verb RunAs -ErrorAction Stop",
            path
        );
        let encoded = base64_utf16le(&script);

        Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-EncodedCommand",
                &encoded,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;

        std::thread::sleep(std::time::Duration::from_millis(600));
        app.exit(0);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Elevation is only available on Windows".to_string())
    }
}

#[tauri::command]
fn save_report(content: String, filename: String) -> Result<String, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Не удалось определить домашнюю папку".to_string())?;

    let mut target = std::path::PathBuf::from(&home);
    let desktop = target.join("Desktop");
    if desktop.is_dir() {
        target = desktop;
    }
    target.push(filename);

    std::fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            system: Mutex::new(System::new_all()),
            net: Mutex::new(NetSnapshot {
                at: Instant::now(),
                totals: HashMap::new(),
            }),
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_live_stats,
            get_sensors,
            relaunch_as_admin,
            save_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
