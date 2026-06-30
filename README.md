# rad-codegraph

[![GitHub](https://img.shields.io/badge/repo-github-blue)](https://github.com/dreanzy/pi_rad_codegraph)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![中文文档](https://img.shields.io/badge/lang-中文-red)](README.zh.md)

CodeGraph tools for [pi](https://pi.dev) Agent — registers `codegraph_explore` and `codegraph_node` as callable tools when a `.codegraph` index is present.

## Installation

```bash
# Make sure CodeGraph CLI is installed and your project is indexed first
npm install -g @colbymchenry/codegraph
cd /path/to/project
codegraph init -i

# Install rad-codegraph
pi install git:github.com/dreanzy/pi_rad_codegraph

# Restart pi
/reload
```

## How it works

This extension registers six custom tools that the LLM can call directly, replacing Read/Grep for indexed code:

| Tool | Purpose | Parameters |
|------|---------|------------|
| `codegraph_explore` | Primary exploration: returns source + call paths + blast radius | `query` (string) |
| `codegraph_node` | Read a file or symbol: line-numbered source + caller/callee trail | `name`, `file?`, `offset?`, `limit?` |
| `codegraph_query` | Fuzzy symbol search (when exact name is unknown) | `search` (string) |
| `codegraph_status` | Index health and sync status | none |
| `codegraph_files` | Project file structure: tree/flat/grouped view | `filter?`, `pattern?`, `format?`, `maxDepth?`, `includeMetadata?` |
| `codegraph_impact` | Blast radius analysis before refactoring | `symbol` (string), `depth?` |

**Tool registration is gated on `.codegraph` existence.** If the project has no `.codegraph` index, no tools are registered — zero token waste. If the index is later initialized, use `/reload` to pick it up.

Anti-pattern guidance is embedded in the tool descriptions and system prompt Guidelines section:

- Use `codegraph_explore` before Read/Grep
- Don't re-verify codegraph results with grep
- Don't reconstruct call flows by hand
- `codegraph_node` output is safe to Edit from — treat as already Read
- `codegraph_files` to explore project structure before reading files
- `codegraph_impact` before refactoring a symbol

## Requirements

- Node.js >= 22.19.0
- CodeGraph CLI (`npm install -g @colbymchenry/codegraph`)
- Project initialized (`codegraph init -i`)

## Development

```bash
git clone https://github.com/dreanzy/pi_rad_codegraph.git
cd pi_rad_codegraph
npm ci
npm test              # run tests
npm run typecheck     # type check

# Install locally to pi
pi install "$(pwd)"
```
