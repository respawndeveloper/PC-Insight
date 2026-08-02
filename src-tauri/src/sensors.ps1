$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Safe($block) {
    try { & $block } catch { $null }
}

function Str($value) {
    if ($null -eq $value) { return $null }
    $text = ([string]$value).Trim()
    if ($text.Length -eq 0) { return $null }
    return $text
}

function Num($value) {
    if ($null -eq $value) { return $null }
    try {
        $d = [double]$value
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $null }
        return $d
    } catch { return $null }
}

$isAdmin = $false
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { }

$temperatures = @()
$fans = @()
$source = $null

foreach ($ns in @('root\LibreHardwareMonitor', 'root\OpenHardwareMonitor')) {
    if ($temperatures.Count -gt 0 -or $fans.Count -gt 0) { break }

    $sensors = Safe { Get-CimInstance -Namespace $ns -ClassName Sensor }
    if (-not $sensors) { continue }

    $hardware = @{}
    foreach ($h in @(Safe { Get-CimInstance -Namespace $ns -ClassName Hardware })) {
        if ($h.Identifier) { $hardware[[string]$h.Identifier] = [string]$h.Name }
    }

    foreach ($s in @($sensors)) {
        $value = Num $s.Value
        if ($null -eq $value) { continue }
        $label = Str $s.Name
        if (-not $label) { continue }

        $parent = $null
        $id = [string]$s.Parent
        if ($id -and $hardware.ContainsKey($id)) { $parent = $hardware[$id] }

        if ($s.SensorType -eq 'Temperature' -and $value -gt 0 -and $value -lt 150) {
            $temperatures += [pscustomobject]@{
                name     = $label
                hardware = $parent
                value    = [math]::Round($value, 1)
            }
            $source = $ns.Split('\')[-1]
        } elseif ($s.SensorType -eq 'Fan' -and $value -gt 0) {
            $fans += [pscustomobject]@{
                name     = $label
                hardware = $parent
                rpm      = [math]::Round($value, 0)
            }
            $source = $ns.Split('\')[-1]
        }
    }
}

if ($temperatures.Count -eq 0) {
    $zones = Safe { Get-CimInstance -Namespace 'root\wmi' -ClassName MSAcpi_ThermalZoneTemperature }
    $index = 0
    foreach ($z in @($zones)) {
        $raw = Num $z.CurrentTemperature
        if (-not $raw -or $raw -le 0) { continue }
        $celsius = ($raw / 10) - 273.15
        if ($celsius -lt 5 -or $celsius -gt 150) { continue }
        $index++
        $temperatures += [pscustomobject]@{
            name     = "Thermal zone $index"
            hardware = Str $z.InstanceName
            value    = [math]::Round($celsius, 1)
        }
        $source = 'ACPI'
    }
}

$gpu = @()

$smi = Safe { Get-Command nvidia-smi -ErrorAction SilentlyContinue }
if (-not $smi) {
    $candidate = Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'
    if (Test-Path $candidate) { $smi = $candidate } else { $smi = $null }
} else {
    $smi = $smi.Source
}

if ($smi) {
    $query = 'name,utilization.gpu,utilization.memory,temperature.gpu,memory.used,memory.total,fan.speed,power.draw,clocks.current.graphics'
    $rows = Safe { & $smi "--query-gpu=$query" '--format=csv,noheader,nounits' 2>$null }
    foreach ($row in @($rows)) {
        $parts = ([string]$row).Split(',')
        if ($parts.Count -lt 6) { continue }
        $gpu += [pscustomobject]@{
            name        = Str $parts[0]
            utilization = Num $parts[1]
            memoryLoad  = Num $parts[2]
            temperature = Num $parts[3]
            memoryUsed  = Num $parts[4]
            memoryTotal = Num $parts[5]
            fan         = Num $parts[6]
            power       = Num $parts[7]
            clock       = Num $parts[8]
            source      = 'nvidia-smi'
        }
    }
}

if ($gpu.Count -eq 0) {
    $counters = Safe {
        (Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction Stop).CounterSamples
    }
    if ($counters) {
        $total = 0
        foreach ($c in @($counters)) {
            $v = Num $c.CookedValue
            if ($v) { $total += $v }
        }
        if ($total -gt 0) {
            $adapter = Safe { Get-CimInstance -ClassName Win32_VideoController | Select-Object -First 1 }
            $used = Safe {
                $samples = (Get-Counter '\GPU Process Memory(*)\Dedicated Usage' -ErrorAction Stop).CounterSamples
                ($samples | Measure-Object -Property CookedValue -Sum).Sum
            }
            $gpu += [pscustomobject]@{
                name        = Str $adapter.Name
                utilization = [math]::Round([math]::Min($total, 100), 1)
                memoryLoad  = $null
                temperature = $null
                memoryUsed  = Num $used
                memoryTotal = $null
                fan         = $null
                power       = $null
                clock       = $null
                source      = 'perfcounter'
            }
        }
    }
}

$storage = @()
foreach ($d in @(Safe { Get-CimInstance -Namespace 'root\Microsoft\Windows\Storage' -ClassName MSFT_PhysicalDisk })) {
    $media = switch ([int]$d.MediaType) {
        3 { 'HDD' }
        4 { 'SSD' }
        5 { 'SCM' }
        default { $null }
    }
    $bus = switch ([int]$d.BusType) {
        1 { 'SCSI' }
        3 { 'ATA' }
        7 { 'USB' }
        8 { 'RAID' }
        11 { 'SATA' }
        17 { 'NVMe' }
        default { $null }
    }
    $health = switch ([int]$d.HealthStatus) {
        0 { 'healthy' }
        1 { 'warning' }
        2 { 'unhealthy' }
        default { 'unknown' }
    }

    $rc = Safe { $d | Get-StorageReliabilityCounter }

    $storage += [pscustomobject]@{
        name          = Str $d.FriendlyName
        model         = Str $d.Model
        serial        = Str $d.SerialNumber
        firmware      = Str $d.FirmwareVersion
        mediaType     = $media
        busType       = $bus
        size          = Num $d.Size
        health        = $health
        spindleSpeed  = Num $d.SpindleSpeed
        temperature   = Num $rc.Temperature
        temperatureMax = Num $rc.TemperatureMax
        powerOnHours  = Num $rc.PowerOnHours
        startStops    = Num $rc.StartStopCycleCount
        wear          = Num $rc.Wear
        readErrors    = Num $rc.ReadErrorsTotal
        writeErrors   = Num $rc.WriteErrorsTotal
        reliability   = [bool]($null -ne $rc)
    }
}

[pscustomobject]@{
    admin        = $isAdmin
    source       = $source
    temperatures = @($temperatures)
    fans         = @($fans)
    gpu          = @($gpu)
    storage      = @($storage)
} | ConvertTo-Json -Depth 6 -Compress
