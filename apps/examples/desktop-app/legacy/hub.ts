import { setPluginSandboxLauncher } from "@cline/core";
import { claimHubDaemonProcess } from "@cline/shared";

claimHubDaemonProcess();
delete process.env.ELECTRON_RUN_AS_NODE;
setPluginSandboxLauncher({
	command: process.execPath,
	argsPrefix: [],
	env: { ELECTRON_RUN_AS_NODE: "1" },
});
await import("@cline/core/hub/daemon-entry");
