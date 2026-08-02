import type { Lang } from "./i18n";

const UNITS: Record<Lang, string[]> = {
  ru: ["Б", "КБ", "МБ", "ГБ", "ТБ", "ПБ"],
  en: ["B", "KB", "MB", "GB", "TB", "PB"],
};

let current: Lang = "ru";

export function setFormatLang(lang: Lang) {
  current = lang;
}

export function formatBytes(value: number, digits = 1): string {
  const units = UNITS[current];
  if (!Number.isFinite(value) || value <= 0) return `0 ${units[0]}`;
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / Math.pow(1024, i);
  const d = i <= 1 || scaled >= 100 ? 0 : digits;
  return `${scaled.toFixed(d).replace(/\.0$/, "")} ${units[i]}`;
}

export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond, 1)}${current === "ru" ? "/с" : "/s"}`;
}

export function formatPercent(value?: number | null, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatMhz(value?: number | null): string {
  if (!value) return "—";
  if (value >= 1000) {
    const ghz = (value / 1000).toFixed(2).replace(/\.?0+$/, "");
    return `${ghz} ${current === "ru" ? "ГГц" : "GHz"}`;
  }
  return `${Math.round(value)} ${current === "ru" ? "МГц" : "MHz"}`;
}

export function formatKb(value?: number | null): string {
  if (!value) return "—";
  if (value >= 1024) {
    const mb = value / 1024;
    const text = mb >= 10 ? mb.toFixed(0) : mb.toFixed(1).replace(/\.0$/, "");
    return `${text} ${current === "ru" ? "МБ" : "MB"}`;
  }
  return `${value} ${current === "ru" ? "КБ" : "KB"}`;
}

export function formatTemp(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, "")} °C`;
}

export function formatWatts(value?: number | null): string {
  if (!value) return "—";
  return `${value.toFixed(0)} ${current === "ru" ? "Вт" : "W"}`;
}

export function formatRpm(value?: number | null): string {
  if (!value) return "—";
  return `${Math.round(value)} ${current === "ru" ? "об/мин" : "RPM"}`;
}

export function formatHours(value?: number | null): string {
  if (!value) return "—";
  const hours = Math.round(value);
  if (hours < 48) return `${hours} ${current === "ru" ? "ч" : "h"}`;
  const days = Math.floor(hours / 24);
  return current === "ru"
    ? `${hours.toLocaleString("ru-RU")} ч · ${days} дн.`
    : `${hours.toLocaleString("en-US")} h · ${days} days`;
}

export function formatCount(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString(current === "ru" ? "ru-RU" : "en-US");
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (current === "ru") {
    if (d) parts.push(`${d} д`);
    if (h) parts.push(`${h} ч`);
    if (!d) parts.push(`${m} мин`);
  } else {
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (!d) parts.push(`${m}m`);
  }
  return parts.join(" ");
}

export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale = current === "ru" ? "ru-RU" : "en-US";
  const base = date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (!withTime) return base;
  return `${base}, ${date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function formatUnixDate(seconds?: number | null): string {
  if (!seconds) return "—";
  return formatDate(new Date(seconds * 1000).toISOString(), true);
}

export function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

export function loadTone(percent: number): "" | "orange" | "red" {
  if (percent >= 90) return "red";
  if (percent >= 70) return "orange";
  return "";
}

export function tempTone(value?: number | null): "" | "orange" | "red" {
  if (value === null || value === undefined) return "";
  if (value >= 85) return "red";
  if (value >= 70) return "orange";
  return "";
}

const MEMORY_TYPES: Record<number, string> = {
  20: "DDR",
  21: "DDR2",
  24: "DDR3",
  26: "DDR4",
  34: "DDR5",
  35: "LPDDR4",
  36: "LPDDR5",
};

export function memoryTypeName(code?: number | null): string | null {
  if (!code) return null;
  return MEMORY_TYPES[code] ?? null;
}

const FORM_FACTORS: Record<number, string> = {
  8: "DIMM",
  12: "SODIMM",
  13: "SRIMM",
};

export function formFactorName(code?: number | null): string | null {
  if (!code) return null;
  return FORM_FACTORS[code] ?? null;
}

export function textOr(value?: string | null, fallback = "—"): string {
  const text = (value ?? "").trim();
  return text.length ? text : fallback;
}
