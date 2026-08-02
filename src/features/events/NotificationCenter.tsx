import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchJson } from "../../api/client";
import type { ObservationEvent } from "../../types/domain";
import type { EventsResponse } from "./types";

function publishUnreadCount(unreadCount: number) {
  window.dispatchEvent(new CustomEvent("notifications:updated", { detail: { unreadCount } }));
}

function publishError(error: unknown) {
  const message = error instanceof Error ? error.message : "通知讀取失敗";
  window.dispatchEvent(new CustomEvent("app:status", { detail: { message, isError: true } }));
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ObservationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadEvents = useCallback(async () => {
    try {
      const payload = await fetchJson<EventsResponse>("/api/events?since=0");
      const sorted = [...payload.events].sort((a, b) => b.id - a.id);
      setEvents(sorted.slice(0, 100));
      setUnreadCount(payload.unreadCount);
      publishUnreadCount(payload.unreadCount);
    } catch (error) {
      publishError(error);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
    const timer = window.setInterval(() => void loadEvents(), 20_000);
    const refresh = () => void loadEvents();
    const close = () => setOpen(false);
    window.addEventListener("notifications:refresh", refresh);
    window.addEventListener("settings:opening", close);
    window.addEventListener("tracker:opening", close);
    window.addEventListener("menubar:opening", close);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("notifications:refresh", refresh);
      window.removeEventListener("settings:opening", close);
      window.removeEventListener("tracker:opening", close);
      window.removeEventListener("menubar:opening", close);
    };
  }, [loadEvents]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("[data-notification-ui]")) return;
      setOpen(false);
    };
    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, [open]);

  function togglePopover(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!open) window.dispatchEvent(new Event("notification:opening"));
    setOpen((value) => !value);
  }

  async function selectEvent(selected: ObservationEvent) {
    try {
      if (!selected.read) {
        const payload = await fetchJson<EventsResponse>(`/api/events/${selected.id}/read`, { method: "PATCH" });
        setEvents((current) => current.map((event) => (event.id === selected.id ? { ...event, read: true } : event)));
        setUnreadCount(payload.unreadCount);
        publishUnreadCount(payload.unreadCount);
      }
      setOpen(false);
      window.dispatchEvent(new CustomEvent("notification:selected", { detail: selected }));
    } catch (error) {
      publishError(error);
    }
  }

  async function markAllRead() {
    try {
      const payload = await fetchJson<EventsResponse>("/api/events/read", { method: "POST" });
      setEvents((current) => current.map((event) => ({ ...event, read: true })));
      setUnreadCount(payload.unreadCount);
      publishUnreadCount(payload.unreadCount);
    } catch (error) {
      publishError(error);
    }
  }

  const shell = document.querySelector(".app-shell");

  return (
    <>
      <button
        className={`icon-btn${unreadCount ? " has-alert" : ""}${open ? " active" : ""}`}
        type="button"
        aria-label="通知"
        aria-expanded={open}
        title="通知"
        data-notification-ui
        onClick={togglePopover}
      >
        <Bell size={18} strokeWidth={2} aria-hidden="true" />
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>
      {shell &&
        open &&
        createPortal(
          <section className="notification-popover" aria-label="通知清單" data-notification-ui>
            <div className="popover-head">
              <strong>通知</strong>
              <button className="text-btn" type="button" disabled={!unreadCount} onClick={markAllRead}>
                全部已讀
              </button>
            </div>
            {events.length > 0 ? (
              <div className="event-list">
                {events.slice(0, 20).map((event) => (
                  <button
                    className={`event-row${event.read ? "" : " unread"}`}
                    type="button"
                    key={event.id}
                    onClick={() => void selectEvent(event)}
                  >
                    <div className="event-title">
                      <span>{event.species.comName}</span>
                      <span>{event.observation.howMany ?? "?"}</span>
                    </div>
                    <div className="event-meta">
                      {event.observation.obsDt} / {event.observation.locName}
                    </div>
                    <div className="event-meta">{event.observation.subId}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty">目前沒有新紀錄。</div>
            )}
          </section>,
          shell,
        )}
    </>
  );
}
