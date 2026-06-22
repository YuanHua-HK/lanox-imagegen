---
name: sqlbot
description: 通过 HTTP 调用 SQLBot 实例做自然语言查数（Text-to-SQL）。当用户想用自然语言向某个数据库/数据源提问、查看 SQLBot 里的工作空间或数据源列表、或把 SQLBot 的问答能力接入流程时使用。等价于 SQLBot 的 MCP 工具（mcp_start / mcp_ws_list / mcp_datasource_list / mcp_question / mcp_assistant），但走普通 HTTP 端点，不需要 MCP 客户端。Use when the user wants to ask a SQLBot instance a natural-language data question, list its workspaces/datasources, or otherwise drive SQLBot over HTTP instead of MCP.
---

# SQLBot skill

用 HTTP 调 SQLBot 做自然语言查数。脚本 `scripts/sqlbot.mjs`（Node ≥ 18，零依赖）。
地址存 `config.json`，账号/密码/token 存 `auth.json`（token 自动续期）。所有命令都从这两个文件取配置，无需手动传地址或 token。

## 使用流程

1. `auth status` —— 看是否已就绪。
2. 没配地址或要换地址：`config set --base-url <SQLBot 地址>`（默认 `http://bot.wgcards.com`）。
3. 显示 `logged_in:false`：**先向用户索要 SQLBot 账号和密码**（不要编造），再 `auth login -u <账号> -p <密码>`。
4. 就绪后直接查数 —— token 和 chat_id 自动取用，过期自动重登。

## 命令

```bash
# 配置（每个部署做一次）
node scripts/sqlbot.mjs config set --base-url http://sqlbot.internal:8000   # 后端配了 CONTEXT_PATH 再加 --context /xxx
node scripts/sqlbot.mjs auth login -u <账号> -p <密码>

# 查数
node scripts/sqlbot.mjs ws-list                          # 工作空间列表
node scripts/sqlbot.mjs ds-list [--oid <空间id>]          # 数据源列表（取 -d 用的 id）
node scripts/sqlbot.mjs question -q "<问题>" -d <数据源id>  # 提问
node scripts/sqlbot.mjs question -q "<追问>"               # 同会话追问，复用 chat_id，省略 -d

# 会话
node scripts/sqlbot.mjs auth status        # 登录状态
node scripts/sqlbot.mjs auth logout        # 退出
```

`question` 返回 JSON `{ success, record_id, sql, data, chart }`；加 `--stream` 则输出流式 markdown。

## 规则

- 首次务必先问用户账号密码再 `auth login`；账号密码**不落盘**，`auth.json` 只存 token + chat_id（已 gitignore，勿提交）。token 过期后需重新 `auth login`（无自动续期）。
- `question` 默认不出图（依赖出图服务），需要图片且服务可用时加 `--img`。
- 第三方接口取数（少用）：`assistant -q "<问题>" --url <接口> --authorization <凭证>`。
- 端点细节见 [references/endpoints.md](references/endpoints.md)。
