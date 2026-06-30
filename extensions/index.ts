import { execFile as execFileCb, execFileSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFile = promisify(execFileCb);

// ---- Guidelines ----

const EXPLORE_GUIDELINES = [
	"Use codegraph_explore before Read or Grep for any indexed code — one call returns source, call paths, and blast radius.",
	"Don't re-verify codegraph results with grep — results come from a full AST parse that is more accurate.",
	"Don't reconstruct call flows by hand — name the endpoints in codegraph_explore and it finds the path.",
	"Use only English symbol/module names — not Chinese, not file paths with .py/.ts.",
	"If explore returns nothing, try 2-3 narrower symbol names before falling back to Read/Grep.",
];

const NODE_GUIDELINES = [
	"Use codegraph_node instead of Read to get line-numbered source for a file or symbol — treat its output as already Read.",
	'After codegraph_explore returns symbol names (e.g. "save_sku_xlsx (file.py:27)"), use codegraph_node to read the symbol source + call chain in one call instead of Read.',
];

const FILES_GUIDELINES = [
	"Use codegraph_files to explore project file structure before reading individual files.",
	"Use --filter to narrow to a specific directory, --pattern for glob matching.",
	"Use --format grouped to see symbols organized by file.",
];

const IMPACT_GUIDELINES = [
	"Use codegraph_impact to understand the blast radius before refactoring or deleting a symbol.",
	"Depth 1 = direct callers only. Depth 2 (default) = callers of callers.",
];

const QUERY_GUIDELINES = [
	"Use codegraph_query when you need to find a symbol but don't know its exact name — it does fuzzy search.",
	"For known symbol names, prefer codegraph_explore or codegraph_node instead (they return more context).",
];

// ---- Constants ----

const NOT_INDEXED_MSG =
	"This project does not have a .codegraph index. " +
	"Run `codegraph init -i` in the project to enable CodeGraph. " +
	"Until then, use Read/Grep for this project.";

const MaxDiagnosticLength = 1000;

// ---- Path & binary resolution ----

function hasIndex(cwd: string): boolean {
	return existsSync(path.join(cwd, ".codegraph"));
}

/** Normalize WSL (`/mnt/c/...`) and Git Bash (`/c/...`) paths to Windows. */
export function normalizeWindowsPath(inputPath: string): string {
	let normalized = inputPath.trim();
	if (process.platform !== "win32") return normalized;

	const wslMatch = normalized.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
	if (wslMatch) {
		normalized =
			wslMatch[1].toUpperCase() + ":\\" + wslMatch[2].replace(/\//g, "\\");
	}

	const gitBashMatch = normalized.match(/^\/([a-zA-Z])\/(.*)$/);
	if (gitBashMatch) {
		normalized =
			gitBashMatch[1].toUpperCase() +
			":\\" +
			gitBashMatch[2].replace(/\//g, "\\");
	}

	return normalized;
}

function resolveOnPath(name: string): string | null {
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

/** On Windows, use PowerShell command discovery as fallback when PATH enumeration fails. */
function resolveOnWindowsPowerShell(name: string): string | null {
	if (process.platform !== "win32") return null;
	try {
		const script = `& {
	param([string]$Name)
	$ErrorActionPreference = 'Stop';
	$cmd = Get-Command $Name -CommandType Application -ErrorAction Stop | Select-Object -First 1;
	if (-not $cmd) { exit 1; }
	Write-Output $cmd.Source;
	exit 0;
}`;
		const stdout = execFileSync(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-Command",
				script,
				name,
			],
			{ timeout: 5000, encoding: "utf-8" },
		);
		const resolved = stdout.trim();
		return resolved || null;
	} catch {
		return null;
	}
}

function resolveBinary(name: string): string | null {
	return resolveOnPath(name) ?? resolveOnWindowsPowerShell(name);
}

// ---- Sensitive info filtering ----

/** Redact credentials/tokens from diagnostic output. */
export function sanitizeDiagnostic(value: string): string {
	const withoutAnsi = value.replace(/\u001b\[[0-9;]*m/g, "");
	const redacted = withoutAnsi
		.replace(
			/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|AUTH)[A-Z0-9_]*=)\S+/gi,
			"$1[redacted]",
		)
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
		.replace(
			/--(?:token|secret|password|api-key|apikey|otp)(?:=|\s+)\S+/gi,
			"--[redacted]",
		);
	return redacted.length > MaxDiagnosticLength
		? `${redacted.slice(0, MaxDiagnosticLength)}...`
		: redacted;
}

// ---- Tool registration ----

function registerTools(pi: ExtensionAPI, codegraphPath: string) {
	async function runCodegraph(
		args: string[],
		cwd: string,
		signal?: AbortSignal,
	): Promise<string> {
		const { stdout, stderr } = await execFile(codegraphPath, args, {
			cwd,
			timeout: 30_000,
			signal,
			shell: true,
		});
		const out = String(stdout);
		const filtered = stderr ? sanitizeDiagnostic(String(stderr)) : "";
		return filtered ? `${out}\n--- stderr ---\n${filtered}` : out;
	}

	function wrapError(e: any) {
		const stderr = (e as any).stderr as string | undefined;
		const stderrInfo = stderr ? sanitizeDiagnostic(stderr) : "";
		const msg = stderrInfo
			? `CodeGraph error (exit ${(e as any).code ?? "?"}): ${stderrInfo}`
			: `CodeGraph error: ${(e as Error).message}`;
		return { content: [{ type: "text" as const, text: msg }], details: {} };
	}

	async function toolExec(
		buildArgs: () => string[],
		ctx: any,
		signal?: AbortSignal,
	) {
		if (!hasIndex(ctx.cwd)) {
			return {
				content: [{ type: "text" as const, text: NOT_INDEXED_MSG }],
				details: {},
			};
		}
		try {
			const output = await runCodegraph(buildArgs(), ctx.cwd, signal);
			return {
				content: [{ type: "text" as const, text: output }],
				details: {},
			};
		} catch (e: any) {
			return wrapError(e);
		}
	}

	// ---- codegraph_explore ----
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
			return toolExec(() => ["explore", params.query], ctx, signal);
		},
	});

	// ---- codegraph_node ----
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
			return toolExec(
				() => {
					const args = ["node"];
					if (params.file) args.push("--file");
					if (params.offset) args.push("--offset", String(params.offset));
					if (params.limit) args.push("--limit", String(params.limit));
					args.push(params.name);
					return args;
				},
				ctx,
				signal,
			);
		},
	});

	// ---- codegraph_query ----
	pi.registerTool({
		name: "codegraph_query",
		label: "CodeGraph Query",
		description:
			"Search for symbols in the codebase. " +
			"Fuzzy-matches symbol names — useful when you don't know the exact name. " +
			"Returns symbol locations and their kinds.",
		promptSnippet: "Search symbols in the codebase",
		promptGuidelines: QUERY_GUIDELINES,
		parameters: Type.Object({
			search: Type.String({
				description:
					'Symbol name to search, e.g. "save_sku" or "QinsilkSpider"',
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return toolExec(() => ["query", params.search], ctx, signal);
		},
	});

	// ---- codegraph_status ----
	pi.registerTool({
		name: "codegraph_status",
		label: "CodeGraph Status",
		description:
			"Show index status: symbol count, file count, last sync time. " +
			"Use before explore/node to check if the index is current.",
		promptSnippet: "CodeGraph index status",
		promptGuidelines: [],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
			return toolExec(() => ["status"], ctx, signal);
		},
	});

	// ---- codegraph_files ----
	pi.registerTool({
		name: "codegraph_files",
		label: "CodeGraph Files",
		description:
			"Show project file structure from the CodeGraph index. " +
			"Returns a tree, flat list, or symbols-grouped-by-file view. " +
			"Supports directory and glob filtering.",
		promptSnippet: "Project file structure from the code index",
		promptGuidelines: FILES_GUIDELINES,
		parameters: Type.Object({
			filter: Type.Optional(
				Type.String({
					description:
						"Filter to files under this directory (root-relative, e.g. src/components)",
				}),
			),
			pattern: Type.Optional(
				Type.String({
					description: 'Glob pattern to match files, e.g. "*.ts"',
				}),
			),
			format: Type.Optional(
				Type.Union(
					[Type.Literal("tree"), Type.Literal("flat"), Type.Literal("grouped")],
					{ default: "tree" },
				),
			),
			maxDepth: Type.Optional(
				Type.Number({
					description: "Maximum directory depth for tree format",
				}),
			),
			includeMetadata: Type.Optional(
				Type.Boolean({
					description:
						"Include file metadata (language, symbol count). Default: true",
					default: true,
				}),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return toolExec(
				() => {
					const args = ["files"];
					if (params.filter) args.push("--filter", params.filter);
					if (params.pattern) args.push("--pattern", params.pattern);
					if (params.format) args.push("--format", params.format);
					if (params.maxDepth)
						args.push("--max-depth", String(params.maxDepth));
					if (params.includeMetadata === false) args.push("--no-metadata");
					return args;
				},
				ctx,
				signal,
			);
		},
	});

	// ---- codegraph_impact ----
	pi.registerTool({
		name: "codegraph_impact",
		label: "CodeGraph Impact",
		description:
			"Analyze what code is affected by changing a symbol. " +
			"Recursively finds direct and indirect callers, showing the blast radius. " +
			"Use before refactoring to understand downstream impact.",
		promptSnippet: "Analyze impact radius of changing a symbol",
		promptGuidelines: IMPACT_GUIDELINES,
		parameters: Type.Object({
			symbol: Type.String({
				description: "Symbol name to analyze impact for",
			}),
			depth: Type.Optional(
				Type.Number({
					description:
						"Traversal depth (1 = direct callers only, 2 = callers of callers). Default: 2",
					default: 2,
				}),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return toolExec(
				() => {
					const args = ["impact", params.symbol];
					if (params.depth) args.push("--depth", String(params.depth));
					return args;
				},
				ctx,
				signal,
			);
		},
	});
}

export default function codegraphExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!hasIndex(ctx.cwd)) return;

		const codegraphPath = resolveBinary("codegraph");
		if (!codegraphPath) return;

		registerTools(pi, codegraphPath);
	});
}
