import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

vi.mock("node:fs", () => ({
	accessSync: vi.fn(),
	constants: { X_OK: 1 },
	existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: vi.fn((_path, _args, _opts, cb: Function) => {
		cb(null, { stdout: "", stderr: "" });
	}),
	execFileSync: vi.fn(() => {
		throw new Error("not found");
	}),
}));

import { accessSync, existsSync } from "node:fs";

type RegisteredTool = { name: string; params: unknown; execute: Function };
const registeredTools: RegisteredTool[] = [];

type OnHandler = (event: any, ctx: any) => void | Promise<void>;
let sessionStartHandler: OnHandler | undefined;

const mockPi = {
	registerTool: vi.fn(
		(def: { name: string; parameters: unknown; execute: Function }) => {
			registeredTools.push({
				name: def.name,
				params: def.parameters,
				execute: def.execute,
			});
		},
	),
	on: vi.fn((event: string, handler: OnHandler) => {
		if (event === "session_start") sessionStartHandler = handler;
	}),
} as unknown as ExtensionAPI;

beforeAll(async () => {
	const mod = await import("../extensions/index.js");
	mod.default(mockPi);
});

beforeEach(() => {
	vi.clearAllMocks();
	registeredTools.length = 0;
});

// ── Registration ────────────────────────────────────────────────────

describe("registration", () => {
	it("registers all 6 tools when .codegraph exists and codegraph binary is found", async () => {
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(accessSync).mockImplementation((p: any) => {
			if (String(p).includes("codegraph")) return;
			throw new Error("not found");
		});

		await sessionStartHandler!({}, { cwd: "/test/project" });

		expect(mockPi.registerTool).toHaveBeenCalledTimes(6);
		const names = registeredTools.map((t) => t.name);
		expect(names).toContain("codegraph_explore");
		expect(names).toContain("codegraph_node");
		expect(names).toContain("codegraph_query");
		expect(names).toContain("codegraph_status");
		expect(names).toContain("codegraph_files");
		expect(names).toContain("codegraph_impact");
	});

	it("skips tool registration when .codegraph is missing", async () => {
		vi.mocked(existsSync).mockReturnValue(false);

		await sessionStartHandler!({}, { cwd: "/test/project" });

		expect(mockPi.registerTool).not.toHaveBeenCalled();
	});

	it("skips tool registration when codegraph binary is not found", async () => {
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(accessSync).mockImplementation(() => {
			throw new Error("not found");
		});

		await sessionStartHandler!({}, { cwd: "/test/project" });

		expect(mockPi.registerTool).not.toHaveBeenCalled();
	});
});

// ── normalizeWindowsPath ────────────────────────────────────────────

describe("normalizeWindowsPath", () => {
	async function getFn() {
		const mod = await import("../extensions/index.js");
		return mod.normalizeWindowsPath;
	}

	it("normalizes WSL /mnt/c/... paths on Windows", async () => {
		const fn = await getFn();
		const orig = process.platform;
		Object.defineProperty(process, "platform", { value: "win32" });
		try {
			expect(fn("/mnt/c/Users/dev/project")).toBe("C:\\Users\\dev\\project");
			expect(fn("/mnt/d/work/src")).toBe("D:\\work\\src");
		} finally {
			Object.defineProperty(process, "platform", { value: orig });
		}
	});

	it("normalizes Git Bash /c/... paths on Windows", async () => {
		const fn = await getFn();
		const orig = process.platform;
		Object.defineProperty(process, "platform", { value: "win32" });
		try {
			expect(fn("/c/Users/dev/project")).toBe("C:\\Users\\dev\\project");
			expect(fn("/d/work/src")).toBe("D:\\work\\src");
		} finally {
			Object.defineProperty(process, "platform", { value: orig });
		}
	});

	it("does not modify non-Windows paths on Win32", async () => {
		const fn = await getFn();
		const orig = process.platform;
		Object.defineProperty(process, "platform", { value: "win32" });
		try {
			expect(fn("/Users/vndv/project")).toBe("/Users/vndv/project");
			expect(fn("C:\\Windows\\path")).toBe("C:\\Windows\\path");
		} finally {
			Object.defineProperty(process, "platform", { value: orig });
		}
	});

	it("preserves paths on non-Windows platforms", async () => {
		const fn = await getFn();
		const orig = process.platform;
		Object.defineProperty(process, "platform", { value: "darwin" });
		try {
			expect(fn("/Users/dev/project")).toBe("/Users/dev/project");
			expect(fn("/mnt/c/test")).toBe("/mnt/c/test"); // no transform on mac
		} finally {
			Object.defineProperty(process, "platform", { value: orig });
		}
	});

	it("trims whitespace", async () => {
		const fn = await getFn();
		const orig = process.platform;
		Object.defineProperty(process, "platform", { value: "win32" });
		try {
			expect(fn("  C:\\test  ")).toBe("C:\\test");
		} finally {
			Object.defineProperty(process, "platform", { value: orig });
		}
	});
});

// ── sanitizeDiagnostic ──────────────────────────────────────────────

describe("sanitizeDiagnostic", () => {
	async function getFn() {
		const mod = await import("../extensions/index.js");
		return mod.sanitizeDiagnostic;
	}

	it("redacts TOKEN= values", async () => {
		const fn = await getFn();
		expect(fn("TOKEN=abc123")).toContain("TOKEN=[redacted]");
		expect(fn("TOKEN=abc123")).not.toContain("abc123");
	});

	it("redacts Bearer tokens", async () => {
		const fn = await getFn();
		const result = fn("Authorization: Bearer secret-token-value-here");
		expect(result).toContain("Bearer [redacted]");
		expect(result).not.toContain("secret-token-value-here");
	});

	it("redacts --api-key, --token, --password flags", async () => {
		const fn = await getFn();
		const result = fn("--api-key=hidden --token mytoken --otp 123456");
		expect(result).toContain("--[redacted]");
		expect(result).not.toContain("hidden");
		expect(result).not.toContain("mytoken");
		expect(result).not.toContain("123456");
	});

	it("removes ANSI escape sequences", async () => {
		const fn = await getFn();
		const result = fn("\u001b[31mfailed\u001b[0m");
		expect(result).toBe("failed");
	});

	it("handles API_KEY and APIKEY patterns", async () => {
		const fn = await getFn();
		expect(fn("API_KEY=supersecret")).toContain("API_KEY=[redacted]");
		expect(fn("APIKEY=supersecret")).toContain("APIKEY=[redacted]");
		expect(fn("MY_AUTH_TOKEN=xyz")).toContain("MY_AUTH_TOKEN=[redacted]");
	});

	it("truncates output beyond max length", async () => {
		const fn = await getFn();
		const long = "Bearer " + "x".repeat(2000);
		const result = fn(long);
		expect(result.length).toBeLessThan(1100);
		expect(result).toContain("[redacted]");
	});

	it("returns clean text unchanged", async () => {
		const fn = await getFn();
		expect(fn("hello world")).toBe("hello world");
	});

	it("redacts --password flag with space separator", async () => {
		const fn = await getFn();
		const result = fn("--password supersecret");
		expect(result).toContain("--[redacted]");
		expect(result).not.toContain("supersecret");
	});
});

// ── NOT_INDEXED_MSG path (tool execute without .codegraph) ──────────

describe("tool execute without index", () => {
	async function getTools() {
		vi.mocked(existsSync).mockReturnValue(false);
		await sessionStartHandler!({}, { cwd: "/test/project" });
		return registeredTools;
	}

	it("does not register tools when index is missing", async () => {
		const tools = await getTools();
		expect(tools).toHaveLength(0);
	});
});
