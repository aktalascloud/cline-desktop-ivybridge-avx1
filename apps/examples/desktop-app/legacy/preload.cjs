const { contextBridge, ipcRenderer } = require("electron");

const prefix = "--cline-sidecar=";
const endpoint = process.argv.find((arg) => arg.startsWith(prefix));
if (endpoint) {
	contextBridge.exposeInMainWorld(
		"__SIDECAR_WS_ENDPOINT__",
		endpoint.slice(prefix.length),
	);
}
contextBridge.exposeInMainWorld("clineLegacy", {
	invoke: (command, args) => ipcRenderer.invoke("cline:native", command, args),
});
