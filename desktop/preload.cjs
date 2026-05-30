const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pfTrial", {
  status: () => ipcRenderer.invoke("trial:status"),
  activate: (key) => ipcRenderer.invoke("trial:activate", key),
});
