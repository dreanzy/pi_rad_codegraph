import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));
import { existsSync } from "node:fs";

type BeforeAgentEvent = {
	systemPrompt: string;
	systemPromptOptions: { cwd: string };
};
type BeforeAgentResult = { systemPrompt: string } | undefined;

let handler: (event: BeforeAgentEvent) => BeforeAgentResult;

beforeAll(async () => {
	const mod = await import("../extensions/index.js");
	const pi = { on: vi.fn() } as unknown as ExtensionAPI;
	mod.default(pi);
	handler = (pi.on as ReturnType<typeof vi.fn>).mock.calls.find(
		(c: unknown[]) => (c as [string])[0] === "before_agent_start",
	)![1] as (event: BeforeAgentEvent) => BeforeAgentResult;
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("rad-codegraph", () => {
	it("injects guidance when .codegraph exists in cwd", async () => {
		vi.mocked(existsSync).mockReturnValue(true);

		const result = await handler({
			systemPrompt: "existing prompt",
			systemPromptOptions: { cwd: "/test/project" },
		});

		expect(result!.systemPrompt).toContain("existing prompt");
		expect(result!.systemPrompt).toContain("codegraph explore");
		expect(result!.systemPrompt).toContain("codegraph node");
		expect(existsSync).toHaveBeenCalledWith(
			path.join("/test/project", ".codegraph"),
		);
	});

	it("returns nothing when .codegraph does not exist", async () => {
		vi.mocked(existsSync).mockReturnValue(false);

		const result = await handler({
			systemPrompt: "existing prompt",
			systemPromptOptions: { cwd: "/test/project" },
		});

		expect(result).toBeUndefined();
	});
});
