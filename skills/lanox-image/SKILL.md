---
name: "lanox-image"
description: "Generate or edit raster images through the Lanox Image async API. Use when the user wants text-to-image generation or reference-image editing via supported Lanox image models with model-specific resolutions."
---

# Lanox Image

Generates or edits images by calling the Lanox Image async API (`POST /api/v2/lanox-images/generations` for text-to-image, `POST /api/v2/lanox-images/edits` for image editing), then polls `GET /api/v2/lanox-images/tasks/{taskId}` until the task completes.

## When to use

- The user wants asynchronous image generation or editing with a supported Lanox image model
- The user mentions "lanox-image" or "Lanox Image"

## When not to use

- The task is better handled by editing repo-native SVG, HTML/CSS, or canvas assets directly
- The user needs the older lanox-imagegen skill (which uses the Responses API with gpt-image-2)

## Execution path

This skill uses one execution path:

- `scripts/lanox_image.mjs`

The script:
- Creates an async task (generation or edit) via the Lanox Image API
- Polls the task status every 3 seconds until completion or failure
- Downloads the resulting PNG image and saves it locally
- Supports idempotency keys for safe retries

## Defaults

- Base URL: `https://api.lanox.ai`
- Default model: `lanox-image-2.5-flare`
- Aspect ratio and resolution: consult the selected model in [references/api.md](references/api.md), including whether each field is required, optional, or forbidden.
- Default output directory: `data/generated-images`
- Polling interval: 3000ms
- Max poll attempts: 120

## Authentication

Authentication is required. The script reads the API key from `auth.json` in the skill root directory (preferred), falling back to the `LANOX_API_KEY` environment variable.

**Before running the script, check if `auth.json` exists in the skill root.** If it does not exist or the key inside is empty, ask the user for their API key, then create the file:

```json
{
  "LANOX_API_KEY": "the_key_from_user"
}
```

Write the file using the Write tool. Do not commit `auth.json` to version control — it is listed in `.gitignore`.

## Workflow

1. Read [references/api.md](references/api.md) before selecting a model or constructing a request; model parameter rules differ.
2. Decide whether the request is generate or edit.
3. Collect only parameters supported by the selected model, plus the prompt, aspect ratio, resolution, and any input image.
4. If the user names a destination path, pass `--output-dir` so the final asset lands in the workspace where they want it.
5. Run the bundled script.
6. Inspect the saved result if the task depends on visual correctness.
7. Report the final file path(s), model used, task ID, and any error information.

## Supported models

- `lanox-image-2`
- `lanox-image-2.5-flare` (default)
- `lanox-image-2.5-sunburst`
- `lanox-banana-2`
- `lanox-grok-imagine`
- `lanox-grok-imagine-quality`

Use model-specific resolution and aspect-ratio constraints from [references/api.md](references/api.md).

## Image specifications

Aspect ratios and resolutions vary by model. Read [references/api.md](references/api.md) and use the selected model's documented values; check the selected values against the reference before running the examples below. Check the permitted values and whether each field must be included or omitted for generation versus editing. The script's defaults are implementation fallbacks, not constraints shared by all models; check the outgoing request against the reference.

### Output format

- Fixed: PNG
- Each task returns exactly 1 image

## Command patterns

Generate (text-to-image):

```powershell
node skills/lanox-image/scripts/lanox_image.mjs `
  --prompt "A cat sitting by a window watching the rain, centered subject, soft natural light, cinematic composition"
```

Edit (image editing):

```powershell
node skills/lanox-image/scripts/lanox_image.mjs `
  --edit `
  --prompt "Keep the subject, replace the background with a neon-lit night street, centered subject, realistic photography style" `
  --image .\input.png
```

Custom output directory:

```powershell
node skills/lanox-image/scripts/lanox_image.mjs `
  --prompt "A futuristic cityscape" `
  --output-dir .\output
```

With idempotency key (for safe retries):

```powershell
node skills/lanox-image/scripts/lanox_image.mjs `
  --prompt "A sunset over mountains" `
  --idempotency-key "my-unique-key-123"
```

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `LANOX_API_KEY` | API key (fallback if auth.json missing) | — |
| `LANOX_IMAGE_BASE_URL` | Base URL | `https://api.lanox.ai` |
| `LANOX_IMAGE_MODEL` | Model name | `lanox-image-2.5-flare` |
| `LANOX_IMAGE_PROMPT` | Image prompt | — |
| `LANOX_IMAGE_ASPECT_RATIO` | Aspect ratio; see the selected model in `references/api.md` | Model-specific; consult reference |
| `LANOX_IMAGE_RESOLUTION` | Resolution; see the selected model in `references/api.md` | Model-specific; consult reference |
| `LANOX_IMAGE_INPUT_IMAGE` | Input image path (edit mode) | — |
| `LANOX_IMAGE_IDEMPOTENCY_KEY` | Idempotency key | — |
| `LANOX_IMAGE_POLL_INTERVAL_MS` | Polling interval | 3000 |
| `LANOX_IMAGE_MAX_POLL_ATTEMPTS` | Max poll attempts | 120 |
| `LANOX_IMAGE_TIMEOUT_MS` | Total timeout | 180000 |
| `LANOX_IMAGE_OUTPUT_DIR` | Output directory | `data/generated-images` |

## Prompt guidance

Use a short structured spec when the user prompt is vague:

```text
Asset type: <icon/poster/hero/product image>
Primary request: <what to generate>
Style: <photo/illustration/3D/vector-like>
Composition: <framing and placement>
Lighting/mood: <lighting and mood>
Constraints: <must keep / must avoid>
```

Preserve detailed user prompts as-is when they are already specific.

## Error handling

The script handles the following error scenarios:

- **Task failed**: Returns the error code and message from the API
- **Timeout**: Reports if the task does not complete within the configured timeout
- **Download failed**: Reports HTTP status when downloading the result image
- **Invalid parameters**: Validates aspect ratio and resolution before creating the task

## Files

- `scripts/lanox_image.mjs`: execution script
- `references/api.md`: API reference documentation

