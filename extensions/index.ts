import { existsSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CODEGRAPH_GUIDANCE = [
	"## CodeGraph — indexed code intelligence available",
	"One `codegraph explore` replaces Read+Grep. Don't Read or grep first for indexed code.",
	"Don't re-verify with grep — results come from a full AST parse.",
	"Don't hand-reconstruct flows — name endpoints in one explore call.",
	"`codegraph node` returns line-numbered source — treat it as already Read.",
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
