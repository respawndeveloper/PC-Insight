import type { ReactElement } from "react";

type IconName =
  | "gauge"
  | "cpu"
  | "memory"
  | "gpu"
  | "disk"
  | "network"
  | "activity"
  | "info"
  | "sun"
  | "moon"
  | "refresh"
  | "download"
  | "clock"
  | "chip"
  | "board"
  | "monitor"
  | "shield"
  | "check"
  | "minimize"
  | "maximize"
  | "close"
  | "user"
  | "calendar"
  | "thermometer"
  | "fan"
  | "languages"
  | "pulse"
  | "shieldCheck"
  | "alert"
  | "drive"
  | "bolt";

const PATHS: Record<IconName, ReactElement> = {
  gauge: (
    <>
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="m14 10.5 3.5-3.5" />
      <path d="M4 18a9 9 0 1 1 16 0" />
    </>
  ),
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <rect x="10.5" y="10.5" width="3" height="3" rx="0.6" />
      <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="8" width="18" height="9" rx="2" />
      <path d="M7 17v2M12 17v2M17 17v2M7 11v3M12 11v3M17 11v3" />
    </>
  ),
  gpu: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="2" />
      <circle cx="9" cy="12" r="2.6" />
      <path d="M15 10h4M15 14h4" />
    </>
  ),
  disk: (
    <>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
      <path d="M4.5 6.5v11c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-11" />
      <path d="M19.5 12c0 1.66-3.36 3-7.5 3s-7.5-1.34-7.5-3" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5Z" />
    </>
  ),
  activity: <path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.8v2.2M12 19v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.8 12H5M19 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.6 8.6 0 1 0 20 14.2Z" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.4h-4.4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.6v10.8" />
      <path d="m7.8 10.4 4.2 4.2 4.2-4.2" />
      <path d="M4.5 18.5h15" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.4V12l3 1.8" />
    </>
  ),
  chip: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M7 7h4v4H7zM15 7h2M15 11h2M7 15h10" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  shield: <path d="M12 3.2 5 6v5.4c0 4.2 2.9 7.6 7 9.4 4.1-1.8 7-5.2 7-9.4V6l-7-2.8Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="2" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20c.9-3.6 3.8-5.6 7.2-5.6s6.3 2 7.2 5.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.8h17M8 3.4v3.2M16 3.4v3.2" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 13.6V5.4a2 2 0 1 1 4 0v8.2a4 4 0 1 1-4 0Z" />
      <path d="M12 17.5v-6" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c0-3 .6-6 3-6 1.7 0 2.4 2.3 1 3.7L12 10Z" />
      <path d="M14 12c3 0 6 .6 6 3 0 1.7-2.3 2.4-3.7 1L14 12Z" />
      <path d="M12 14c0 3-.6 6-3 6-1.7 0-2.4-2.3-1-3.7L12 14Z" />
      <path d="M10 12c-3 0-6-.6-6-3 0-1.7 2.3-2.4 3.7-1L10 12Z" />
    </>
  ),
  languages: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5Z" />
    </>
  ),
  pulse: <path d="M3 12h4l2-5 3 10 2.5-6 1.8 3H21" />,
  shieldCheck: (
    <>
      <path d="M12 3.2 5 6v5.4c0 4.2 2.9 7.6 7 9.4 4.1-1.8 7-5.2 7-9.4V6l-7-2.8Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 3.2 19.5h17.6L12 4.5Z" />
      <path d="M12 10v4.2" />
      <path d="M12 17h.01" />
    </>
  ),
  drive: (
    <>
      <rect x="3" y="5" width="18" height="6" rx="1.8" />
      <rect x="3" y="13" width="18" height="6" rx="1.8" />
      <path d="M6.6 8h.01M6.6 16h.01" />
    </>
  ),
  bolt: <path d="M13.2 3 5.5 13.4h5.1L10.2 21l7.7-10.4h-5.1L13.2 3Z" />,
};

export type { IconName };

export function Icon({
  name,
  size = 17,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="6.2"
        y="6.2"
        width="11.6"
        height="11.6"
        rx="2.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect x="10.2" y="10.2" width="3.6" height="3.6" rx="1" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.75">
        <path d="M9.4 3.6v2M12 3.2v2.4M14.6 3.6v2M9.4 18.4v2M12 18.4v2.4M14.6 18.4v2" />
        <path d="M3.6 9.4h2M3.2 12h2.4M3.6 14.6h2M18.4 9.4h2M18.4 12h2.4M18.4 14.6h2" />
      </g>
    </svg>
  );
}
