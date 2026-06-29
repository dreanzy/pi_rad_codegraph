import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

vi.mock("node:fs", () => ({
	accessSync: vi.fn(),
	constants: { X_OK: 1 },
	existsSync: vi.fn(),
}));
import { accessSync, existsSync } from "node:fs";

type RegisteredTool = { name: string };
const registeredTools: RegisteredTool[] = [];

type OnHandler = (event: any, ctx: any) => void | Promise<void>;
let sessionStartHandler: OnHandler | undefined;

const mockPi = {
	registerTool: vi.fn((def: { name: string }) => {
		registeredTools.push({ name: def.name });
	}),
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

describe("rad-codegraph", () => {
	it("registers tools when .codegraph exists and codegraph binary is found", async () => {
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(accessSync).mockImplementation((p: any) => {
			if (String(p).endsWith("codegraph")) return; // found in PATH
			throw new Error("not found");
		});

		await sessionStartHandler!({}, { cwd: "/test/project" });

		expect(mockPi.registerTool).toHaveBeenCalledTimes(2);
		const names = registeredTools.map((t) => t.name);
		expect(names).toContain("codegraph_explore");
		expect(names).toContain("codegraph_node");
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
