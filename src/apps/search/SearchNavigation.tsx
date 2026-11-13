import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Dialog } from "../../features/bird-spots/Dialog";

export type SearchDestination = "species" | "spots" | "saved" | "settings";
export type SearchOverlay = { kind: "none" } | { kind: "menu" } | { kind: "settings"; confirmingRemoval: boolean };

const destinations: Array<{ id: SearchDestination; label: string; description: string }> = [
  { id: "species", label: "搜尋鳥種", description: "查詢鳥種最近的觀察紀錄" },
  { id: "spots", label: "搜尋鳥點", description: "尋找公開熱點與收藏的地點" },
  { id: "saved", label: "我的鳥點", description: "管理收藏、筆記與釘選" },
  { id: "settings", label: "設定與說明", description: "API key 與瀏覽器資料" },
];

export function SearchNavigation({ title, subtitle, saved, onMenu, onDestination, onSearch, onMap, searchRef, formOpen }: {
  title: string; subtitle: string; saved: boolean; formOpen: boolean;
  onMenu(): void; onDestination(destination: SearchDestination): void; onSearch(): void; onMap(): void;
  searchRef: RefObject<HTMLButtonElement | null>;
}) {
  return <header className="search-form-card search-navigation">
    <button className="spot-icon-button search-menu-toggle" aria-label="開啟主選單" onClick={onMenu}>☰</button>
    <span className="search-navigation-brand">eBird Taiwan Search</span>
    <nav className="search-wide-navigation" aria-label="主要功能">
      {destinations.map(destination => <button key={destination.id} type="button" onClick={() => onDestination(destination.id)}>{destination.label}</button>)}
    </nav>
    <div className="search-navigation-context"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
    <button hidden={formOpen} ref={searchRef} className="search-app-secondary mobile-edit-search-button" onClick={saved ? onMap : onSearch}>{saved ? "地圖" : subtitle ? "修改搜尋" : "搜尋"}</button>
  </header>;
}

export function SearchNavigationOverlay({ overlay, onClose, onDestination, onConfirmRemoval, onForgetKey }: {
  overlay: SearchOverlay; onClose(): void; onDestination(destination: SearchDestination): void;
  onConfirmRemoval(confirming: boolean): void; onForgetKey(): void;
}) {
  if (overlay.kind === "none") return null;
  const settings = overlay.kind === "settings";
  const confirming = settings && overlay.confirmingRemoval;
  return <Dialog key={settings ? confirming ? "remove-key" : "settings" : "menu"} titleId="search-navigation-title" className={`search-navigation-overlay ${settings ? "search-settings-overlay" : "search-menu-overlay"}`} onClose={() => confirming ? onConfirmRemoval(false) : onClose()}>
    <div className="search-panel-heading"><h1 id="search-navigation-title">{settings ? confirming ? "移除 API key？" : "設定與說明" : "主選單"}</h1>
      <button className="spot-icon-button" aria-label={settings ? "返回" : "關閉主選單"} onClick={() => confirming ? onConfirmRemoval(false) : onClose()}>{settings ? "←" : "×"}</button>
    </div>
    {!settings ? <nav aria-label="主選單">{destinations.map(destination => <button key={destination.id} onClick={() => onDestination(destination.id)}><strong>{destination.label}</strong><small>{destination.description}</small></button>)}</nav>
      : confirming ? <><p>只會移除這個瀏覽器的 eBird API key。收藏、筆記與搜尋紀錄會保留，下次搜尋需要重新輸入 key。</p><div className="search-panel-actions"><button className="search-app-secondary" onClick={() => onConfirmRemoval(false)}>取消</button><button className="search-app-primary" onClick={onForgetKey}>確認移除</button></div></>
      : <div className="search-settings-content"><section><h2>eBird API key</h2><p>已設定。API key 只保存在這個瀏覽器，用於向 eBird 查詢。</p><button className="search-app-secondary" onClick={() => onConfirmRemoval(true)}>移除 API key</button></section><section><h2>收藏與筆記</h2><p>資料儲存在這個瀏覽器的網站資料中，不會自動同步到其他裝置或瀏覽器。移除或更換 API key 不會刪除收藏與筆記。</p></section></div>}
  </Dialog>;
}

export function SearchFormPanel({ title, onCancel, children, inline }: { title: string; onCancel(): void; children: ReactNode; inline: boolean }) {
  const viewportRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inline) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [inline, onCancel]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = viewportRoot.current;
    if (inline || !viewport || !root) return;
    root.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    let frame = 0;
    const fit = () => {
      root.style.setProperty("--form-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--form-viewport-top", `${viewport.offsetTop}px`);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && root.contains(focused)) focused.scrollIntoView({ block: "nearest" });
      });
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    root.addEventListener("focusin", fit);
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener("resize", fit); viewport.removeEventListener("scroll", fit); root.removeEventListener("focusin", fit); };
  }, [inline]);
  if (inline) return <section className="search-form-card search-inline-form" aria-labelledby="search-workspace-title"><div className="search-panel-heading"><h1 id="search-workspace-title">{title}</h1><button className="spot-icon-button" aria-label="取消搜尋" onClick={onCancel}>×</button></div>{children}</section>;
  return <div ref={viewportRoot} className="search-form-viewport"><Dialog titleId="search-workspace-title" className="search-form-overlay" onClose={onCancel}>
    <div className="search-panel-heading"><h1 id="search-workspace-title">{title}</h1><button className="spot-icon-button" aria-label="取消搜尋" onClick={onCancel}>×</button></div>
    {children}
  </Dialog></div>;
}
