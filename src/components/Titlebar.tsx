import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icon";
import type { Lang, TranslationKey } from "../lib/i18n";

type Props = {
  crumb: string;
  theme: "light" | "dark";
  lang: Lang;
  live: boolean;
  exporting: boolean;
  onToggleTheme: () => void;
  onChangeLang: (lang: Lang) => void;
  onExport: () => void;
  t: (key: TranslationKey) => string;
};

export function Titlebar({
  crumb,
  theme,
  lang,
  live,
  exporting,
  onToggleTheme,
  onChangeLang,
  onExport,
  t,
}: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let disposed = false;
    const appWindow = getCurrentWindow();

    const sync = async () => {
      try {
        const value = await appWindow.isMaximized();
        if (!disposed) setMaximized(value);
      } catch {
      }
    };

    void sync();
    const unlisten = appWindow.onResized(() => void sync());

    return () => {
      disposed = true;
      void unlisten.then((off) => off());
    };
  }, []);

  const control = async (action: "minimize" | "toggle" | "close") => {
    const appWindow = getCurrentWindow();
    try {
      if (action === "minimize") await appWindow.minimize();
      else if (action === "toggle") await appWindow.toggleMaximize();
      else await appWindow.close();
    } catch {
    }
  };

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="tb-brand" data-tauri-drag-region>
        <span className="tb-mark">
          <img src="/logo-256.png" alt="" draggable={false} />
        </span>
        <span className="tb-title" data-tauri-drag-region>
          {t("appName")}
        </span>
      </div>

      <span className="tb-slash" data-tauri-drag-region>
        /
      </span>
      <span className="tb-crumb" data-tauri-drag-region>
        {crumb}
      </span>

      <div className="tb-drag" data-tauri-drag-region />

      <div className="tb-actions">
        <span
          className={`tb-live${live ? " is-on" : ""}`}
          title={live ? t("tb.live") : t("tb.paused")}
        >
          <span className="tb-live-dot" />
          {live ? t("tb.live") : t("tb.paused")}
        </span>

        <button
          type="button"
          className={`tb-button${exporting ? " is-busy" : ""}`}
          onClick={onExport}
          disabled={exporting}
          title={t("tb.reportHint")}
        >
          <Icon name="download" size={15} />
          <span>{t("tb.report")}</span>
        </button>

        <div className="tb-segment" title={t("tb.lang")}>
          <button
            type="button"
            className={lang === "ru" ? "is-on" : ""}
            onClick={() => onChangeLang("ru")}
          >
            RU
          </button>
          <button
            type="button"
            className={lang === "en" ? "is-on" : ""}
            onClick={() => onChangeLang("en")}
          >
            EN
          </button>
        </div>

        <button
          type="button"
          className="tb-icon-button"
          onClick={onToggleTheme}
          title={theme === "dark" ? t("tb.themeLight") : t("tb.themeDark")}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
        </button>
      </div>

      <div className="tb-controls">
        <button
          type="button"
          className="tb-control"
          onClick={() => void control("minimize")}
          title={t("tb.minimize")}
        >
          <Icon name="minimize" size={15} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="tb-control"
          onClick={() => void control("toggle")}
          title={maximized ? t("tb.restore") : t("tb.maximize")}
        >
          <Icon name="maximize" size={13} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="tb-control close"
          onClick={() => void control("close")}
          title={t("tb.close")}
        >
          <Icon name="close" size={15} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
}
