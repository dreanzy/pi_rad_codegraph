import { execFile as execFileCb } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFile = promisify(execFileCb);

const EXPLORE_GUIDELINES = [
	"Use codegraph_explore before Read or Grep for any indexed code — one call returns source, call paths, and blast radius.",
	"Don't re-verify codegraph results with grep — results come from a full AST parse that is more accurate.",
	"Don't reconstruct call flows by hand — name the endpoints in codegraph_explore and it finds the path.",
	"Use concrete English symbol/module names — not Chinese, not file paths with .py/.ts.",
	"If explore returns nothing, try 2-3 narrower symbol names before falling back to Read/Grep.",
];

const NODE_GUIDELINES = [
	"Use codegraph_node instead of Read to get line-numbered source for a file or symbol — treat its output as already Read.",
];

const NOT_INDEXED_MSG =
	"This project does not have a .codegraph index. " +
	"Run `codegraph init -i` in the project to enable CodeGraph. " +
	"Until then, use Read/Grep for this project.";

function hasIndex(cwd: string): boolean {
	return existsSync(path.join(cwd, ".codegraph"));
}

function resolveBinary(name: string): string | null {
	const dirs = (process.env.PATH || "").split(path.delimiter);
	const exts =
		process.platform === "win32"
			? [`${name}.cmd`, `${name}.exe`, name]
			: [name, `${name}.cmd`, `${name}.exe`];
	for (const exe of exts) {
		for (const dir of dirs) {
			const full = path.resolve(dir, exe);
			try {
				accessSync(full, constants.X_OK);
				return full;
			} catch {}
		}
	}
	return null;
}

function registerTools(pi: ExtensionAPI, codegraphPath: string) {
	async function runCodegraph(
		args: string[],
		cwd: string,
		signal?: AbortSignal,
	): Promise<string> {
		const { stdout } = await execFile(codegraphPath, args, {
			cwd,
			timeout: 30_000,
			signal,
			shell: true,
		});
		return stdout as string;
	}

	pi.registerTool({
		name: "codegraph_explore",
		label: "CodeGraph Explore",
		description:
			"Explore indexed code: returns relevant source code with line numbers, call paths, and blast radius. " +
			'Pass symbol names spanning a flow, e.g. "createOrder validateStock". ' +
			"Use this instead of Read/Grep for any indexed code.",
		promptSnippet: "Explore indexed code: source, call paths, blast radius",
		promptGuidelines: EXPLORE_GUIDELINES,
		parameters: Type.Object({
			query: Type.String({
				description:
					'Symbol names spanning a flow, e.g. "createOrder validateStock"',
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!hasIndex(ctx.cwd)) {
				return {
					content: [{ type: "text", text: NOT_INDEXED_MSG }],
					details: {},
				};
			}

			try {
				const output = await runCodegraph(
					["explore", params.query],
					ctx.cwd,
					signal,
				);
				return { content: [{ type: "text", text: output }], details: {} };
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `CodeGraph error: ${e.message}` }],
					details: {},
				};
			}
		},
	});

	pi.registerTool({
		name: "codegraph_node",
		label: "CodeGraph Node",
		description:
			"Read a symbol or file from the code index. Pass a symbol name for its source + caller/callee trail, " +
			"or a file path to read the file with line numbers + dependents. " +
			"Treat the returned line-numbered output as already Read — safe to Edit from.",
		promptSnippet: "Read a file or symbol: line-numbered source + dependents",
		promptGuidelines: NODE_GUIDELINES,
		parameters: Type.Object({
			name: Type.String({ description: "Symbol name or file path" }),
			file: Type.Optional(Type.Boolean({ description: "Force file mode" })),
			offset: Type.Optional(
				Type.Number({ description: "1-based start line (file mode)" }),
			),
			limit: Type.Optional(
				Type.Number({ description: "Max lines (file mode)" }),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!hasIndex(ctx.cwd)) {
				return {
					content: [{ type: "text", text: NOT_INDEXED_MSG }],
					details: {},
				};
			}

			try {
				const args = ["node"];
				if (params.file) args.push("--file");
				if (params.offset) args.push("--offset", String(params.offset));
				if (params.limit) args.push("--limit", String(params.limit));
				args.push(params.name);

				const output = await runCodegraph(args, ctx.cwd, signal);
				return { content: [{ type: "text", text: output }], details: {} };
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `CodeGraph error: ${e.message}` }],
					details: {},
				};
			}
		},
	});
}

export default function codegraphExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!hasIndex(ctx.cwd)) return;

		const codegraphPath = resolveBinary("codegraph");
		if (!codegraphPath) return;

		registerTools(pi, codegraphPath);
	});
}
