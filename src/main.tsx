import { createRoot } from "react-dom/client";
import { NotificationCenter } from "./features/events/NotificationCenter";
import { MapWorkspace } from "./features/map/MapWorkspace";
import { SearchToolbar } from "./features/search/SearchToolbar";
import { SettingsFeature } from "./features/settings/SettingsFeature";
import { MenuBarPreview, StatusDisplay } from "./features/shell/ShellFeatures";
import { TrackerManager } from "./features/tracking/TrackerManager";

window.eBirdDesktop?.onNotificationSelected((event) => {
  window.dispatchEvent(new CustomEvent("notification:selected", { detail: event }));
});

const statusRoot = document.getElementById("status-root");
if (!statusRoot) throw new Error("Missing status root");

createRoot(statusRoot).render(<StatusDisplay />);

const menuBarRoot = document.getElementById("menubar-root");
if (!menuBarRoot) throw new Error("Missing menu bar root");

createRoot(menuBarRoot).render(<MenuBarPreview />);

const workspaceRoot = document.getElementById("workspace-root");
if (!workspaceRoot) throw new Error("Missing workspace root");

createRoot(workspaceRoot).render(<MapWorkspace />);

const searchRoot = document.getElementById("search-root");
if (!searchRoot) throw new Error("Missing search root");

createRoot(searchRoot).render(<SearchToolbar />);

const settingsRoot = document.getElementById("settings-root");
if (!settingsRoot) throw new Error("Missing settings root");

createRoot(settingsRoot).render(<SettingsFeature />);

const notificationsRoot = document.getElementById("notifications-root");
if (!notificationsRoot) throw new Error("Missing notifications root");

createRoot(notificationsRoot).render(<NotificationCenter />);

const trackingRoot = document.getElementById("tracking-root");
if (!trackingRoot) throw new Error("Missing tracking root");

createRoot(trackingRoot).render(<TrackerManager />);
