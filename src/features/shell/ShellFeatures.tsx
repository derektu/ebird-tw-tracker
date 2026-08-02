import { CircleDot } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Tracker } from "../tracking/types";

export function StatusDisplay() {
  const [status, setStatus] = useState({ message: "準備查詢", isError: false });

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; isError?: boolean }>).detail;
      setStatus({ message: detail.message, isError: Boolean(detail.isError) });
    };
    window.addEventListener("app:status", update);
    return () => window.removeEventListener("app:status", update);
  }, []);

  return <div className={`brand-subtitle${status.isError ? " error" : ""}`}>{status.message}</div>;
}

export function MenuBarPreview() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [trackers, setTrackers] = useState<Tracker[]>([]);

  useEffect(() => {
    const updateNotifications = (event: Event) => {
      setUnreadCount((event as CustomEvent<{ unreadCount: number }>).detail.unreadCount);
    };
    const updateTrackers = (event: Event) => {
      setTrackers((event as CustomEvent<{ trackers: Tracker[] }>).detail.trackers);
    };
    const close = () => setOpen(false);
    window.addEventListener("notifications:updated", updateNotifications);
    window.addEventListener("tracking:updated", updateTrackers);
    window.addEventListener("notification:opening", close);
    window.addEventListener("settings:opening", close);
    window.addEventListener("tracker:opening", close);
    return () => {
      window.removeEventListener("notifications:updated", updateNotifications);
      window.removeEventListener("tracking:updated", updateTrackers);
      window.removeEventListener("notification:opening", close);
      window.removeEventListener("settings:opening", close);
      window.removeEventListener("tracker:opening", close);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("[data-menubar-ui]")) return;
      setOpen(false);
    };
    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, [open]);

  const activeCount = trackers.filter((tracker) => tracker.enabled).length;
  const shell = document.querySelector(".app-shell");

  function run(command: "tracking:check" | "tracking:open" | "tracking:pause-all") {
    setOpen(false);
    window.dispatchEvent(new Event(command));
  }

  return (
    <>
      <button
        className={`icon-btn${open ? " active" : ""}${unreadCount ? " has-alert" : ""}`}
        type="button"
        aria-label="常駐入口"
        aria-expanded={open}
        title="常駐入口預覽"
        data-menubar-ui
        onClick={(event) => {
          event.stopPropagation();
          if (!open) window.dispatchEvent(new Event("menubar:opening"));
          setOpen((current) => !current);
        }}
      >
        <CircleDot size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {shell && open && createPortal(
        <section className="menubar-popover" data-menubar-ui>
          <div className="menubar-title">
            <span className={`menubar-icon${unreadCount ? " alert" : ""}`}>
              <CircleDot size={17} aria-hidden="true" />
            </span>
            <div>
              <strong>Menu Bar Preview</strong>
              <span>{unreadCount ? `${unreadCount} 筆未讀通知` : `${activeCount} 個追蹤啟用中`}</span>
            </div>
          </div>
          <button type="button" onClick={() => run("tracking:check")}>立即檢查</button>
          <button type="button" onClick={() => run("tracking:open")}>追蹤管理</button>
          <button type="button" onClick={() => run("tracking:pause-all")}>暫停全部追蹤</button>
        </section>,
        shell,
      )}
    </>
  );
}
