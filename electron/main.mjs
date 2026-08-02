import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Notification,
  safeStorage,
  shell,
  Tray,
} from "electron";
import { createApplication } from "../server/application.mjs";
import { createSecureSettingsStore } from "./secure-settings.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
app.setName("eBird Taiwan Tracker");
if (!app.isPackaged) app.setPath("userData", path.join(root, ".electron-user-data"));
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.exit(0);

let application = null;
let mainWindow = null;
let tray = null;
let serviceUrl = null;
let quitting = false;
let shutdownStarted = false;

function quitApplication() {
  if (shutdownStarted) {
    app.exit(0);
    return;
  }
  shutdownStarted = true;
  quitting = true;
  tray?.destroy();
  tray = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();

  const current = application;
  application = null;
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  void Promise.race([current?.close() ?? Promise.resolve(), timeout])
    .catch((error) => console.error("Failed to stop eBird Taiwan Tracker cleanly:", error))
    .finally(() => app.exit(0));
}

function runTrayAction(action) {
  void action().catch((error) => {
    console.error("Menu Bar action failed:", error);
    if (!Notification.isSupported()) return;
    new Notification({
      title: "eBird Taiwan Tracker",
      body: error instanceof Error ? error.message : "操作失敗，請稍後再試",
    }).show();
  });
}

function showWindow(observationEvent) {
  if (quitting || !mainWindow) return;
  try {
    if (mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (observationEvent) mainWindow.webContents.send("desktop:notification-selected", observationEvent);
  } catch (error) {
    if (error instanceof Error && error.message.includes("destroyed")) {
      mainWindow = null;
      return;
    }
    throw error;
  }
}

async function refreshTray() {
  if (!tray || !application) return;
  const trackers = await application.services.tracking.list();
  const events = await application.services.tracking.getEvents();
  const activeCount = trackers.filter((tracker) => tracker.enabled).length;
  tray.setToolTip(events.unreadCount
    ? `eBird Taiwan Tracker：${events.unreadCount} 筆未讀通知`
    : `eBird Taiwan Tracker：${activeCount} 個追蹤啟用中`);
  if (process.platform === "darwin") tray.setTitle(events.unreadCount ? String(events.unreadCount) : "");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: events.unreadCount ? `${events.unreadCount} 筆未讀通知` : `${activeCount} 個追蹤啟用中`, enabled: false },
    { type: "separator" },
    { label: "開啟 eBird Taiwan Tracker", click: () => showWindow() },
    {
      label: "立即檢查",
      enabled: activeCount > 0,
      click: () => runTrayAction(async () => {
        await application.services.tracking.check();
        await refreshTray();
      }),
    },
    {
      label: "暫停全部追蹤",
      enabled: activeCount > 0,
      click: () => runTrayAction(async () => {
        await application.services.tracking.pauseAll();
        await refreshTray();
      }),
    },
    { type: "separator" },
    { label: "結束", click: quitApplication },
  ]));
}

function showNativeEvents(events) {
  if (!Notification.isSupported()) return;
  for (const event of events) {
    const notification = new Notification({
      title: `${event.species.comName}有新紀錄`,
      body: `${event.observation.obsDt} · ${event.observation.locName}`,
      silent: false,
    });
    notification.on("click", () => showWindow(event));
    notification.show();
  }
}

function createTray() {
  let image = process.platform === "darwin"
    ? nativeImage.createFromNamedImage("bird.fill", { pointSize: 10, weight: "medium", scale: "small" })
    : nativeImage.createEmpty();
  if (image.isEmpty() && process.platform === "darwin") {
    image = nativeImage.createFromNamedImage("bird", { pointSize: 10, weight: "medium", scale: "small" });
  }
  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }
  tray = new Tray(image, "8ff45065-2edf-49b7-86b6-c8cbba3a5334");
  void refreshTray();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: "#eef2ec",
    title: "eBird Taiwan Tracker",
    webPreferences: {
      preload: path.join(root, "electron", "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== new URL(serviceUrl).origin) event.preventDefault();
  });
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  void mainWindow.loadURL(serviceUrl);
}

async function startDesktop() {
  const userData = app.getPath("userData");
  const settingsStore = createSecureSettingsStore({
    filePath: path.join(userData, "settings.encrypted"),
    safeStorage,
  });
  application = await createApplication({
    root,
    dataDir: path.join(userData, "data"),
    distDir: path.join(root, "dist"),
    port: 0,
    isProduction: app.isPackaged,
    settingsStore,
    onEvents: showNativeEvents,
    onTrackingStateChange: refreshTray,
    viteHmr: false,
  });
  const address = await application.listen();
  serviceUrl = address.url;
  createWindow();
  createTray();
}

if (hasLock) {
  app.on("second-instance", () => showWindow());
  app.on("activate", () => showWindow());
  app.on("window-all-closed", () => {});
  app.on("before-quit", (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    quitApplication();
  });

  app.whenReady().then(startDesktop).catch((error) => {
    console.error("Failed to start eBird Taiwan Tracker:", error);
    app.exit(1);
  });
}
