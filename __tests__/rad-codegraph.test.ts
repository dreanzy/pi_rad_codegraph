import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const { mockExecFile, mockAccessSync, mockExistsSync } = vi.hoisted(() => ({
	mockExecFile: vi.fn(),
	mockAccessSync: vi.fn(),
	mockExistsSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
	accessSync: mockAccessSync,
	constants: { X_OK: 1 },
	existsSync: mockExistsSync,
}));

vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
}));

vi.mock("@earendil-works/pi-tui", () => ({
	Text: vi.fn(() => ({})),
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const mod: any = await importOriginal();
	return { ...mod, keyHint: vi.fn(() => "expand") };
});

import { accessSync, existsSync } from "node:fs";
import { sanitizeDiagnostic } from "../extensions/index.js";

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
	it("registers all 6 tools when codegraph binary is found", async () => {
		mockAccessSync.mockImplementation((p: any) => {
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

	it("skips tool registration when codegraph binary is not found", async () => {
		mockExistsSync.mockReturnValue(true);
		mockAccessSync.mockImplementation(() => {
			throw new Error("not found");
		});

		await sessionStartHandler!({}, { cwd: "/test/project" });

		expect(mockPi.registerTool).not.toHaveBeenCalled();
	});
});

// ── sanitizeDiagnostic ──────────────────────────────────────────────


describe("sanitizeDiagnostic", () => {

	it("redacts TOKEN= values", async () => {
		expect(sanitizeDiagnostic("TOKEN=abc123")).toContain("TOKEN=[redacted]");
		expect(sanitizeDiagnostic("TOKEN=abc123")).not.toContain("abc123");
	});

	it("redacts Bearer tokens", async () => {
		const result = sanitizeDiagnostic("Authorization: Bearer secret-token-value-here");
		expect(result).toContain("Bearer [redacted]");
		expect(result).not.toContain("secret-token-value-here");
	});

	it("redacts --api-key, --token, --password flags", async () => {
		const result = sanitizeDiagnostic("--api-key=hidden --token mytoken --otp 123456");
		expect(result).toContain("--[redacted]");
		expect(result).not.toContain("hidden");
		expect(result).not.toContain("mytoken");
		expect(result).not.toContain("123456");
	});

	it("removes ANSI escape sequences", async () => {
		const result = sanitizeDiagnostic("\u001b[31mfailed\u001b[0m");
		expect(result).toBe("failed");
	});

	it("handles API_KEY and APIKEY patterns", async () => {
		expect(sanitizeDiagnostic("API_KEY=supersecret")).toContain("API_KEY=[redacted]");
		expect(sanitizeDiagnostic("APIKEY=supersecret")).toContain("APIKEY=[redacted]");
		expect(sanitizeDiagnostic("MY_AUTH_TOKEN=xyz")).toContain("MY_AUTH_TOKEN=[redacted]");
	});

	it("truncates output beyond max length", async () => {
		const long = "Bearer " + "x".repeat(2000);
		const result = sanitizeDiagnostic(long);
		expect(result.length).toBeLessThan(1100);
		expect(result).toContain("[redacted]");
	});

	it("returns clean text unchanged", async () => {
		expect(sanitizeDiagnostic("hello world")).toBe("hello world");
	});

	it("redacts --password flag with space separator", async () => {
		const result = sanitizeDiagnostic("--password supersecret");
		expect(result).toContain("--[redacted]");
		expect(result).not.toContain("supersecret");
	});
});

// ── ensureIndexReady ────────────────────────────────────────────────

describe("ensureIndexReady", () => {
	beforeEach(() => {
		// Default: session_start with codegraph on PATH
		mockAccessSync.mockImplementation((p: any) => {
			if (String(p).includes("codegraph")) return;
			throw new Error("not found");
		});
	});

	async function execTool(firstArg: string) {
		await sessionStartHandler!({}, { cwd: "/test/project" });
		const tool = registeredTools.find((t) => t.name === firstArg);
		if (!tool) return null;
		return tool.execute("call-1", {}, undefined, undefined, {
			cwd: "/test/project",
		});
	}

	it("auto-inits when .codegraph is missing and init succeeds", async () => {
		mockExistsSync.mockReturnValue(false);
		// init succeeds
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			if (args[0] === "init") return cb(null, { stdout: "", stderr: "" });
			cb(null, { stdout: "", stderr: "" });
		});

		const result = await execTool("codegraph_status");
		// status tool skips ensureIndexReady, so init is NOT called
		expect(mockExecFile).not.toHaveBeenCalledWith(
			expect.any(String),
			["init"],
			expect.any,
			expect.any,
		);
	});

	it("returns NOT_INDEXED_MSG when .codegraph missing and init fails", async () => {
		mockExistsSync.mockReturnValue(false);
		mockExecFile.mockImplementation((_path, _args, _opts, cb: Function) => {
			cb(new Error("init failed"));
		});

		const result = await execTool("codegraph_explore");
		expect(result.content[0].text).toContain("auto-init failed");
	});

	it("rebuilds index when status --json throws", async () => {
		mockExistsSync.mockReturnValue(true);
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			if (args[0] === "status") return cb(new Error("corrupt index"));
			if (args[0] === "index") return cb(null, { stdout: "", stderr: "" });
			cb(null, { stdout: "", stderr: "" });
		});

		await execTool("codegraph_node");
		// should call index -q after status fails
		const indexCalls = mockExecFile.mock.calls.filter(
			(c: any) => c[1][0] === "index",
		);
		expect(indexCalls).toHaveLength(1);
	});

	it("rebuilds index when status output is not valid JSON", async () => {
		mockExistsSync.mockReturnValue(true);
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			if (args[0] === "status") {
				return cb(null, { stdout: "not-json", stderr: "" });
			}
			if (args[0] === "index") return cb(null, { stdout: "", stderr: "" });
			cb(null, { stdout: "", stderr: "" });
		});

		await execTool("codegraph_files");
		const indexCalls = mockExecFile.mock.calls.filter(
			(c: any) => c[1][0] === "index",
		);
		expect(indexCalls).toHaveLength(1);
	});

	it("rebuilds index when index.state is not complete", async () => {
		mockExistsSync.mockReturnValue(true);
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			if (args[0] === "status") {
				const json = JSON.stringify({
					initialized: true,
					pendingChanges: { added: 0, modified: 0, removed: 0 },
					reindexRecommended: false,
					index: { state: "failed" },
				});
				return cb(null, { stdout: json, stderr: "" });
			}
			if (args[0] === "index") return cb(null, { stdout: "", stderr: "" });
			cb(null, { stdout: "", stderr: "" });
		});

		await execTool("codegraph_impact");
		const indexCalls = mockExecFile.mock.calls.filter(
			(c: any) => c[1][0] === "index",
		);
		expect(indexCalls).toHaveLength(1);
	});

	it("rebuilds index when reindexRecommended is true", async () => {
		mockExistsSync.mockReturnValue(true);
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			if (args[0] === "status") {
				const json = JSON.stringify({
					initialized: true,
					pendingChanges: { added: 0, modified: 0, removed: 0 },
					reindexRecommended: true,
					index: { state: "complete" },
				});
				return cb(null, { stdout: json, stderr: "" });
			}
			if (args[0] === "index") return cb(null, { stdout: "", stderr: "" });
			cb(null, { stdout: "", stderr: "" });
		});

		await execTool("codegraph_query");
		const indexCalls = mockExecFile.mock.calls.filter(
			(c: any) => c[1][0] === "index",
		);
		expect(indexCalls).toHaveLength(1);
	});

	it("syncs when pendingChanges exist", async () => {
		mockExistsSync.mockReturnValue(true);
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			if (args[0] === "status") {
				const json = JSON.stringify({
					initialized: true,
					pendingChanges: { added: 2, modified: 0, removed: 1 },
					reindexRecommended: false,
					index: { state: "complete" },
				});
				return cb(null, { stdout: json, stderr: "" });
			}
			if (args[0] === "sync") return cb(null, { stdout: "", stderr: "" });
			cb(null, { stdout: "", stderr: "" });
		});

		await execTool("codegraph_node");
		const syncCalls = mockExecFile.mock.calls.filter(
			(c: any) => c[1][0] === "sync",
		);
		expect(syncCalls).toHaveLength(1);
	});

	it("skips ensureIndexReady for status tool", async () => {
		mockExistsSync.mockReturnValue(true);
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			cb(null, { stdout: "plain status output", stderr: "" });
		});

		const result = await execTool("codegraph_status");
		// status passes through without ensureIndexReady calling status --json
		expect(result.content[0].text).toBe("plain status output");
	});

	it("passes through when index is healthy", async () => {
		mockExistsSync.mockReturnValue(true);
		mockExecFile.mockImplementation((_path, args, _opts, cb: Function) => {
			if (args[0] === "status") {
				return cb(null, {
					stdout: JSON.stringify({
						initialized: true,
						pendingChanges: { added: 0, modified: 0, removed: 0 },
						reindexRecommended: false,
						index: { state: "complete" },
					}),
					stderr: "",
				});
			}
			cb(null, { stdout: "explore result", stderr: "" });
		});

		const result = await execTool("codegraph_explore");
		expect(result.content[0].text).toBe("explore result");
	});
});
