import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Icon } from "./components/Icon";
import type { IconName } from "./components/Icon";
import { Titlebar } from "./components/Titlebar";
import { createTranslator, detectLang } from "./lib/i18n";
import type { Lang, TranslationKey } from "./lib/i18n";
import type { LiveStats, Sensors, SystemInfo } from "./lib/types";
import {
  daysSince,
  formatBytes,
  formatCount,
  formatDate,
  formatHours,
  formatKb,
  formatMhz,
  formatPercent,
  formatRate,
  formatRpm,
  formatTemp,
  formatUnixDate,
  formatUptime,
  formatWatts,
  formFactorName,
  loadTone,
  memoryTypeName,
  setFormatLang,
  tempTone,
  textOr,
} from "./lib/format";

type SectionId =
  | "overview"
  | "cpu"
  | "memory"
  | "gpu"
  | "disk"
  | "sensors"
  | "network"
  | "processes"
  | "system";

const SECTIONS: Array<{ id: SectionId; icon: IconName }> = [
  { id: "overview", icon: "gauge" },
  { id: "cpu", icon: "cpu" },
  { id: "memory", icon: "memory" },
  { id: "gpu", icon: "gpu" },
  { id: "disk", icon: "disk" },
  { id: "sensors", icon: "thermometer" },
  { id: "network", icon: "network" },
  { id: "processes", icon: "activity" },
  { id: "system", icon: "info" },
];

const SENSOR_GROUPS: Array<{ id: string; test: RegExp }> = [
  { id: "GPU", test: /gpu|graphics|geforce|radeon|nvidia|quadro|\barc\b|iris/i },
  { id: "CPU", test: /cpu|processor|package|tctl|tdie|ryzen|core\s*#?\d|core\s*(max|avg)/i },
  { id: "VRM", test: /vrm|vcore|vddc|vsoc|mosfet|\bmos\b|vr\s?m/i },
  { id: "Chipset", test: /chipset|pch|\bsb\b|southbridge|promontory/i },
  { id: "SSD", test: /ssd|nvme|\bm\.?2\b/i },
  { id: "HDD", test: /hdd|hard\s*disk|\bdrive\b|storage|st\d{4}|wdc|seagate|toshiba/i },
  { id: "RAM", test: /memory|dimm|dram|\bram\b/i },
  { id: "Board", test: /motherboard|mainboard|\bboard\b|systin|system\s*temp|nuvoton|ite\s*it/i },
  { id: "Network", test: /wi-?fi|wlan|ethernet|\blan\b|\bnic\b/i },
  { id: "Battery", test: /battery|akku/i },
  { id: "Water", test: /water|coolant|pump|aio|liquid/i },
  { id: "Case", test: /case|chassis|ambient|exhaust|intake|front|rear|top\s*fan/i },
];

function classify(name: string, hardware?: string | null): string | null {
  const haystack = `${hardware ?? ""} ${name}`;
  for (const group of SENSOR_GROUPS) {
    if (group.test.test(haystack)) return group.id;
  }
  return null;
}

const HISTORY = 48;
const LIVE_INTERVAL = 1500;
const SENSOR_INTERVAL = 5000;

function Bar({ percent, tone }: { percent: number; tone?: string }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className="bar">
      <div className={`bar-fill ${tone ?? ""}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function Ring({ percent, tone }: { percent: number; tone?: string }) {
  const value = Math.max(0, Math.min(100, percent));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ring">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle className="ring-track" cx="46" cy="46" r={radius} fill="none" strokeWidth={7} />
        <circle
          className={`ring-value ${tone ?? ""}`}
          cx="46"
          cy="46"
          r={radius}
          fill="none"
          strokeWidth={7}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <div className="ring-center">{Math.round(value)}%</div>
    </div>
  );
}

function Spark({ points }: { points: number[] }) {
  const width = 320;
  const height = 62;
  const data = points.length ? points : [0];
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const coords = data.map((value, index) => {
    const x = index * step;
    const y = height - (Math.max(0, Math.min(100, value)) / 100) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <line className="spark-grid" x1="0" y1={height / 2} x2={width} y2={height / 2} />
      <polygon
        className="spark-area"
        points={`0,${height} ${coords.join(" ")} ${width},${height}`}
      />
      <polyline className="spark-line" points={coords.join(" ")} />
    </svg>
  );
}

function Card({
  icon,
  title,
  sub,
  right,
  children,
  hoverable = true,
}: {
  icon?: IconName;
  title?: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  hoverable?: boolean;
}) {
  return (
    <section className={`card${hoverable ? " hoverable" : ""}`}>
      {title ? (
        <div className="card-head">
          <div className="card-head-left">
            {icon ? (
              <span className="head-icon">
                <Icon name={icon} size={17} />
              </span>
            ) : null}
            <div style={{ minWidth: 0 }}>
              <h3>{title}</h3>
              {sub ? <div className="sub">{sub}</div> : null}
            </div>
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  meta,
  percent,
  tone,
}: {
  label: string;
  value: string;
  meta?: string;
  percent?: number;
  tone?: string;
}) {
  return (
    <section className="card hoverable">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {meta ? <div className="stat-meta">{meta}</div> : null}
      {percent !== undefined ? <Bar percent={percent} tone={tone} /> : null}
    </section>
  );
}

function Spec({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="spec-row">
      <span className="spec-key">{label}</span>
      <span className="spec-val">{value}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Icon name="info" size={19} />
      {text}
    </div>
  );
}

function Gauge({
  name,
  group,
  sub,
  value,
  percent,
  tone,
}: {
  name: string;
  group?: string;
  sub?: string | null;
  value: string;
  percent?: number;
  tone?: string;
}) {
  return (
    <div className="gauge">
      <div className="gauge-top">
        <div style={{ minWidth: 0 }}>
          <div className="gauge-name">
            {group ? <span className="gauge-tag">{group}</span> : null}
            {name}
          </div>
          {sub ? <div className="gauge-sub">{sub}</div> : null}
        </div>
        <div className={`gauge-value ${tone ?? ""}`}>{value}</div>
      </div>
      {percent !== undefined ? <Bar percent={percent} tone={tone} /> : null}
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("pc-insight-theme");
    return stored === "light" || stored === "dark" ? stored : "dark";
  });

  const [section, setSection] = useState<SectionId>("overview");
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [sensors, setSensors] = useState<Sensors | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; path?: string } | null>(null);

  const cpuHistory = useRef<number[]>([]);
  const memHistory = useRef<number[]>([]);
  const netHistory = useRef<number[]>([]);
  const [tick, setTick] = useState(0);

  setFormatLang(lang);
  const t = useMemo(() => createTranslator(lang), [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pc-insight-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("pc-insight-lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const loadInfo = useCallback(async () => {
    try {
      const result = await invoke<SystemInfo>("get_system_info");
      setInfo(result);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const loadSensors = useCallback(async () => {
    try {
      const result = await invoke<Sensors>("get_sensors");
      setSensors(result);
    } catch {
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    void loadSensors();
  }, [loadInfo, loadSensors]);

  useEffect(() => {
    let disposed = false;

    const poll = async () => {
      try {
        const stats = await invoke<LiveStats>("get_live_stats");
        if (disposed) return;
        setLive(stats);

        cpuHistory.current = [...cpuHistory.current, stats.cpuUsage].slice(-HISTORY);
        netHistory.current = [...netHistory.current, stats.rxRate + stats.txRate].slice(-HISTORY);
        setTick((value) => value + 1);
      } catch {
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), LIVE_INTERVAL);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void loadSensors(), SENSOR_INTERVAL);
    return () => window.clearInterval(timer);
  }, [loadSensors]);

  useEffect(() => {
    if (!info || !live) return;
    const percent = info.memory.total ? (live.memoryUsed / info.memory.total) * 100 : 0;
    memHistory.current = [...memHistory.current, percent].slice(-HISTORY);
  }, [info, live]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const memoryUsed = live?.memoryUsed ?? info?.memory.used ?? 0;
  const memoryTotal = info?.memory.total ?? 0;
  const memoryPercent = memoryTotal ? (memoryUsed / memoryTotal) * 100 : 0;
  const cpuUsage = live?.cpuUsage ?? info?.cpu.usage ?? 0;
  const perCore = live?.perCore.length ? live.perCore : (info?.cpu.perCore ?? []);

  const storage = useMemo(() => {
    const disks = info?.disks ?? [];
    const total = disks.reduce((sum, disk) => sum + disk.total, 0);
    const free = disks.reduce((sum, disk) => sum + disk.available, 0);
    return { total, free, used: total - free, percent: total ? ((total - free) / total) * 100 : 0 };
  }, [info]);

  const temps = useMemo(
    () =>
      (sensors?.temperatures ?? [])
        .map((item) => ({ ...item, group: classify(item.name, item.hardware) }))
        .filter((item): item is typeof item & { group: string } => item.group !== null)
        .sort((a, b) => b.value - a.value),
    [sensors],
  );

  const fans = useMemo(
    () =>
      (sensors?.fans ?? [])
        .map((item) => ({ ...item, group: classify(item.name, item.hardware) }))
        .filter(
          (item): item is typeof item & { group: string } =>
            item.group !== null && item.rpm > 0,
        )
        .sort((a, b) => b.rpm - a.rpm),
    [sensors],
  );

  const hottest = useMemo(() => (temps.length ? temps[0] : null), [temps]);

  const gpuLive = sensors?.gpu?.[0] ?? null;

  const buildReport = useCallback(() => {
    if (!info) return "";
    const lines: string[] = [];
    const add = (key: string, value: string) => lines.push(`${key}: ${value}`);

    lines.push(`${t("appName")} — ${t("report.title")}`);
    add(t("report.generated"), new Date().toLocaleString(lang === "ru" ? "ru-RU" : "en-US"));
    lines.push("");

    lines.push(`[${t("sys.windows")}]`);
    add(t("sys.edition"), textOr(info.os.edition ?? info.os.longVersion));
    add(t("sys.version"), textOr(info.os.displayVersion ?? info.os.version));
    add(t("sys.build"), textOr(info.os.build));
    add(t("sys.installed"), formatDate(info.os.installDate));
    add(t("sys.hostname"), info.os.hostname);
    lines.push("");

    lines.push(`[${t("nav.cpu")}]`);
    add(t("cpu.model"), info.cpu.brand);
    add(t("cpu.cores"), `${info.cpu.physicalCores ?? "—"} / ${info.cpu.logicalCores}`);
    add(t("cpu.socket"), textOr(info.cpu.socket));
    add(t("cpu.maxClock"), formatMhz(info.cpu.maxClockMhz));
    add(t("cpu.l2"), formatKb(info.cpu.l2CacheKb));
    add(t("cpu.l3"), formatKb(info.cpu.l3CacheKb));
    lines.push("");

    lines.push(`[${t("nav.memory")}]`);
    add(t("mem.total"), formatBytes(info.memory.total));
    info.memoryModules.forEach((module, index) => {
      add(
        `${t("mem.slot")} ${textOr(module.slot, String(index + 1))}`,
        `${formatBytes(module.capacity)} ${memoryTypeName(module.memoryType) ?? ""} ${
          module.speed ? `${module.speed} MHz` : ""
        }`.trim(),
      );
    });
    lines.push("");

    lines.push(`[${t("nav.gpu")}]`);
    info.gpus.forEach((gpu) => {
      add(gpu.name, `${gpu.memory ? formatBytes(gpu.memory) : "—"} · ${textOr(gpu.driver)}`);
    });
    lines.push("");

    lines.push(`[${t("nav.disk")}]`);
    info.disks.forEach((disk) => {
      add(
        `${textOr(disk.name, disk.mountPoint)} (${disk.mountPoint})`,
        `${formatBytes(disk.total - disk.available)} / ${formatBytes(disk.total)}`,
      );
    });
    (sensors?.storage ?? []).forEach((disk) => {
      add(
        textOr(disk.name ?? disk.model),
        [
          disk.mediaType,
          disk.busType,
          disk.health,
          disk.powerOnHours ? `${Math.round(disk.powerOnHours)} h` : null,
          disk.wear !== null && disk.wear !== undefined ? `wear ${disk.wear}%` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    });
    lines.push("");

    if (temps.length) {
      lines.push(`[${t("sensors.temps")}]`);
      temps.forEach((item) => {
        add(`${item.group} · ${item.name}`, formatTemp(item.value));
      });
      lines.push("");
    }

    if (fans.length) {
      lines.push(`[${t("sensors.fans")}]`);
      fans.forEach((item) => {
        add(`${item.group} · ${item.name}`, formatRpm(item.rpm));
      });
      lines.push("");
    }

    lines.push(`[${t("sys.board")}]`);
    add(t("sys.manufacturer"), textOr(info.board?.manufacturer));
    add(t("sys.boardModel"), textOr(info.board?.product));
    add(t("sys.biosVersion"), textOr(info.board?.biosVersion));
    add(t("sys.biosDate"), formatDate(info.board?.biosDate));

    return lines.join("\n");
  }, [fans, info, lang, sensors, t, temps]);

  const exportReport = useCallback(async () => {
    if (!info) return;
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await invoke<string>("save_report", {
        content: buildReport(),
        filename: `PC-Insight-${stamp}.txt`,
      });
      setToast({ text: t("report.saved"), path });
    } catch (cause) {
      setToast({ text: `${t("report.failed")}: ${String(cause)}` });
    } finally {
      setExporting(false);
    }
  }, [buildReport, info, t]);

  const elevate = useCallback(async () => {
    try {
      await invoke("relaunch_as_admin");
    } catch (cause) {
      setToast({ text: String(cause) });
    }
  }, []);

  const navCount = (id: SectionId): string | null => {
    if (!info) return null;
    switch (id) {
      case "cpu":
        return String(info.cpu.logicalCores);
      case "memory":
        return info.memoryModules.length ? String(info.memoryModules.length) : null;
      case "gpu":
        return info.gpus.length ? String(info.gpus.length) : null;
      case "disk":
        return String(info.disks.length);
      case "sensors":
        return temps.length ? String(temps.length) : null;
      case "network":
        return String(info.networks.length);
      case "processes":
        return live ? formatCount(live.processCount) : null;
      default:
        return null;
    }
  };

  const sectionKey = (id: SectionId) => `nav.${id}` as TranslationKey;
  const subKey = (id: SectionId) => `sub.${id}` as TranslationKey;

  if (error && !info) {
    return (
      <div className="window">
        <Titlebar
          crumb={t("state.error")}
          theme={theme}
          lang={lang}
          live={false}
          exporting={false}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onChangeLang={setLang}
          onExport={() => undefined}
          t={t}
        />
        <div className="state">
          <Icon name="alert" size={26} />
          <div>{t("state.error")}</div>
          <button type="button" className="ghost-button" onClick={() => void loadInfo()}>
            <Icon name="refresh" size={15} />
            {t("state.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="window">
        <Titlebar
          crumb={t("state.loading")}
          theme={theme}
          lang={lang}
          live={false}
          exporting={false}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onChangeLang={setLang}
          onExport={() => undefined}
          t={t}
        />
        <div className="state">
          <div className="dot" />
          {t("state.loading")}
        </div>
      </div>
    );
  }

  const probeNotice = (key: TranslationKey) =>
    info.probeError ? (
      <div className="notice warn">
        <Icon name="alert" size={17} />
        <div className="notice-body">
          {t(key)}
          <code>{info.probeError}</code>
        </div>
      </div>
    ) : null;

  const adminNotice =
    sensors && !sensors.admin ? (
      <div className="notice accent">
        <Icon name="shieldCheck" size={17} />
        <div className="notice-body">
          <div className="notice-title">{t("admin.title")}</div>
          {t("admin.text")}
        </div>
        <button type="button" className="notice-action" onClick={() => void elevate()}>
          <Icon name="bolt" size={15} />
          {t("admin.button")}
        </button>
      </div>
    ) : null;

  return (
    <div className="window">
      <Titlebar
        crumb={t(sectionKey(section))}
        theme={theme}
        lang={lang}
        live={Boolean(live)}
        exporting={exporting}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onChangeLang={setLang}
        onExport={() => void exportReport()}
        t={t}
      />

      <div className="shell">
        <aside className="sidebar">
          <nav className="nav">
            <div className="nav-label">{t("nav.sections")}</div>
            {SECTIONS.map((item) => {
              const count = navCount(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item${section === item.id ? " is-active" : ""}`}
                  onClick={() => setSection(item.id)}
                >
                  <Icon name={item.icon} size={16} />
                  <span>{t(sectionKey(item.id))}</span>
                  {count ? <span className="nav-count">{count}</span> : null}
                </button>
              );
            })}
          </nav>

          <div className="mini">
            <div className="mini-row">
              <div className="mini-top">
                <span>{t("stat.cpuLoad")}</span>
                <b>{formatPercent(cpuUsage)}</b>
              </div>
              <Bar percent={cpuUsage} tone={loadTone(cpuUsage)} />
            </div>
            <div className="mini-row">
              <div className="mini-top">
                <span>{t("stat.memory")}</span>
                <b>{formatPercent(memoryPercent)}</b>
              </div>
              <Bar percent={memoryPercent} tone={loadTone(memoryPercent)} />
            </div>
            {hottest ? (
              <div className="mini-row">
                <div className="mini-top">
                  <span>{t("stat.temperature")}</span>
                  <b>{formatTemp(hottest.value)}</b>
                </div>
                <Bar
                  percent={Math.min(100, (hottest.value / 100) * 100)}
                  tone={tempTone(hottest.value)}
                />
              </div>
            ) : null}
            <div className="mini-foot">
              <span>v1.3.0</span>
              {sensors?.admin ? (
                <span className="pill green">
                  <Icon name="shieldCheck" size={12} />
                  admin
                </span>
              ) : (
                <span>{formatUptime(live?.uptime ?? info.os.uptime)}</span>
              )}
            </div>
          </div>
        </aside>

        <main className="main">
          <div className="main-inner">
            <div className="page-head">
              <h1>{t(sectionKey(section))}</h1>
              <p>{t(subKey(section))}</p>
            </div>

            {}
            {section === "overview" ? (
              <div className="stack">
                <div className="hero">
                  <div className="hero-mark">
                    <img src="/logo.png" alt={t("appName")} draggable={false} />
                  </div>
                  <div className="hero-body">
                    <div className="hero-title">{info.os.hostname}</div>
                    <div className="hero-sub">
                      {textOr(info.os.edition ?? info.os.longVersion)}
                      {info.os.displayVersion ? ` · ${info.os.displayVersion}` : ""}
                      {info.os.osArch ? ` · ${info.os.osArch}` : ""}
                    </div>
                    <div className="chips">
                      <span className="chip">
                        <Icon name="cpu" size={13} />
                        {info.cpu.brand}
                      </span>
                      <span className="chip">
                        <Icon name="memory" size={13} />
                        {formatBytes(info.memory.total)}
                      </span>
                      {info.gpus[0] ? (
                        <span className="chip">
                          <Icon name="gpu" size={13} />
                          {info.gpus[0].name}
                        </span>
                      ) : null}
                      <span className="chip">
                        <Icon name="clock" size={13} />
                        {formatUptime(live?.uptime ?? info.os.uptime)}
                      </span>
                    </div>
                  </div>
                </div>

                {adminNotice}

                <div className="grid cols-4">
                  <section className="card hoverable ring-card">
                    <Ring percent={cpuUsage} tone={loadTone(cpuUsage)} />
                    <div>
                      <div className="stat-label">{t("stat.cpuLoad")}</div>
                      <div className="stat-meta">
                        {info.cpu.logicalCores} {t("stat.threads")}
                      </div>
                      <div className="stat-meta">{formatMhz(info.cpu.frequencyMhz)}</div>
                    </div>
                  </section>

                  <StatCard
                    label={t("stat.memory")}
                    value={formatBytes(memoryUsed)}
                    meta={`${t("stat.of")} ${formatBytes(memoryTotal)}`}
                    percent={memoryPercent}
                    tone={loadTone(memoryPercent)}
                  />

                  <StatCard
                    label={t("stat.storage")}
                    value={formatBytes(storage.used)}
                    meta={`${t("stat.of")} ${formatBytes(storage.total)}`}
                    percent={storage.percent}
                    tone={loadTone(storage.percent)}
                  />

                  {gpuLive && gpuLive.utilization !== null && gpuLive.utilization !== undefined ? (
                    <section className="card hoverable ring-card">
                      <Ring
                        percent={gpuLive.utilization}
                        tone={loadTone(gpuLive.utilization)}
                      />
                      <div>
                        <div className="stat-label">{t("stat.gpuLoad")}</div>
                        <div className="stat-meta">{formatTemp(gpuLive.temperature)}</div>
                        <div className="stat-meta">
                          {gpuLive.memoryUsed ? formatBytes(gpuLive.memoryUsed * 1024 * 1024) : "—"}
                        </div>
                      </div>
                    </section>
                  ) : (
                    <StatCard
                      label={t("stat.uptime")}
                      value={formatUptime(live?.uptime ?? info.os.uptime)}
                      meta={formatUnixDate(info.os.bootTime)}
                    />
                  )}
                </div>

                <div className="grid cols-2">
                  <Card icon="pulse" title={t("cpu.history")} sub={t("stat.cpuLoad")}>
                    <div className="spark-card">
                      <div className="spark-head">
                        <b>{formatPercent(cpuUsage, 1)}</b>
                        <span className="pill accent">{tick > 0 ? "live" : "—"}</span>
                      </div>
                      <Spark points={cpuHistory.current} />
                    </div>
                  </Card>

                  <Card icon="network" title={t("net.traffic")} sub={t("nav.network")}>
                    <div className="spark-card">
                      <div className="spark-head">
                        <b>{formatRate(live?.rxRate ?? 0)}</b>
                        <span className="pill">{formatRate(live?.txRate ?? 0)}</span>
                      </div>
                      <Spark
                        points={netHistory.current.map((value) => {
                          const peak = Math.max(...netHistory.current, 1);
                          return (value / peak) * 100;
                        })}
                      />
                    </div>
                  </Card>
                </div>

                {temps.length ? (
                  <Card
                    icon="thermometer"
                    title={t("sensors.temps")}
                    sub={`${t("sensors.source")}: ${textOr(sensors?.source)}`}
                  >
                    <div className="gauges">
                      {temps.slice(0, 8).map((item, index) => (
                        <Gauge
                          key={`${item.name}-${index}`}
                          name={item.name}
                          group={item.group}
                          sub={item.hardware}
                          value={formatTemp(item.value)}
                          percent={Math.min(100, item.value)}
                          tone={tempTone(item.value)}
                        />
                      ))}
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {}
            {section === "cpu" ? (
              <div className="stack">
                {probeNotice("probe.cpu")}

                <div className="grid cols-2">
                  <Card icon="cpu" title={info.cpu.brand} sub={textOr(info.cpu.vendor)}>
                    <Spec label={t("cpu.arch")} value={textOr(info.cpu.arch)} />
                    <Spec
                      label={t("cpu.cores")}
                      value={`${info.cpu.physicalCores ?? "—"} / ${info.cpu.logicalCores}`}
                    />
                    <Spec label={t("cpu.socket")} value={textOr(info.cpu.socket)} />
                    <Spec label={t("cpu.baseClock")} value={formatMhz(info.cpu.frequencyMhz)} />
                    <Spec label={t("cpu.maxClock")} value={formatMhz(info.cpu.maxClockMhz)} />
                    <Spec label={t("cpu.l2")} value={formatKb(info.cpu.l2CacheKb)} />
                    <Spec label={t("cpu.l3")} value={formatKb(info.cpu.l3CacheKb)} />
                    <Spec
                      label={t("cpu.virtualization")}
                      value={
                        info.cpu.virtualization === null || info.cpu.virtualization === undefined ? (
                          "—"
                        ) : (
                          <span className={`pill ${info.cpu.virtualization ? "green" : ""}`}>
                            {info.cpu.virtualization ? t("value.enabled") : t("value.disabled")}
                          </span>
                        )
                      }
                    />
                  </Card>

                  <div className="stack">
                    <section className="card hoverable ring-card">
                      <Ring percent={cpuUsage} tone={loadTone(cpuUsage)} />
                      <div>
                        <div className="stat-label">{t("stat.cpuLoad")}</div>
                        <div className="stat-meta">
                          {live ? formatCount(live.processCount) : "—"} {t("stat.processes").toLowerCase()}
                        </div>
                      </div>
                    </section>

                    <Card icon="pulse" title={t("cpu.history")}>
                      <Spark points={cpuHistory.current} />
                    </Card>
                  </div>
                </div>

                <Card icon="chip" title={t("cpu.perCore")} sub={`${perCore.length} ×`}>
                  <div className="cores">
                    {perCore.map((value, index) => (
                      <div className="core" key={index}>
                        <div className="core-top">
                          <span>
                            {t("cpu.core")} {index + 1}
                          </span>
                          <b>{formatPercent(value)}</b>
                        </div>
                        <Bar percent={value} tone={loadTone(value)} />
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}

            {}
            {section === "memory" ? (
              <div className="stack">
                <div className="grid cols-4">
                  <StatCard label={t("mem.total")} value={formatBytes(memoryTotal)} />
                  <StatCard
                    label={t("mem.used")}
                    value={formatBytes(memoryUsed)}
                    percent={memoryPercent}
                    tone={loadTone(memoryPercent)}
                  />
                  <StatCard
                    label={t("mem.available")}
                    value={formatBytes(Math.max(0, memoryTotal - memoryUsed))}
                  />
                  <StatCard
                    label={t("mem.swap")}
                    value={formatBytes(live?.swapUsed ?? info.memory.usedSwap)}
                    meta={`${t("stat.of")} ${formatBytes(info.memory.totalSwap)}`}
                  />
                </div>

                <Card icon="pulse" title={t("cpu.history")} sub={t("stat.memory")}>
                  <Spark points={memHistory.current} />
                </Card>

                <Card
                  icon="memory"
                  title={t("mem.modules")}
                  right={<span className="count">{info.memoryModules.length}</span>}
                >
                  {info.memoryModules.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("mem.slot")}</th>
                          <th>{t("mem.capacity")}</th>
                          <th>{t("mem.type")}</th>
                          <th className="num">{t("mem.speed")}</th>
                          <th>{t("mem.manufacturer")}</th>
                          <th>{t("mem.part")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.memoryModules.map((module, index) => (
                          <tr key={index}>
                            <td className="name">{textOr(module.slot, `#${index + 1}`)}</td>
                            <td>{formatBytes(module.capacity)}</td>
                            <td className="muted">
                              {[memoryTypeName(module.memoryType), formFactorName(module.formFactor)]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </td>
                            <td className="num">
                              {module.speed ? `${module.speed} MHz` : "—"}
                            </td>
                            <td className="muted">{textOr(module.manufacturer)}</td>
                            <td className="muted">{textOr(module.partNumber)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Empty text={t("mem.noModules")} />
                  )}
                </Card>
              </div>
            ) : null}

            {}
            {section === "gpu" ? (
              <div className="stack">
                {probeNotice("probe.gpu")}

                {gpuLive ? (
                  <div className="grid cols-4">
                    <section className="card hoverable ring-card">
                      <Ring
                        percent={gpuLive.utilization ?? 0}
                        tone={loadTone(gpuLive.utilization ?? 0)}
                      />
                      <div>
                        <div className="stat-label">{t("gpu.utilization")}</div>
                        <div className="stat-meta">{textOr(gpuLive.source)}</div>
                      </div>
                    </section>
                    <StatCard
                      label={t("stat.temperature")}
                      value={formatTemp(gpuLive.temperature)}
                      meta={gpuLive.fan ? `${t("gpu.fan")} ${formatPercent(gpuLive.fan)}` : undefined}
                      percent={gpuLive.temperature ? Math.min(100, gpuLive.temperature) : undefined}
                      tone={tempTone(gpuLive.temperature)}
                    />
                    <StatCard
                      label={t("gpu.memory")}
                      value={
                        gpuLive.memoryUsed ? formatBytes(gpuLive.memoryUsed * 1024 * 1024) : "—"
                      }
                      meta={
                        gpuLive.memoryTotal
                          ? `${t("stat.of")} ${formatBytes(gpuLive.memoryTotal * 1024 * 1024)}`
                          : undefined
                      }
                      percent={
                        gpuLive.memoryUsed && gpuLive.memoryTotal
                          ? (gpuLive.memoryUsed / gpuLive.memoryTotal) * 100
                          : undefined
                      }
                    />
                    <StatCard
                      label={t("gpu.power")}
                      value={formatWatts(gpuLive.power)}
                      meta={gpuLive.clock ? formatMhz(gpuLive.clock) : undefined}
                    />
                  </div>
                ) : (
                  <div className="notice">
                    <Icon name="info" size={17} />
                    <div className="notice-body">{t("gpu.noLive")}</div>
                  </div>
                )}

                <div>
                  <div className="section-title">
                    {t("gpu.adapters")}
                    <span className="count">{info.gpus.length}</span>
                  </div>
                </div>

                {info.gpus.length ? (
                  <div className="grid cols-2">
                    {info.gpus.map((gpu, index) => (
                      <Card
                        key={index}
                        icon="gpu"
                        title={gpu.name}
                        sub={textOr(gpu.vendor)}
                        right={
                          gpu.memory ? (
                            <span className="pill accent">{formatBytes(gpu.memory)}</span>
                          ) : null
                        }
                      >
                        <Spec label={t("gpu.processor")} value={textOr(gpu.processor)} />
                        <Spec label={t("gpu.driver")} value={textOr(gpu.driver)} />
                        <Spec label={t("gpu.driverDate")} value={formatDate(gpu.driverDate)} />
                        <Spec label={t("gpu.resolution")} value={textOr(gpu.resolution)} />
                        <Spec
                          label={t("gpu.refresh")}
                          value={gpu.refresh ? `${gpu.refresh} Hz` : "—"}
                        />
                        <Spec label={t("gpu.status")} value={textOr(gpu.status)} />
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Empty text={t("gpu.none")} />
                )}

                <Card
                  icon="monitor"
                  title={t("gpu.monitors")}
                  right={<span className="count">{info.monitors.length}</span>}
                >
                  {info.monitors.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("cpu.model")}</th>
                          <th>{t("mem.manufacturer")}</th>
                          <th className="num">{t("gpu.year")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.monitors.map((monitor, index) => (
                          <tr key={index}>
                            <td className="name">{textOr(monitor.name)}</td>
                            <td className="muted">{textOr(monitor.manufacturer)}</td>
                            <td className="num">{monitor.year ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Empty text={t("gpu.noMonitors")} />
                  )}
                </Card>
              </div>
            ) : null}

            {}
            {section === "disk" ? (
              <div className="stack">
                {adminNotice}

                <div className="grid cols-2">
                  {info.disks.map((disk, index) => {
                    const used = disk.total - disk.available;
                    const percent = disk.total ? (used / disk.total) * 100 : 0;
                    return (
                      <Card
                        key={index}
                        icon="disk"
                        title={textOr(disk.name, disk.mountPoint)}
                        sub={`${disk.mountPoint} · ${textOr(disk.fileSystem)}`}
                        right={<span className="pill">{disk.kind}</span>}
                      >
                        <div className="stat-value">{formatBytes(disk.available)}</div>
                        <div className="stat-meta">
                          {t("disk.free")} · {formatBytes(used)} {t("stat.used")} {t("stat.of")}{" "}
                          {formatBytes(disk.total)}
                        </div>
                        <Bar percent={percent} tone={loadTone(percent)} />
                      </Card>
                    );
                  })}
                </div>

                <div className="section-title">
                  {t("disk.physical")}
                  <span className="count">{sensors?.storage.length ?? 0}</span>
                </div>

                {sensors && sensors.storage.length ? (
                  <div className="grid cols-2">
                    {sensors.storage.map((disk, index) => {
                      const health = disk.health ?? "unknown";
                      const tone =
                        health === "healthy"
                          ? "green"
                          : health === "warning"
                            ? "orange"
                            : health === "unhealthy"
                              ? "red"
                              : "";
                      const healthLabel = t(`disk.${health}` as TranslationKey);
                      return (
                        <Card
                          key={index}
                          icon="drive"
                          title={textOr(disk.name ?? disk.model)}
                          sub={[disk.mediaType, disk.busType].filter(Boolean).join(" · ") || undefined}
                          right={<span className={`pill ${tone}`}>{healthLabel}</span>}
                        >
                          <Spec
                            label={t("disk.total")}
                            value={disk.size ? formatBytes(disk.size) : "—"}
                          />
                          <Spec
                            label={t("disk.temperature")}
                            value={
                              <span className={tempTone(disk.temperature) ? "pill orange" : ""}>
                                {formatTemp(disk.temperature)}
                              </span>
                            }
                          />
                          <Spec label={t("disk.hours")} value={formatHours(disk.powerOnHours)} />
                          <Spec label={t("disk.cycles")} value={formatCount(disk.startStops)} />
                          <Spec
                            label={t("disk.resource")}
                            value={
                              disk.wear === null || disk.wear === undefined
                                ? "—"
                                : formatPercent(Math.max(0, 100 - disk.wear))
                            }
                          />
                          <Spec
                            label={t("disk.readErrors")}
                            value={formatCount(disk.readErrors)}
                          />
                          <Spec
                            label={t("disk.writeErrors")}
                            value={formatCount(disk.writeErrors)}
                          />
                          <Spec label={t("disk.firmware")} value={textOr(disk.firmware)} />
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Empty text={t("disk.noPhysical")} />
                )}
              </div>
            ) : null}

            {}
            {section === "sensors" ? (
              <div className="stack">
                {adminNotice}

                {temps.length || fans.length ? (
                  <>
                    <div className="grid cols-4">
                      {hottest ? (
                        <StatCard
                          label={t("sensors.hottest")}
                          value={formatTemp(hottest.value)}
                          meta={`${textOr(hottest.hardware)} · ${hottest.name}`}
                          percent={Math.min(100, hottest.value)}
                          tone={tempTone(hottest.value)}
                        />
                      ) : null}
                      <StatCard
                        label={t("sensors.temps")}
                        value={String(temps.length)}
                        meta={`${t("sensors.source")}: ${textOr(sensors?.source)}`}
                      />
                      <StatCard label={t("sensors.fans")} value={String(fans.length)} />
                      {gpuLive?.temperature ? (
                        <StatCard
                          label={`${t("nav.gpu")} · ${t("stat.temperature")}`}
                          value={formatTemp(gpuLive.temperature)}
                          percent={Math.min(100, gpuLive.temperature)}
                          tone={tempTone(gpuLive.temperature)}
                        />
                      ) : null}
                    </div>

                    {temps.length ? (
                      <Card icon="thermometer" title={t("sensors.temps")}>
                        <div className="gauges">
                          {temps.map((item, index) => (
                            <Gauge
                              key={`${item.name}-${index}`}
                              name={item.name}
                              group={item.group}
                              sub={item.hardware}
                              value={formatTemp(item.value)}
                              percent={Math.min(100, item.value)}
                              tone={tempTone(item.value)}
                            />
                          ))}
                        </div>
                      </Card>
                    ) : null}

                    {fans.length ? (
                      <Card icon="fan" title={t("sensors.fans")}>
                        <div className="gauges">
                          {fans.map((fan, index) => (
                            <Gauge
                              key={`${fan.name}-${index}`}
                              name={fan.name}
                              group={fan.group}
                              sub={fan.hardware}
                              value={formatRpm(fan.rpm)}
                              percent={Math.min(100, (fan.rpm / 2500) * 100)}
                            />
                          ))}
                        </div>
                      </Card>
                    ) : null}
                  </>
                ) : (
                  <div className="notice">
                    <Icon name="thermometer" size={17} />
                    <div className="notice-body">{t("sensors.none")}</div>
                  </div>
                )}
              </div>
            ) : null}

            {}
            {section === "network" ? (
              <div className="stack">
                <div className="grid cols-4">
                  <StatCard label={t("net.rxRate")} value={formatRate(live?.rxRate ?? 0)} />
                  <StatCard label={t("net.txRate")} value={formatRate(live?.txRate ?? 0)} />
                  <StatCard
                    label={t("net.rx")}
                    value={formatBytes(
                      info.networks.reduce((sum, item) => sum + item.received, 0),
                    )}
                  />
                  <StatCard
                    label={t("net.tx")}
                    value={formatBytes(
                      info.networks.reduce((sum, item) => sum + item.transmitted, 0),
                    )}
                  />
                </div>

                <Card icon="pulse" title={t("net.traffic")}>
                  <Spark
                    points={netHistory.current.map((value) => {
                      const peak = Math.max(...netHistory.current, 1);
                      return (value / peak) * 100;
                    })}
                  />
                </Card>

                <Card
                  icon="network"
                  title={t("net.interfaces")}
                  right={<span className="count">{info.networks.length}</span>}
                >
                  {live && live.networkRates.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("net.interfaces")}</th>
                          <th className="num">{t("net.rxRate")}</th>
                          <th className="num">{t("net.txRate")}</th>
                          <th className="num">{t("net.rx")}</th>
                          <th className="num">{t("net.tx")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {live.networkRates.map((item) => (
                          <tr key={item.name}>
                            <td className="name">{item.name}</td>
                            <td className="num">{formatRate(item.rx)}</td>
                            <td className="num">{formatRate(item.tx)}</td>
                            <td className="num muted">{formatBytes(item.received)}</td>
                            <td className="num muted">{formatBytes(item.transmitted)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Empty text={t("net.none")} />
                  )}
                </Card>
              </div>
            ) : null}

            {}
            {section === "processes" ? (
              <div className="stack">
                <div className="grid cols-4">
                  <StatCard
                    label={t("proc.total")}
                    value={live ? formatCount(live.processCount) : "—"}
                  />
                  <StatCard
                    label={t("stat.cpuLoad")}
                    value={formatPercent(cpuUsage, 1)}
                    percent={cpuUsage}
                    tone={loadTone(cpuUsage)}
                  />
                  <StatCard
                    label={t("stat.memory")}
                    value={formatBytes(memoryUsed)}
                    percent={memoryPercent}
                    tone={loadTone(memoryPercent)}
                  />
                  <StatCard
                    label={t("stat.uptime")}
                    value={formatUptime(live?.uptime ?? info.os.uptime)}
                  />
                </div>

                <Card icon="activity" title={t("proc.top")}>
                  {live && live.processes.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("proc.name")}</th>
                          <th className="num">{t("proc.pid")}</th>
                          <th className="num">{t("proc.cpu")}</th>
                          <th className="num">{t("proc.memory")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {live.processes.map((process) => (
                          <tr key={process.pid}>
                            <td className="name">{process.name}</td>
                            <td className="num muted">{process.pid}</td>
                            <td className="num">{formatPercent(process.cpu, 1)}</td>
                            <td className="num">{formatBytes(process.memory)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <Empty text={t("state.empty")} />
                  )}
                </Card>
              </div>
            ) : null}

            {}
            {section === "system" ? (
              <div className="stack">
                {probeNotice("probe.system")}
                {sensors?.admin ? (
                  <div className="notice">
                    <Icon name="shieldCheck" size={17} />
                    <div className="notice-body">{t("admin.active")}</div>
                  </div>
                ) : (
                  adminNotice
                )}

                <div className="grid cols-2">
                  <Card icon="info" title={t("sys.windows")}>
                    <Spec label={t("sys.edition")} value={textOr(info.os.edition ?? info.os.longVersion)} />
                    <Spec
                      label={t("sys.version")}
                      value={textOr(info.os.displayVersion ?? info.os.version)}
                    />
                    <Spec label={t("sys.build")} value={textOr(info.os.build)} />
                    <Spec label={t("sys.arch")} value={textOr(info.os.osArch)} />
                    <Spec label={t("sys.kernel")} value={textOr(info.os.kernel)} />
                    <Spec label={t("sys.installed")} value={formatDate(info.os.installDate)} />
                    <Spec
                      label={t("sys.age")}
                      value={
                        daysSince(info.os.installDate) !== null
                          ? `${daysSince(info.os.installDate)} ${t("value.days")}`
                          : "—"
                      }
                    />
                    <Spec label={t("sys.boot")} value={formatUnixDate(info.os.bootTime)} />
                    <Spec label={t("sys.productId")} value={textOr(info.os.productId)} />
                  </Card>

                  <Card icon="user" title={t("sys.machine")}>
                    <Spec label={t("sys.hostname")} value={info.os.hostname} />
                    <Spec label={t("sys.manufacturer")} value={textOr(info.machine.manufacturer)} />
                    <Spec label={t("sys.model")} value={textOr(info.machine.model)} />
                    <Spec label={t("sys.type")} value={textOr(info.machine.systemType)} />
                    <Spec label={t("sys.user")} value={textOr(info.machine.user ?? info.os.registeredUser)} />
                    <Spec label={t("sys.domain")} value={textOr(info.machine.domain)} />
                    <Spec label={t("sys.organization")} value={textOr(info.os.organization)} />
                    <Spec label={t("sys.locale")} value={textOr(info.os.locale)} />
                    <Spec label={t("sys.timezone")} value={textOr(info.os.timeZone)} />
                    <Spec label={t("sys.systemDrive")} value={textOr(info.os.systemDrive)} />
                  </Card>
                </div>

                <Card icon="board" title={t("sys.board")}>
                  <div className="grid cols-2">
                    <div>
                      <Spec label={t("sys.manufacturer")} value={textOr(info.board?.manufacturer)} />
                      <Spec label={t("sys.boardModel")} value={textOr(info.board?.product)} />
                      <Spec label={t("sys.boardVersion")} value={textOr(info.board?.version)} />
                    </div>
                    <div>
                      <Spec label={t("sys.biosVendor")} value={textOr(info.board?.biosVendor)} />
                      <Spec label={t("sys.biosVersion")} value={textOr(info.board?.biosVersion)} />
                      <Spec label={t("sys.biosDate")} value={formatDate(info.board?.biosDate)} />
                      <Spec
                        label={t("sys.secureBoot")}
                        value={
                          info.board?.secureBoot === null || info.board?.secureBoot === undefined ? (
                            "—"
                          ) : (
                            <span className={`pill ${info.board.secureBoot ? "green" : ""}`}>
                              {info.board.secureBoot ? t("value.enabled") : t("value.disabled")}
                            </span>
                          )
                        }
                      />
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {toast ? (
        <div className="toast">
          <Icon name="check" size={16} />
          <span>{toast.text}</span>
          {toast.path ? <span className="path">{toast.path}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
