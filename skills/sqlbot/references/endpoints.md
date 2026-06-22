# SQLBot MCP-equivalent HTTP endpoints

Source of truth: `backend/apps/mcp/mcp.py` (routes), `backend/main.py` (the
`FastApiMCP(... include_operations=[...])` wrapper), `backend/apps/chat/api/chat.py`
(`question_answer_inner` / `stream_sql`), and `backend/apps/chat/task/llm.py`
(`run_task` — the response shape).

All routes live under `{base_url}{CONTEXT_PATH}/api/v1/mcp/`. `CONTEXT_PATH`
defaults to `""`, so the prefix is normally `http://<host>:8000/api/v1/mcp`.

## Auth model

`/mcp*` is in `common/utils/whitelist.py`, so `TokenMiddleware` skips it — **no
`Authorization` header is required**. Authentication is per-request:
`mcp_start` exchanges username/password for a short-lived JWT `access_token`,
and the other endpoints validate that token (in the body, or query for
`mcp_ws_list`). This mirrors exactly how the MCP tools authenticate.

## Response envelope (important)

`common/core/response_middleware.py` wraps most JSON responses in
`{"code": 0, "data": <payload>, "msg": null}`. **Exceptions** (returned verbatim):

- paths in `direct_paths`: `mcp_question`, `mcp_assistant`
- `openapi.json`, `docs`, `redoc`

So:

- `mcp_start`, `mcp_ws_list`, `mcp_ds_list` → **wrapped** (`{code,data,msg}`).
- `mcp_question`, `mcp_assistant` → **raw** (markdown stream, or a single JSON object).

Error responses from `HTTPException` are returned with the proper status code and
a JSON-encoded **string** body (just the detail message), per `exception_handler`.

`scripts/sqlbot.mjs` unwraps the envelope automatically (`--raw` to disable).

---

## `POST /mcp_start`  (operation_id `mcp_start`)

**Body** (`ChatStart`): `{ "username": str, "password": str }`

**Returns** (wrapped): `data = { "access_token": str, "chat_id": int }`

Authenticates, mints a JWT (`ACCESS_TOKEN_EXPIRE_MINUTES`), and creates a new
chat with `origin=1` (MCP). Errors: 400 incorrect credentials / no workspace.

---

## `POST /mcp_ws_list`  (operation_id `mcp_ws_list`)

**Query** (NOT body): `?token=<access_token>`
— the route signature is `token: str`, a bare scalar, which FastAPI binds as a
**query parameter**. This is the one endpoint that does not take a JSON body.

**Returns** (wrapped): `data = [ { "id": int, "name": str }, ... ]`

The workspaces (organizations) the user belongs to. `name` may be an i18n key
resolved server-side.

---

## `POST /mcp_ds_list`  (operation_id `mcp_datasource_list`)

**Body** (`McpDs`): `{ "token": str, "oid"?: str }`
`oid` = workspace id; if omitted, the user's last-used workspace is used. If the
user is not a member of `oid`, returns 400.

**Returns** (wrapped): `data = [ <datasource dict>, ... ]`
The server strips `embedding`, `table_relation`, `recommended_config`, and
`configuration` from each datasource before returning.

---

## `POST /mcp_question`  (operation_id `mcp_question`)

**Body** (`McpQuestion`):

| field | type | default | notes |
|---|---|---|---|
| `token` | str | — | access_token |
| `chat_id` | int | — | from `mcp_start` |
| `question` | str | — | natural-language question |
| `stream` | bool | `true` | server default; the client sends `false` unless `--stream` |
| `lang` | str | `zh-CN` | `zh-CN` \| `zh-TW` \| `en` \| `ko-KR` |
| `datasource_id` | int\|str | null | only honored when the chat has no datasource yet |
| `oid` | str | null | only honored when `datasource_id` is empty |
| `return_img` | bool | `true` | client sends `false` unless `--img` |

Runs to `finish_step=GENERATE_CHART` (SQL → data → chart [→ image]).

**Returns — raw, NOT enveloped:**

- `stream=true` → `text/event-stream` whose chunks are plain **Markdown**
  (a `> record id` header, a ```sql block```, a results table, and an
  `![chart](image_url)` line if `return_img`). Concatenate the chunks.
- `stream=false` → a single JSON object:

```json
{
  "success": true,
  "record_id": 123,
  "title": "可选，自动生成的会话标题",
  "sql": "SELECT ...",
  "data": { "fields": [...], "data": [...] },
  "chart": { "type": "bar", "...": "..." },
  "image_url": "http://.../images/...png"   // only when return_img and generation succeeded
}
```

On failure: `{ "success": false, "message": "<error>" }` with HTTP 500.

`return_img=true` depends on SQLBot's picture service; if it is unavailable, a
non-table chart request raises and the whole call fails. Keep it off unless the
service is deployed (the client defaults it off).

---

## `POST /mcp_assistant`  (operation_id `mcp_assistant`)

**Body** (`McpAssistant`): `{ "question": str, "url": str, "authorization": str, "stream"?: bool }`

A self-contained flow for the "Cordys CRM"-style assistant: it builds a
synthetic system user (`oid=1`), creates a chat, attaches the third-party
endpoint (`url` + `authorization`) as the datasource, and asks. Runs only to
`finish_step=QUERY_DATA` (SQL → data; **no chart / image**).

**Returns — raw, NOT enveloped:** same shape as `mcp_question` with `stream`
(markdown stream vs JSON), but the JSON typically has no `chart`/`image_url`.

---

## Not exposed

`get_model_list` appears in `include_operations` in `main.py`, but its route in
`mcp.py` is commented out — so there is no model-list endpoint to call.
