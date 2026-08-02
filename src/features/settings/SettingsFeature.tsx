import { Settings, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchJson } from "../../api/client";
import type { ApiKeySettings, ApiKeySource } from "./types";

const sourceLabels: Record<ApiKeySource, string> = {
  environment: "環境設定",
  settings: "使用者設定",
  none: "未設定",
};

function publishStatus(message: string, isError = false) {
  window.dispatchEvent(new CustomEvent("app:status", { detail: { message, isError } }));
}

export function SettingsFeature() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ApiKeySettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("讀取中");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("tracker:opening", close);
    window.addEventListener("notification:opening", close);
    return () => {
      window.removeEventListener("tracker:opening", close);
      window.removeEventListener("notification:opening", close);
    };
  }, []);

  async function loadStatus() {
    try {
      const payload = await fetchJson<ApiKeySettings>("/api/settings/api-key");
      setSettings(payload);
      setStatus(payload.configured ? "已設定" : "尚未設定");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "讀取設定失敗");
    }
  }

  function openDrawer() {
    window.dispatchEvent(new Event("settings:opening"));
    setOpen(true);
    setApiKey("");
    void loadStatus();
  }

  function closeDrawer() {
    setOpen(false);
    setApiKey("");
  }

  async function saveApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = apiKey.trim();
    if (!value) {
      setStatus("請輸入 API key");
      return;
    }

    setSaving(true);
    setStatus("驗證中");
    try {
      const payload = await fetchJson<ApiKeySettings>("/api/settings/api-key", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: value }),
      });
      setSettings(payload);
      setApiKey("");
      setStatus("已設定");
      publishStatus("eBird API key 已設定");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API key 設定失敗");
    } finally {
      setSaving(false);
    }
  }

  async function removeApiKey() {
    setSaving(true);
    try {
      const payload = await fetchJson<ApiKeySettings>("/api/settings/api-key", { method: "DELETE" });
      setSettings(payload);
      setApiKey("");
      setStatus("尚未設定");
      publishStatus("已移除 eBird API key");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API key 移除失敗");
    } finally {
      setSaving(false);
    }
  }

  const shell = document.querySelector(".app-shell");
  const source = settings?.source ?? "none";
  const editable = settings?.editable ?? false;

  return (
    <>
      <button
        className={`icon-btn${open ? " active" : ""}`}
        type="button"
        aria-label="設定"
        aria-expanded={open}
        title="設定"
        onClick={openDrawer}
      >
        <Settings size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {shell &&
        createPortal(
          <>
            <aside className={`drawer settings-drawer${open ? "" : " closed"}`} aria-label="設定" aria-hidden={!open}>
              <div className="drawer-head">
                <strong>設定</strong>
                <button className="icon-btn" type="button" aria-label="關閉設定" onClick={closeDrawer}>
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
              <div className="drawer-body">
                <section className="settings-section">
                  <div className="settings-section-head">
                    <div>
                      <strong>eBird API key</strong>
                      <span className="setting-status">{status}</span>
                    </div>
                    <span className={`pill${settings?.configured ? "" : " muted"}`}>{sourceLabels[source]}</span>
                  </div>
                  {source !== "environment" && (
                    <form onSubmit={saveApiKey}>
                      <label className="field">
                        <span>API key</span>
                        <input
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="輸入 eBird API key"
                          value={apiKey}
                          disabled={!editable || saving}
                          onChange={(event) => setApiKey(event.target.value)}
                        />
                      </label>
                      <div className="drawer-actions">
                        <button className="primary" type="submit" disabled={!editable || saving}>
                          {saving ? "驗證中" : "驗證並儲存"}
                        </button>
                        {source === "settings" && (
                          <button className="secondary danger-action" type="button" disabled={saving} onClick={removeApiKey}>
                            移除
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </section>
              </div>
            </aside>
            {!open ? null : <div className="scrim settings-scrim" onClick={closeDrawer} />}
          </>,
          shell,
        )}
    </>
  );
}
