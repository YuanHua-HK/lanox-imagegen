#!/usr/bin/env node
// SQLBot HTTP client — wraps the endpoints exposed by backend/apps/mcp/mcp.py.
//
// These are the same routes that `fastapi-mcp` re-exposes as MCP tools, but they
// are plain FastAPI POST endpoints under `/api/v1/mcp/*`, whitelisted so no
// Authorization header is required (the per-request token travels in the body /
// query, exactly like the MCP flow).
//
// Zero dependencies. Requires Node >= 18 (global fetch / Web Streams).
//
// SESSION / AUTH (auth.json):
//   `auth login` calls mcp_start to get a (short-lived) token + chat_id and
//   caches ONLY those in <skill>/auth.json — the username/password are used for
//   the request and then discarded, never written to disk. Every other command
//   resolves the token from auth.json automatically; when the JWT `exp` has
//   passed (or the server answers 401/403) it fails clearly and asks you to
//   `auth login` again (there are no stored credentials to auto-refresh with).
//   Pass -t/--token (or SQLBOT_TOKEN) to bypass auth.json with an explicit token.
//
// Endpoint contract (full write-up in references/endpoints.md):
//   POST /api/v1/mcp/mcp_start       body  {username, password}          -> {code,data:{access_token,chat_id},msg}
//   POST /api/v1/mcp/mcp_ws_list     query ?token=...                    -> {code,data:[{id,name}],msg}
//   POST /api/v1/mcp/mcp_ds_list     body  {token, oid?}                 -> {code,data:[ds...],msg}
//   POST /api/v1/mcp/mcp_question    body  {token, chat_id, question...} -> raw (markdown stream | {success,...})
//   POST /api/v1/mcp/mcp_assistant   body  {question, url, authorization}-> raw (markdown stream | {success,...})

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// auth.json (secrets) and config.json (non-secret address) live in the skill
// root (one level up from scripts/).
const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_PATH = path.join(SKILL_ROOT, 'auth.json');
const CONFIG_PATH = path.join(SKILL_ROOT, 'config.json');

const HELP = `sqlbot — query a SQLBot instance over HTTP

USAGE
  node sqlbot.mjs <command> [options]

GLOBAL OPTIONS
  -b, --base-url <url>   SQLBot base URL  (precedence: flag > SQLBOT_BASE_URL > config.json > default http://bot.wgcards.com)
      --context <path>   server CONTEXT_PATH  (env SQLBOT_CONTEXT_PATH, config.json, default "")
      --raw              print the raw server response (skip envelope unwrapping)
  -h, --help             show this help

CONFIG (non-secret deployment settings -> config.json; commit/edit per environment)
  config set   Persist the SQLBot address so hermes (or any host on a different
               network than the service) reaches the right endpoint.
    -b, --base-url <url>      e.g. http://sqlbot.internal:8000
        --context <path>      server CONTEXT_PATH (default "")
  config show  Print the *effective* config (after flag/env/config.json/default).

SESSION
  auth login   Open a session (writes auth.json with the token only).
    -u, --username <name>   (env SQLBOT_USERNAME)
    -p, --password <pass>   (env SQLBOT_PASSWORD)
    -> caches token + chat_id only (credentials are NOT stored); prints a summary

  auth status  Show the cached session (never prints the full token).
  auth refresh Get a new token; re-supply -u/-p (or SQLBOT_USERNAME/PASSWORD).
  auth logout  Forget the session (deletes auth.json).

DATA COMMANDS (token auto-resolved from auth.json; expiry/401/403 -> re-login)
  ws-list      List workspaces (organizations).
        --oid is ignored here.
    -> [{"id": 1, "name": "..."}]

  ds-list      List datasources.
        --oid <id>          workspace id (optional; defaults to last-used workspace)
    -> [{...datasource...}]

  question     Ask a natural-language question.
    -c, --chat-id <id>          (defaults to the chat_id cached at login)
    -q, --question <text>
    -d, --datasource-id <id>    only used when the chat has no datasource yet
        --oid <id>              workspace id (only used when --datasource-id is empty)
        --lang <code>           zh-CN | zh-TW | en | ko-KR  (default zh-CN)
        --stream                stream markdown to stdout instead of returning JSON
        --img                   also generate a chart image (needs the picture service)
    -> {"success": true, "record_id", "sql", "data", "chart", "image_url"}

  assistant    Ask via the third-party "assistant" data interface (no auth.json needed).
    -q, --question <text>   --url <endpoint>   --authorization <cred>   [--stream]

  start        Stateless mcp_start (does NOT write auth.json). Prefer \`auth login\`.
    -u/--username  -p/--password

EXPLICIT-TOKEN OVERRIDE (skips auth.json, no auto-refresh)
  -t, --token <jwt>   (env SQLBOT_TOKEN)

EXAMPLES
  node sqlbot.mjs auth login -u admin -p 'SQLBot@123'
  node sqlbot.mjs ds-list --oid 1
  node sqlbot.mjs question -q "近30天销售额前十的产品" -d 1
  node sqlbot.mjs question -q "只看华东地区"          # reuses cached chat_id
  node sqlbot.mjs auth status
`;

// ---------- arg parsing ----------

const ALIASES = {
  '-b': '--base-url', '-h': '--help', '-u': '--username', '-p': '--password',
  '-t': '--token', '-c': '--chat-id', '-q': '--question', '-d': '--datasource-id',
};
const BOOLS = new Set(['--help', '--raw', '--stream', '--img']);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    let tok = argv[i];
    if (tok.startsWith('-')) {
      if (ALIASES[tok]) tok = ALIASES[tok];
      const key = tok.replace(/^--/, '');
      if (BOOLS.has(tok)) {
        out[key] = true;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('-')) out[key] = true;
        else { out[key] = next; i++; }
      }
    } else {
      out._.push(tok);
    }
  }
  return out;
}

function fail(msg, code = 1) {
  process.stderr.write(`[sqlbot] error: ${msg}\n`);
  process.exit(code);
}

// ---------- auth.json ----------

function loadAuth() {
  try { return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8')); }
  catch { return {}; }
}

function saveAuth(obj) {
  // 0600: owner read/write only (best-effort; ignored on some Windows filesystems).
  fs.writeFileSync(AUTH_PATH, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(AUTH_PATH, 0o600); } catch { /* ignore on platforms without POSIX modes */ }
}

// ---------- config.json (non-secret: base_url / context) ----------

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}

function saveConfig(obj) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(obj, null, 2) + '\n');
}

// Resolve the effective endpoint. Precedence: flag > env > config.json > auth.json (legacy) > default.
function baseConfig(args, auth, config) {
  const baseUrl = (
    args['base-url'] || process.env.SQLBOT_BASE_URL || config.base_url || auth.base_url || 'http://bot.wgcards.com'
  ).replace(/\/+$/, '');
  const context = (
    args['context'] ?? process.env.SQLBOT_CONTEXT_PATH ?? config.context ?? auth.context ?? ''
  ).replace(/\/+$/, '');
  return { baseUrl, context, prefix: `${baseUrl}${context}/api/v1/mcp` };
}

// ---------- JWT expiry ----------

function jwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch { return null; }
}

// True if the token has an `exp` claim that is at/over the deadline (with skew).
function tokenExpired(token, skewSec = 30) {
  const p = jwtPayload(token);
  if (!p || typeof p.exp !== 'number') return false; // unknown exp -> rely on reactive 401/403
  return Date.now() / 1000 + skewSec >= p.exp;
}

function expIso(token) {
  const p = jwtPayload(token);
  return p && typeof p.exp === 'number' ? new Date(p.exp * 1000).toISOString() : null;
}

// ---------- http ----------

// Low-level request that NEVER process.exit()s on a bad status — callers inspect .status.
async function request(url, { body, accept = 'application/json' } = {}) {
  let res;
  try {
    const init = { method: 'POST', headers: { Accept: accept } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    res = await fetch(url, init);
  } catch (e) {
    fail(`cannot reach SQLBot at ${url} (${e.message}). Is the backend running? Check --base-url / SQLBOT_BASE_URL.`);
  }
  const text = await res.text().catch(() => '');
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = undefined; }
  return { status: res.status, ok: res.ok, res, text, json };
}

function unwrap(json, raw) {
  if (raw) return json;
  if (json && typeof json === 'object' && 'code' in json && 'data' in json && 'msg' in json) {
    if (json.code !== 0) fail(`server returned code=${json.code}: ${json.msg ?? ''}`);
    return json.data;
  }
  return json;
}

function out(value) {
  if (typeof value === 'string') process.stdout.write(value.endsWith('\n') ? value : value + '\n');
  else process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function errDetail(r) {
  if (typeof r.json === 'string') return r.json;
  if (r.json !== undefined) return JSON.stringify(r.json);
  return r.text || `HTTP ${r.status}`;
}

// ---------- session ----------

function resolveCreds(args) {
  return {
    username: args.username || process.env.SQLBOT_USERNAME,
    password: args.password || process.env.SQLBOT_PASSWORD,
  };
}

// Raw mcp_start: returns {access_token, chat_id}.
async function mcpStart(cfg, username, password) {
  const r = await request(`${cfg.prefix}/mcp_start`, { body: { username, password } });
  if (!r.ok) fail(`login failed (HTTP ${r.status}): ${errDetail(r)}`);
  return unwrap(r.json, false);
}

// Obtain a fresh token with the given credentials and persist token-only.
// The credentials are used for this request and then discarded — never written.
async function startAndPersist(cfg, username, password) {
  const data = await mcpStart(cfg, username, password);
  const auth = {
    token: data.access_token,
    chat_id: data.chat_id,
    token_obtained_at: new Date().toISOString(),
  };
  saveAuth(auth);
  return auth;
}

// Resolve a usable {token, chat_id}. Returns explicit token if -t/SQLBOT_TOKEN set.
// No stored credentials means no auto-refresh: a missing/expired token fails clearly.
async function resolveSession(cfg, args) {
  const explicitToken = args.token || process.env.SQLBOT_TOKEN;
  if (explicitToken) return { token: explicitToken, chat_id: undefined, explicit: true };
  const auth = loadAuth();
  if (!auth.token) fail('not logged in. Run: node sqlbot.mjs auth login -u <user> -p <pass>');
  if (tokenExpired(auth.token)) fail('session expired. Run: node sqlbot.mjs auth login -u <user> -p <pass>');
  return { token: auth.token, chat_id: auth.chat_id, explicit: false };
}

// Run an authed request. With no stored credentials we cannot re-authenticate,
// so a 401/403 on a cached token fails clearly and asks for a fresh login.
async function authedRequest(cfg, args, build, { accept = 'application/json' } = {}) {
  const sess = await resolveSession(cfg, args);
  const { url, body } = build(sess.token, sess.chat_id);
  const r = await request(url, { body, accept });
  if (!sess.explicit && (r.status === 401 || r.status === 403)) {
    fail('session expired or invalid. Run: node sqlbot.mjs auth login -u <user> -p <pass>');
  }
  return { r, sess };
}

// ---------- streaming ----------

async function streamResponse(cfg, args, build) {
  const sess = await resolveSession(cfg, args);
  const { url, body } = build(sess.token, sess.chat_id);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    fail(`cannot reach SQLBot at ${url} (${e.message}).`);
  }
  if ((res.status === 401 || res.status === 403) && !sess.explicit) {
    fail('session expired or invalid. Run: node sqlbot.mjs auth login -u <user> -p <pass>');
  }
  if (!res.ok) fail(`HTTP ${res.status} from ${url}: ${await res.text().catch(() => '')}`);
  if (!res.body) { process.stdout.write(await res.text()); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value, { stream: true }));
  }
  process.stdout.write(decoder.decode());
  process.stdout.write('\n');
}

function reportQuestionJson(r) {
  if (!r.ok && !(r.json && r.json.success === false)) fail(`HTTP ${r.status}: ${errDetail(r)}`);
  if (r.json && typeof r.json === 'object' && r.json.success === false) {
    fail(`question failed: ${r.json.message ?? JSON.stringify(r.json)}`);
  }
  out(r.json ?? r.text);
}

// ---------- commands: config ----------

function cmdConfig(args, cfg) {
  const sub = args._[1];
  if (sub === 'set') return configSet(args);
  if (sub === 'show' || sub === undefined) return configShow(cfg);
  fail(`unknown config subcommand "${sub}". Use: set | show`);
}

function configSet(args) {
  if (args['base-url'] === undefined && args.context === undefined) {
    fail('config set requires --base-url and/or --context. Example: config set --base-url http://sqlbot.internal:8000');
  }
  const cur = loadConfig();
  if (args['base-url'] !== undefined) cur.base_url = String(args['base-url']).replace(/\/+$/, '');
  if (args.context !== undefined) {
    const c = String(args.context).replace(/\/+$/, '');
    if (c) cur.context = c; else delete cur.context;
  }
  saveConfig(cur);
  out({ saved: CONFIG_PATH, ...cur });
}

function configShow(cfg) {
  out({
    config_file: CONFIG_PATH,
    base_url: cfg.baseUrl,
    context: cfg.context || '',
    endpoint_prefix: cfg.prefix,
  });
}

// ---------- commands: auth ----------

async function cmdAuth(args, cfg) {
  const sub = args._[1];
  if (sub === 'login') return authLogin(args, cfg);
  if (sub === 'status') return authStatus();
  if (sub === 'refresh') return authRefresh(args, cfg);
  if (sub === 'logout') return authLogout();
  fail(`unknown auth subcommand "${sub ?? ''}". Use: login | status | refresh | logout`);
}

async function authLogin(args, cfg) {
  const { username, password } = resolveCreds(args);
  if (!username || !password) fail('auth login requires --username/-u and --password/-p (or SQLBOT_USERNAME / SQLBOT_PASSWORD).');
  // If an address was given explicitly on this login, persist it to config.json
  // (non-secret) so later commands reach the same endpoint without re-passing it.
  if (args['base-url'] !== undefined || args.context !== undefined) {
    const c = loadConfig();
    c.base_url = cfg.baseUrl;
    if (cfg.context) c.context = cfg.context; else delete c.context;
    saveConfig(c);
  }
  // Token only — the credentials are used for mcp_start and then discarded.
  const auth = await startAndPersist(cfg, username, password);
  out({
    base_url: cfg.baseUrl,
    chat_id: auth.chat_id,
    token_expires_at: expIso(auth.token),
    auth_file: AUTH_PATH,
    config_file: CONFIG_PATH,
  });
}

function authStatus() {
  const auth = loadAuth();
  const config = loadConfig();
  if (!auth.token) {
    out({ logged_in: false, auth_file: AUTH_PATH, base_url: config.base_url || null });
    return;
  }
  out({
    logged_in: true,
    auth_file: AUTH_PATH,
    base_url: config.base_url || null,
    has_token: true,
    chat_id: auth.chat_id ?? null,
    token_obtained_at: auth.token_obtained_at || null,
    token_expires_at: expIso(auth.token),
    token_expired: tokenExpired(auth.token, 0),
  });
}

async function authRefresh(args, cfg) {
  const { username, password } = resolveCreds(args);
  if (!username || !password) fail('auth refresh requires --username/-u and --password/-p (or SQLBOT_USERNAME / SQLBOT_PASSWORD) — credentials are not stored.');
  const auth = await startAndPersist(cfg, username, password);
  out({ refreshed: true, chat_id: auth.chat_id, token_expires_at: expIso(auth.token) });
}

function authLogout() {
  try { fs.unlinkSync(AUTH_PATH); } catch { /* already gone */ }
  out({ logged_out: true, removed: AUTH_PATH });
}

// ---------- commands: data ----------

async function cmdStart(args, cfg) {
  const { username, password } = resolveCreds(args);
  if (!username || !password) fail('start requires --username/-u and --password/-p (or env). For a persistent session use `auth login`.');
  out(await mcpStart(cfg, username, password));
}

async function cmdWsList(args, cfg) {
  // mcp_ws_list reads `token` as a QUERY param (bare str on the FastAPI route).
  const { r } = await authedRequest(cfg, args, (token) => ({
    url: `${cfg.prefix}/mcp_ws_list?token=${encodeURIComponent(token)}`,
    body: undefined,
  }));
  if (!r.ok) fail(`HTTP ${r.status}: ${errDetail(r)}`);
  out(unwrap(r.json, args.raw));
}

async function cmdDsList(args, cfg) {
  const { r } = await authedRequest(cfg, args, (token) => ({
    url: `${cfg.prefix}/mcp_ds_list`,
    body: clean({ token, oid: args.oid }),
  }));
  if (!r.ok) fail(`HTTP ${r.status}: ${errDetail(r)}`);
  out(unwrap(r.json, args.raw));
}

function questionBody(args, token, chatId) {
  if (chatId === undefined || chatId === null || chatId === '') {
    fail('no chat_id available. Pass --chat-id/-c, or run `auth login` so a chat_id is cached.');
  }
  return clean({
    token,
    chat_id: Number(chatId),
    question: args.question,
    datasource_id: args['datasource-id'],
    oid: args.oid,
    lang: args.lang || 'zh-CN',
    stream: !!args.stream,
    return_img: !!args.img,
  });
}

async function cmdQuestion(args, cfg) {
  if (!args.question) fail('question requires --question/-q.');
  const build = (token, cachedChatId) => ({
    url: `${cfg.prefix}/mcp_question`,
    body: questionBody(args, token, args['chat-id'] ?? cachedChatId),
  });
  if (args.stream) return streamResponse(cfg, args, build);
  const { r } = await authedRequest(cfg, args, build);
  reportQuestionJson(r);
}

async function cmdAssistant(args, cfg) {
  if (!args.question) fail('assistant requires --question/-q.');
  if (!args.url) fail('assistant requires --url.');
  if (!args.authorization) fail('assistant requires --authorization.');
  const body = clean({ question: args.question, url: args.url, authorization: args.authorization, stream: !!args.stream });
  const url = `${cfg.prefix}/mcp_assistant`;
  if (args.stream) {
    // assistant has no token; stream directly.
    return streamResponse(cfg, { ...args, token: 'n/a' }, () => ({ url, body }));
  }
  reportQuestionJson(await request(url, { body }));
}

// ---------- dispatch ----------

const COMMANDS = {
  config: cmdConfig,
  auth: cmdAuth,
  start: cmdStart,
  'ws-list': cmdWsList,
  'ds-list': cmdDsList,
  question: cmdQuestion,
  assistant: cmdAssistant,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (args.help || !cmd) {
    process.stdout.write(HELP);
    process.exit(cmd || args.help ? 0 : 1);
  }
  const handler = COMMANDS[cmd];
  if (!handler) fail(`unknown command "${cmd}". Run with --help to see available commands.`);
  await handler(args, baseConfig(args, loadAuth(), loadConfig()));
}

main().catch((e) => fail(e?.stack || e?.message || String(e)));
