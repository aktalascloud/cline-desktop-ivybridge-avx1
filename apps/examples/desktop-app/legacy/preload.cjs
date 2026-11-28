const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clineLegacy", {
	invoke: (command, args) => ipcRenderer.invoke("cline:native", command, args),
});
