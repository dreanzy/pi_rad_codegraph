import { existsSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CODEGRAPH_GUIDANCE = [
	"This project has a .codegraph index — use the `codegraph` CLI for code intelligence queries via bash:",
	"",
	"- `codegraph query <search>` — Quick symbol search by name",
	"- `codegraph explore <query...>` — Explore an area: relevant symbols + call paths",
	"- `codegraph node <name>` — One symbol's source + caller/callee trail",
	"- `codegraph files` — Project file structure from the index",
	"- `codegraph callers <symbol>` — Find callers of a symbol",
	"- `codegraph callees <symbol>` — Find callees of a symbol",
	"- `codegraph impact <symbol>` — Analyze impact radius of a change",
	"- `codegraph status` — Index status and statistics",
	"",
	"For architecture, flow, where-is-symbol, impact, and codebase navigation questions, use `codegraph` CLI commands directly before grep/read.",
	"Only use grep/read after CodeGraph is insufficient or when the user asks for literal text matching.",
].join("\n");

export default function codegraphExtension(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event) => {
		const codegraphDir = path.join(event.systemPromptOptions.cwd, ".codegraph");
		if (!existsSync(codegraphDir)) return;

		return {
			systemPrompt: event.systemPrompt
				? `${event.systemPrompt}\n\n${CODEGRAPH_GUIDANCE}`
				: CODEGRAPH_GUIDANCE,
		};
	});
}
