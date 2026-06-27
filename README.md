# rad-codegraph

[![GitHub](https://img.shields.io/badge/repo-github-blue)](https://github.com/dreanzy/pi_rad_codegraph)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![中文文档](https://img.shields.io/badge/lang-中文-red)](README.zh.md)

CodeGraph CLI guidance for [pi](https://pi.dev) Agent — injects usage hints when `.codegraph` index is present.

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

Verify the extension loaded:

```bash
pi list
# Should show rad-codegraph and its extensions
```

## How it works

This extension does **not** register custom tools. Instead, it checks for a `.codegraph` directory in the current working directory on each prompt, and if found, injects a brief reference into the system prompt telling the LLM how to use the `codegraph` CLI directly via bash commands.

If the project has no `.codegraph` directory, nothing is injected — zero token waste.

## Client commands reference

The LLM is guided to use these `codegraph` CLI commands:

| Command | Purpose |
|---------|---------|
| `codegraph query <search>` | Quick symbol search by name |
| `codegraph explore <query...>` | Explore area: symbols + call paths |
| `codegraph node <name>` | Symbol source + caller/callee trail |
| `codegraph files` | Project file structure from index |
| `codegraph callers <symbol>` | Find callers of a symbol |
| `codegraph callees <symbol>` | Find callees of a symbol |
| `codegraph impact <symbol>` | Change impact analysis |
| `codegraph status` | Index health |

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
