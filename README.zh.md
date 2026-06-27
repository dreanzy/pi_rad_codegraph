# rad-codegraph

[![GitHub](https://img.shields.io/badge/repo-github-blue)](https://github.com/dreanzy/pi_rad_codegraph)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue)](README.md)

为 [pi](https://pi.dev) Agent 注入 CodeGraph CLI 使用引导——当项目下有 `.codegraph` 索引时自动提示。

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

验证扩展已加载：

```bash
pi list
# 应显示 rad-codegraph 及其扩展
```

## 工作原理

本扩展**不注册任何自定义工具**。每次用户发送消息时，它检查当前目录下是否存在 `.codegraph` 目录：

- **有** → 在 system prompt 中注入一段简短指引，告诉 LLM 如何通过 bash 直接调用 `codegraph` CLI
- **无** → 什么都不注入，不浪费 token

## CLI 命令参考

引导 LLM 使用的 `codegraph` CLI 命令：

| 命令 | 用途 |
|------|------|
| `codegraph query <search>` | 按名称搜索符号 |
| `codegraph explore <query...>` | 探索区域：符号 + 调用路径 |
| `codegraph node <name>` | 符号源码 + 调用者/被调用者链 |
| `codegraph files` | 项目文件结构 |
| `codegraph callers <symbol>` | 查找调用某符号的函数 |
| `codegraph callees <symbol>` | 查找某符号调用的函数 |
| `codegraph impact <symbol>` | 变更影响分析 |
| `codegraph status` | 索引健康状态 |

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
