import { execFile } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { resolveClineDataDir } from "@cline/shared/storage";
import * as models from "@cline/llms";
import type { ProviderSettingsManager } from "../storage/provider-settings-manager";
import {
	addLocalProvider,
	ensureCustomProvidersLoaded,
	saveLocalProviderSettings,
} from "./local-provider-service";

const execute = promisify(execFile);
export const DSW_PROVIDER_ID = "dsw2api";
export const DSW_MODEL_ID = "deepseek-web";
const MARKER = "x-cline-managed-gateway";
const MARKER_VALUE = "dsw2api-v1";

type RecordInfo = {
	pid: number;
	port: number;
	build_id: string;
	instance_id: string;
	fixture: boolean;
};
type Descriptor = {
	record: RecordInfo | null;
	keys?: { client: string; control: string };
	has_keys: boolean;
	managed_registration?: boolean;
	account_count?: number;
};
type Connection = {
	record: RecordInfo;
	client: string;
	control: string;
	url: string;
};
export type DswGatewayStatus = {
	available: boolean;
	running: boolean;
	configured: boolean;
	modelId: string;
	baseUrl?: string;
	activeRequests?: number;
	accountCount?: number;
	localRequestQuota: null;
	localOutputCap: null;
};

function windowsArgument(value: string): string {
	return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}
function psLiteral(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}
function isManaged(
	settings: { headers?: Record<string, string> } | undefined,
): boolean {
	return Object.entries(settings?.headers ?? {}).some(
		([key, value]) => key.toLowerCase() === MARKER && value === MARKER_VALUE,
	);
}
export { isManaged as isManagedDswProvider };

export class ManagedDsw2Api {
	private starting?: Promise<Connection>;
	private readonly resourceRoot: string;
	private readonly stateRoot: string;
	constructor(options: { resourceRoot?: string; stateRoot?: string } = {}) {
		this.resourceRoot =
			options.resourceRoot ??
			join(
				dirname(process.env.CLINE_DESKTOP_CLI_PATH?.trim() || process.execPath),
				"bin",
				"dsw2api",
			);
		this.stateRoot =
			options.stateRoot ?? join(resolveClineDataDir(), "dsw2api");
	}
	private get python(): string {
		return join(this.resourceRoot, "runtime", "python.exe");
	}
	private get pythonWindowless(): string {
		return join(this.resourceRoot, "runtime", "pythonw.exe");
	}
	private get buildId(): string {
		return JSON.parse(
			readFileSync(join(this.resourceRoot, "manifest.json"), "utf8"),
		).build_id as string;
	}
	private childEnvironment(): NodeJS.ProcessEnv {
		const environment: NodeJS.ProcessEnv = {};
		for (const key of [
			"SystemRoot",
			"WINDIR",
			"USERPROFILE",
			"APPDATA",
			"LOCALAPPDATA",
			"TEMP",
			"TMP",
			"HTTP_PROXY",
			"HTTPS_PROXY",
			"ALL_PROXY",
			"NO_PROXY",
		]) {
			if (process.env[key] !== undefined) environment[key] = process.env[key];
		}
		return environment;
	}
	private async describe(): Promise<Descriptor> {
		if (
			existsSync(this.stateRoot) &&
			lstatSync(this.stateRoot).isSymbolicLink()
		)
			throw new Error("DSW2API data directory must not be a link");
		const result = await execute(
			this.python,
			[
				"-I",
				"-B",
				"-X",
				"utf8",
				"-m",
				"managed_runner",
				"describe",
				"--internal",
				"--state-dir",
				this.stateRoot,
			],
			{
				windowsHide: true,
				timeout: 15_000,
				maxBuffer: 65_536,
				env: this.childEnvironment(),
				cwd: this.resourceRoot,
			},
		);
		return JSON.parse(result.stdout) as Descriptor;
	}
	private async connection(
		descriptor: Descriptor,
	): Promise<Connection | undefined> {
		const record = descriptor.record;
		if (!record || !descriptor.keys) return undefined;
		if (
			!Number.isSafeInteger(record.port) ||
			record.port < 1024 ||
			record.port > 65535 ||
			record.fixture !== false ||
			record.build_id !== this.buildId
		)
			return undefined;
		const url = `http://127.0.0.1:${record.port}`;
		const nonce = randomBytes(16).toString("hex");
		try {
			const response = await fetch(`${url}/health?nonce=${nonce}`, {
				redirect: "error",
				signal: AbortSignal.timeout(1500),
			});
			if (
				!response.ok ||
				Number(response.headers.get("content-length") ?? 0) > 8192
			)
				return undefined;
			if (!response.body) return undefined;
			const reader = response.body.getReader();
			let text = "";
			try {
				const decoder = new TextDecoder();
				let size = 0;
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					size += value.byteLength;
					if (size > 8192) return undefined;
					text += decoder.decode(value, { stream: true });
				}
				text += decoder.decode();
			} finally {
				await reader.cancel().catch(() => undefined);
			}
			const identity = JSON.parse(text) as RecordInfo & { nonce_mac?: string };
			if (
				identity.pid !== record.pid ||
				identity.build_id !== record.build_id ||
				identity.instance_id !== record.instance_id ||
				identity.fixture !== false ||
				!/^[0-9a-f]{64}$/.test(identity.nonce_mac ?? "")
			)
				return undefined;
			const expected = createHmac("sha256", descriptor.keys.control)
				.update(
					[nonce, String(record.pid), record.build_id, record.instance_id].join(
						"\n",
					),
				)
				.digest();
			if (!timingSafeEqual(expected, Buffer.from(identity.nonce_mac!, "hex")))
				return undefined;
			return { record, ...descriptor.keys, url };
		} catch {
			return undefined;
		}
	}
	private async launch(): Promise<void> {
		const command = [
			this.pythonWindowless,
			"-I",
			"-B",
			"-X",
			"utf8",
			"-m",
			"managed_runner",
			"serve",
			"--state-dir",
			this.stateRoot,
		]
			.map(windowsArgument)
			.join(" ");
		const script = `$result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=${psLiteral(command)};CurrentDirectory=${psLiteral(this.resourceRoot)}}; if($result.ReturnValue -ne 0){throw 'Managed gateway launch failed'}; $result.ProcessId`;
		const powershell = join(
			process.env.SystemRoot || "C:\\Windows",
			"System32",
			"WindowsPowerShell",
			"v1.0",
			"powershell.exe",
		);
		await execute(
			powershell,
			[
				"-NoProfile",
				"-NonInteractive",
				"-EncodedCommand",
				Buffer.from(script, "utf16le").toString("base64"),
			],
			{
				windowsHide: true,
				timeout: 15_000,
				maxBuffer: 4096,
				env: this.childEnvironment(),
			},
		);
	}
	private async ensure(): Promise<Connection> {
		if (this.starting) return this.starting;
		this.starting = (async () => {
			if (
				process.platform !== "win32" ||
				!existsSync(this.python) ||
				!existsSync(this.pythonWindowless)
			)
				throw new Error(
					"Bundled DSW2API runtime is unavailable; repair the Desktop installation",
				);
			const existing = await this.connection(await this.describe());
			if (existing) return existing;
			await this.launch();
			for (let attempt = 0; attempt < 40; attempt++) {
				const connection = await this.connection(await this.describe());
				if (connection) return connection;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			throw new Error("DSW2API could not start its owned local gateway");
		})().finally(() => {
			this.starting = undefined;
		});
		return this.starting;
	}
	private async control(
		connection: Connection,
		path: string,
		body?: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		const response = await fetch(`${connection.url}/control/${path}`, {
			method: body ? "POST" : "GET",
			redirect: "error",
			signal: AbortSignal.timeout(path === "session" ? 25_000 : 5000),
			headers: {
				authorization: `Bearer ${connection.control}`,
				"content-type": "application/json",
			},
			...(body ? { body: JSON.stringify(body) } : {}),
		});
		if (!response.ok) {
			if (response.status === 409)
				throw new Error(
					"Wait for active DeepSeek requests before changing the session",
				);
			throw new Error(
				"DeepSeek session could not be verified; sign in and copy the current session",
			);
		}
		return (await response.json()) as Record<string, unknown>;
	}
	async status(): Promise<DswGatewayStatus> {
		const result: DswGatewayStatus = {
			available: process.platform === "win32" && existsSync(this.python),
			running: false,
			configured: false,
			modelId: DSW_MODEL_ID,
			localRequestQuota: null,
			localOutputCap: null,
		};
		if (!result.available) return result;
		const descriptor = await this.describe();
		result.configured = (descriptor.account_count ?? 0) > 0;
		const connection = await this.connection(descriptor);
		if (!connection) return result;
		const status = await this.control(connection, "status");
		return {
			...result,
			running: true,
			configured: status.configured === true,
			baseUrl: `${connection.url}/v1`,
			activeRequests: Number(status.active_requests ?? 0),
			accountCount: Number(status.account_count ?? 0),
		};
	}
	private async register(
		manager: ProviderSettingsManager,
		connection: Connection,
	): Promise<void> {
		await ensureCustomProvidersLoaded(manager);
		const descriptor = await this.describe();
		const stored = manager.getProviderSettings(DSW_PROVIDER_ID);
		if (
			models.hasProvider(DSW_PROVIDER_ID) &&
			!isManaged(stored) &&
			!descriptor.managed_registration
		) {
			throw new Error(
				"Another DSW2API provider already exists; its configuration was preserved",
			);
		}
		if (!models.hasProvider(DSW_PROVIDER_ID)) {
			await addLocalProvider(manager, {
				providerId: DSW_PROVIDER_ID,
				name: "DSW2API · DeepSeek Web",
				baseUrl: `${connection.url}/v1`,
				apiKey: connection.client,
				headers: { [MARKER]: MARKER_VALUE },
				models: [DSW_MODEL_ID],
				defaultModelId: DSW_MODEL_ID,
				protocol: "openai-chat",
				client: "openai-compatible",
				capabilities: ["streaming", "tools", "reasoning", "vision"],
			});
		}
		const current = manager.getProviderSettings(DSW_PROVIDER_ID);
		if (
			current?.apiKey !== connection.client ||
			current.baseUrl !== `${connection.url}/v1` ||
			!isManaged(current) ||
			current.sampling?.max_tokens !== 0
		) {
			await saveLocalProviderSettings(manager, {
				providerId: DSW_PROVIDER_ID,
				apiKey: connection.client,
				baseUrl: `${connection.url}/v1`,
				headers: { [MARKER]: MARKER_VALUE },
				sampling: { max_tokens: 0 },
			});
		}
		if (!descriptor.managed_registration)
			await this.control(connection, "registration", { confirm: true });
	}
	async configure(
		manager: ProviderSettingsManager,
		token: string,
		cookies: string,
	): Promise<DswGatewayStatus> {
		await ensureCustomProvidersLoaded(manager);
		const descriptor = existsSync(this.python)
			? await this.describe()
			: undefined;
		if (
			models.hasProvider(DSW_PROVIDER_ID) &&
			!isManaged(manager.getProviderSettings(DSW_PROVIDER_ID)) &&
			!descriptor?.managed_registration
		)
			throw new Error(
				"Another DSW2API provider already exists; its configuration was preserved",
			);
		const connection = await this.ensure();
		await this.control(connection, "session", { token, cookies });
		await this.register(manager, connection);
		return this.status();
	}
	async connectSaved(
		manager: ProviderSettingsManager,
	): Promise<DswGatewayStatus> {
		const connection = await this.ensure();
		const status = await this.control(connection, "status");
		if (status.configured !== true)
			throw new Error("A personal DeepSeek session token is required");
		await this.register(manager, connection);
		return this.status();
	}
	async synchronize(manager: ProviderSettingsManager): Promise<void> {
		if (!isManaged(manager.getProviderSettings(DSW_PROVIDER_ID))) return;
		await this.register(manager, await this.ensure());
	}
}

let singleton: ManagedDsw2Api | undefined;
export function getManagedDsw2Api(): ManagedDsw2Api {
	return (singleton ??= new ManagedDsw2Api());
}
