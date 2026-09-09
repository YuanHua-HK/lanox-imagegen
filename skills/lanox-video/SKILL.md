---
name: "lanox-video"
description: "Generate videos asynchronously through the unified Lanox-Video API. Use for text-to-video, first-frame, reference-media generation, and video editing with supported models."
---

# Lanox Video

Default model is `dreamina-seedance-2-5-260628` (Seedance 2.5). Use `scripts/lanox_video.mjs` to create a task at `POST /api/v2/lanox-videos/generations`, poll `GET /api/v2/lanox-videos/tasks/{taskId}`, and download `content.video_url` when succeeded.

## Authentication

The script reads `auth.json` in this skill directory, then `LANOX_API_KEY`. Ask for a key if neither is available. Do not commit `auth.json`.

## Supported models

- Seedance: `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini-260615`, `dreamina-seedance-2-5-260628` (default), `doubao-seedance-2-0-260128`
- Grok: `grok-imagine-video`, `grok-imagine-video-1.5`, `grok-imagine-video-1.5-preview`
- HappyHorse: `happyhorse-1.1-t2v`, `happyhorse-1.1-i2v`, `happyhorse-1.1-r2v`, `happyhorse-1.0-video-edit`
- Wan: `wan3.0-video`, `wan2.7-t2v-2026-06-12`, `wan2.7-i2v-2026-04-25`, `wan2.7-r2v-2026-06-12`, `wan2.7-videoedit`

The list reflects the supplied API document; actual availability and parameters depend on the live model catalog. `--model` overrides `LANOX_VIDEO_MODEL`, which overrides the default. Resolve user shorthand `sd2.5` to `dreamina-seedance-2-5-260628` before calling the API.

## Usage

Read [references/api.md](references/api.md) before every model-specific request. Use that document's content-role matrix and top-level field whitelist; do not send fields merely because another video model supports them.

```powershell
node skills/lanox-video/scripts/lanox_video.mjs --prompt "A corgi surfing at sunset" --model dreamina-seedance-2-5-260628
node skills/lanox-video/scripts/lanox_video.mjs --prompt "Animate this character" --image https://example.com/frame.png --image-role first_frame
node skills/lanox-video/scripts/lanox_video.mjs --prompt "Edit this clip" --video https://example.com/source.mp4 --video-role video
```

Use `--image`, `--video`, and `--audio` for URL media; repeat `--image` for references. The script sends `content[]` and preserves explicit roles. Resolution, ratio, duration, and other parameters vary by model: check whether each field is required, optional, or forbidden for the selected input mode, and use the values documented for the selected model in [references/api.md](references/api.md). Query `/v1/models` or `/api/v1/model/params` when capabilities are uncertain.

## Response handling

HTTP 200 can be either a bare `{id}` success, a bare task object, or an `ApiResponse` error envelope with `code`/`codeMsg`; only a non-empty `id` without an error code is a created task. Poll every 10–30 seconds. Stop on `succeeded`, `failed`, `cancelled`, or `expired`. Download results promptly because URLs expire.

See [references/api.md](references/api.md) for the model and content-role matrix.

