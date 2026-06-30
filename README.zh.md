# rad-codegraph

[![GitHub](https://img.shields.io/badge/repo-github-blue)](https://github.com/dreanzy/pi_rad_codegraph)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue)](README.md)

为 [pi](https://pi.dev) Agent 注册六个自定义工具——项目下有 `.codegraph` 索引时自动启用。

## 安装

```bash
# 先确保已安装 CodeGraph CLI 并初始化项目索引
npm install -g @colbymchenry/codegraph
cd /path/to/project
codegraph init -i

# 安装 rad-codegraph
pi install git:github.com/dreanzy/pi_rad_codegraph

# 重启 pi
/reload
```

## 工作原理

本扩展注册六个自定义工具，LLM 可直接调用，替代 Read/Grep：

| 工具 | 用途 | 参数 |
|------|------|------|
| `codegraph_explore` | 主入口：查询源码 + 调用路径 + 波及范围 | `query`（字符串） |
| `codegraph_node` | 读文件/符号：行号源码 + 调用者/被调用者链 | `name`, `file?`, `offset?`, `limit?` |
| `codegraph_query` | 模糊搜索符号（不确定确切名称时） | `search`（字符串） |
| `codegraph_status` | 索引健康度和同步状态 | 无 |
| `codegraph_files` | 项目文件结构：树/平铺/按文件分组 | `filter?`, `pattern?`, `format?`, `maxDepth?`, `includeMetadata?` |
| `codegraph_impact` | 重构前的波及范围分析 | `symbol`（字符串）, `depth?` |

**工具注册取决于 `.codegraph` 是否存在。** 无索引的项目不会注册任何工具——零 token 浪费。索引初始化后需 `/reload` 才会加载工具。

反模式引导嵌入在工具描述和 system prompt 的 Guidelines 段中：

- `codegraph_explore` 优先于 Read/Grep
- 不要用 grep 验证 codegraph 的结果
- 不要手工重建调用流程
- `codegraph_node` 输出的行号源码可直接用于 Edit，视为已 Read
- `codegraph_files` 先用来探索项目结构再读文件
- `codegraph_impact` 重构某个符号前先用它分析波及范围

## 环境要求

- Node.js >= 22.19.0
- CodeGraph CLI（`npm install -g @colbymchenry/codegraph`）
- 项目已初始化（`codegraph init -i`）

## 开发

```bash
git clone https://github.com/dreanzy/pi_rad_codegraph.git
cd pi_rad_codegraph
npm ci
npm test              # 运行测试
npm run typecheck     # 类型检查

# 本地安装到 pi
pi install "$(pwd)"
```
