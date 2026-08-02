export type OsInfo = {
  name: string;
  version: string;
  longVersion: string;
  kernel: string;
  hostname: string;
  uptime: number;
  bootTime: number;
  distributionId: string;
  edition?: string | null;
  build?: string | null;
  displayVersion?: string | null;
  installDate?: string | null;
  registeredUser?: string | null;
  organization?: string | null;
  productId?: string | null;
  systemDrive?: string | null;
  windowsDir?: string | null;
  locale?: string | null;
  timeZone?: string | null;
  osArch?: string | null;
};

export type MachineInfo = {
  manufacturer?: string | null;
  model?: string | null;
  systemType?: string | null;
  domain?: string | null;
  user?: string | null;
};

export type CpuInfo = {
  brand: string;
  vendor: string;
  arch: string;
  physicalCores?: number | null;
  logicalCores: number;
  frequencyMhz: number;
  maxClockMhz?: number | null;
  socket?: string | null;
  l2CacheKb?: number | null;
  l3CacheKb?: number | null;
  virtualization?: boolean | null;
  usage: number;
  perCore: number[];
};

export type MemoryInfo = {
  total: number;
  used: number;
  available: number;
  totalSwap: number;
  usedSwap: number;
};

export type MemoryModule = {
  slot?: string | null;
  bank?: string | null;
  capacity: number;
  speed?: number | null;
  ratedSpeed?: number | null;
  manufacturer?: string | null;
  partNumber?: string | null;
  memoryType?: number | null;
  formFactor?: number | null;
  voltage?: number | null;
};

export type DiskInfo = {
  name: string;
  mountPoint: string;
  fileSystem: string;
  kind: string;
  total: number;
  available: number;
  removable: boolean;
};

export type GpuInfo = {
  name: string;
  vendor?: string | null;
  memory?: number | null;
  driver?: string | null;
  driverDate?: string | null;
  resolution?: string | null;
  refresh?: number | null;
  processor?: string | null;
  status?: string | null;
};

export type MonitorInfo = {
  name?: string | null;
  manufacturer?: string | null;
  year?: number | null;
};

export type NetworkInfo = {
  name: string;
  received: number;
  transmitted: number;
};

export type BoardInfo = {
  manufacturer?: string | null;
  product?: string | null;
  version?: string | null;
  biosVendor?: string | null;
  biosVersion?: string | null;
  biosDate?: string | null;
  secureBoot?: boolean | null;
};

export type SystemInfo = {
  os: OsInfo;
  machine: MachineInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  memoryModules: MemoryModule[];
  disks: DiskInfo[];
  gpus: GpuInfo[];
  monitors: MonitorInfo[];
  networks: NetworkInfo[];
  board?: BoardInfo | null;
  probeError?: string | null;
};

export type ProcessInfo = {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
};

export type NetworkRate = {
  name: string;
  rx: number;
  tx: number;
  received: number;
  transmitted: number;
};

export type LiveStats = {
  cpuUsage: number;
  perCore: number[];
  memoryUsed: number;
  swapUsed: number;
  uptime: number;
  processCount: number;
  processes: ProcessInfo[];
  networkRates: NetworkRate[];
  rxRate: number;
  txRate: number;
};

export type SensorReading = {
  name: string;
  hardware?: string | null;
  value: number;
};

export type FanReading = {
  name: string;
  hardware?: string | null;
  rpm: number;
};

export type GpuLive = {
  name?: string | null;
  utilization?: number | null;
  memoryLoad?: number | null;
  temperature?: number | null;
  memoryUsed?: number | null;
  memoryTotal?: number | null;
  fan?: number | null;
  power?: number | null;
  clock?: number | null;
  source?: string | null;
};

export type StorageHealth = {
  name?: string | null;
  model?: string | null;
  serial?: string | null;
  firmware?: string | null;
  mediaType?: string | null;
  busType?: string | null;
  size?: number | null;
  health?: "healthy" | "warning" | "unhealthy" | "unknown" | null;
  spindleSpeed?: number | null;
  temperature?: number | null;
  temperatureMax?: number | null;
  powerOnHours?: number | null;
  startStops?: number | null;
  wear?: number | null;
  readErrors?: number | null;
  writeErrors?: number | null;
  reliability?: boolean | null;
};

export type Sensors = {
  available: boolean;
  admin: boolean;
  source?: string | null;
  temperatures: SensorReading[];
  fans: FanReading[];
  gpu: GpuLive[];
  storage: StorageHealth[];
  error?: string | null;
};
