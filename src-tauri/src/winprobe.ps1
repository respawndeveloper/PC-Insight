$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

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
    try { return [uint64]$value } catch { return $null }
}

$os   = Safe { Get-CimInstance -ClassName Win32_OperatingSystem }
$cs   = Safe { Get-CimInstance -ClassName Win32_ComputerSystem }
$cpu  = Safe { Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1 }
$bb   = Safe { Get-CimInstance -ClassName Win32_BaseBoard | Select-Object -First 1 }
$bios = Safe { Get-CimInstance -ClassName Win32_BIOS | Select-Object -First 1 }
$cv   = Safe { Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' }

$l2 = Num $cpu.L2CacheSize
$l3 = Num $cpu.L3CacheSize

if ((-not $l2) -or (-not $l3)) {
    $caches = Safe { Get-CimInstance -ClassName Win32_CacheMemory }
    foreach ($c in @($caches)) {
        $size = Num $c.MaxCacheSize
        if (-not $size) { continue }
        if ((-not $l2) -and $c.Level -eq 4) { $l2 = $size }
        if ((-not $l3) -and $c.Level -eq 5) { $l3 = $size }
    }
}

if ((-not $l2) -or (-not $l3)) {
    $cpuKey = Safe { Get-ItemProperty -Path 'HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0' }
    if (-not $l2) { $l2 = Num $cpuKey.'SecondLevelDataCache' }
    if (-not $l3) { $l3 = Num $cpuKey.'ThirdLevelCache' }
}

$vram = @{}
$classPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
$classKeys = Safe { Get-ChildItem -Path $classPath }

foreach ($key in @($classKeys)) {
    $p = Safe { Get-ItemProperty -Path $key.PSPath }
    if (-not $p) { continue }
    $desc = Str $p.DriverDesc
    if (-not $desc) { continue }

    $size = $p.'HardwareInformation.qwMemorySize'
    if ($null -eq $size) { $size = $p.'HardwareInformation.MemorySize' }
    if ($size -is [byte[]]) {
        $buffer = New-Object byte[] 8
        [Array]::Copy($size, $buffer, [Math]::Min(8, $size.Length))
        $size = [System.BitConverter]::ToUInt64($buffer, 0)
    }

    $value = Num $size
    if ($value -and $value -gt 0) { $vram[$desc] = $value }
}

$gpus = @()
$controllers = Safe { Get-CimInstance -ClassName Win32_VideoController }

foreach ($g in @($controllers)) {
    $name = Str $g.Name
    if (-not $name) { $name = Str $g.Description }
    if (-not $name) { continue }

    $mem = $null
    if ($vram.ContainsKey($name)) { $mem = $vram[$name] }
    if (-not $mem) {
        foreach ($k in $vram.Keys) {
            if ($name -like "*$k*" -or $k -like "*$name*") { $mem = $vram[$k]; break }
        }
    }
    if (-not $mem) {
        $adapter = Num $g.AdapterRAM
        if ($adapter -and $adapter -gt 0) { $mem = $adapter }
    }

    $res = $null
    if ($g.CurrentHorizontalResolution -gt 0) {
        $res = "$($g.CurrentHorizontalResolution) x $($g.CurrentVerticalResolution)"
    }

    $dd = $null
    if ($g.DriverDate) { $dd = Safe { $g.DriverDate.ToString('yyyy-MM-dd') } }

    $gpus += [pscustomobject]@{
        name       = $name
        vendor     = Str $g.AdapterCompatibility
        memory     = $mem
        driver     = Str $g.DriverVersion
        driverDate = $dd
        resolution = $res
        refresh    = Num $g.CurrentRefreshRate
        processor  = Str $g.VideoProcessor
        status     = Str $g.Status
    }
}

if ($gpus.Count -eq 0) {
    foreach ($k in $vram.Keys) {
        $gpus += [pscustomobject]@{
            name       = $k
            vendor     = $null
            memory     = $vram[$k]
            driver     = $null
            driverDate = $null
            resolution = $null
            refresh    = $null
            processor  = $null
            status     = $null
        }
    }
}

$modules = @()
foreach ($m in @(Safe { Get-CimInstance -ClassName Win32_PhysicalMemory })) {
    $capacity = Num $m.Capacity
    if (-not $capacity) { continue }
    $modules += [pscustomobject]@{
        slot         = Str $m.DeviceLocator
        bank         = Str $m.BankLabel
        capacity     = $capacity
        speed        = Num $m.ConfiguredClockSpeed
        ratedSpeed   = Num $m.Speed
        manufacturer = Str $m.Manufacturer
        partNumber   = Str $m.PartNumber
        memoryType   = Num $m.SMBIOSMemoryType
        formFactor   = Num $m.FormFactor
        voltage      = Num $m.ConfiguredVoltage
    }
}

$monitors = @()
foreach ($mon in @(Safe { Get-CimInstance -Namespace 'root\wmi' -ClassName WmiMonitorID })) {
    $mname = Safe { -join ($mon.UserFriendlyName | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ }) }
    $mmanu = Safe { -join ($mon.ManufacturerName | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ }) }
    if (-not (Str $mname) -and -not (Str $mmanu)) { continue }
    $monitors += [pscustomobject]@{
        name         = Str $mname
        manufacturer = Str $mmanu
        year         = Num $mon.YearOfManufacture
    }
}

$installDate = $null
if ($os.InstallDate) { $installDate = Safe { $os.InstallDate.ToString('o') } }
$biosDate = $null
if ($bios.ReleaseDate) { $biosDate = Safe { $bios.ReleaseDate.ToString('yyyy-MM-dd') } }

$secureBoot = $null
try { $secureBoot = [bool](Confirm-SecureBootUEFI) } catch { $secureBoot = $null }

$virtualization = $null
if ($null -ne $cpu.VirtualizationFirmwareEnabled) {
    $virtualization = [bool]$cpu.VirtualizationFirmwareEnabled
} elseif ($null -ne $cs.HypervisorPresent) {
    $virtualization = [bool]$cs.HypervisorPresent
}

$payload = [pscustomobject]@{
    os = [pscustomobject]@{
        caption        = Str $os.Caption
        version        = Str $os.Version
        build          = Str $os.BuildNumber
        ubr            = Num $cv.UBR
        displayVersion = Str $cv.DisplayVersion
        arch           = Str $os.OSArchitecture
        installDate    = $installDate
        registeredUser = Str $os.RegisteredUser
        organization   = Str $os.Organization
        productId      = Str $cv.ProductId
        systemDrive    = Str $os.SystemDrive
        windowsDir     = Str $os.WindowsDirectory
        locale         = Safe { (Get-Culture).Name }
        timeZone       = Safe { (Get-TimeZone).DisplayName }
    }
    machine = [pscustomobject]@{
        manufacturer = Str $cs.Manufacturer
        model        = Str $cs.Model
        systemType   = Str $cs.SystemType
        domain       = Str $cs.Domain
        user         = Str $cs.UserName
    }
    cpu = [pscustomobject]@{
        name           = Str $cpu.Name
        socket         = Str $cpu.SocketDesignation
        maxClock       = Num $cpu.MaxClockSpeed
        l2             = $l2
        l3             = $l3
        virtualization = $virtualization
        cores          = Num $cpu.NumberOfCores
        threads        = Num $cpu.NumberOfLogicalProcessors
    }
    board = [pscustomobject]@{
        manufacturer = Str $bb.Manufacturer
        product      = Str $bb.Product
        version      = Str $bb.Version
        biosVendor   = Str $bios.Manufacturer
        biosVersion  = Str $bios.SMBIOSBIOSVersion
        biosDate     = $biosDate
        secureBoot   = $secureBoot
    }
    gpus          = @($gpus)
    memoryModules = @($modules)
    monitors      = @($monitors)
}

$payload | ConvertTo-Json -Depth 6 -Compress
