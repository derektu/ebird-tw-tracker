const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eBirdDesktop", {
  onNotificationSelected(callback) {
    const listener = (_event, observationEvent) => callback(observationEvent);
    ipcRenderer.on("desktop:notification-selected", listener);
    return () => ipcRenderer.removeListener("desktop:notification-selected", listener);
  },
});
