---
name: "lanox-image-2"
description: "Generate or edit raster images through the Lanox Image-2 async API. Use when the user wants text-to-image generation or reference-image editing via the lanox-image-2 model with high-resolution output (up to 4k)."
---

# Lanox Image-2

Generates or edits images by calling the Lanox Image-2 async API (`POST /api/v2/lanox-images/generations` for text-to-image, `POST /api/v2/lanox-images/edits` for image editing), then polls `GET /api/v2/lanox-images/tasks/{taskId}` until the task completes.

## When to use

- The user wants high-resolution image generation (1080p, 2k, 4k)
- The user wants to edit an existing image with the lanox-image-2 model
- The user asks for images with specific aspect ratios (1:1, 4:3, 3:4, 16:9, 9:16)
- The user mentions "lanox-image-2" or "Lanox Image-2"

## When not to use

- The task is better handled by editing repo-native SVG, HTML/CSS, or canvas assets directly
- The user needs the older lanox-imagegen skill (which uses the Responses API with gpt-image-2)

## Execution path

This skill uses one execution path:

- `scripts/lanox_image_2.mjs`

The script:
- Creates an async task (generation or edit) via the Lanox Image-2 API
- Polls the task status every 3 seconds until completion or failure
- Downloads the resulting PNG image and saves it locally
- Supports idempotency keys for safe retries

## Defaults

- Base URL: `https://api.lanox.ai`
- Model: `lanox-image-2`
- Default aspect ratio: `1:1`
- Default resolution: `1080p`
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

1. Decide whether the request is generate or edit.
2. Collect the prompt, aspect ratio, resolution, and any input image (for edit mode).
3. If the user names a destination path, pass `--output-dir` so the final asset lands in the workspace where they want it.
4. Run the bundled script.
5. Inspect the saved result if the task depends on visual correctness.
6. Report the final file path(s), model used, task ID, and any error information.

## Image specifications

### Aspect ratios

- `1:1` — square
- `4:3` — standard landscape
- `3:4` — standard portrait
- `16:9` — widescreen landscape
- `9:16` — full-screen portrait

### Resolutions

- `1080p` — long edge 1920px
- `2k` — long edge 2560px
- `4k` — long edge 3840px

### Output format

- Fixed: PNG
- Each task returns exactly 1 image

## Command patterns

Generate (text-to-image):

```powershell
node skills/lanox-image-2/scripts/lanox_image_2.mjs `
  --prompt "A cat sitting by a window watching the rain, centered subject, soft natural light, cinematic composition" `
  --aspect-ratio 9:16 `
  --resolution 4k
```

Edit (image editing):

```powershell
node skills/lanox-image-2/scripts/lanox_image_2.mjs `
  --edit `
  --prompt "Keep the subject, replace the background with a neon-lit night street, centered subject, realistic photography style" `
  --image .\input.png `
  --aspect-ratio 16:9 `
  --resolution 2k
```

Custom output directory:

```powershell
node skills/lanox-image-2/scripts/lanox_image_2.mjs `
  --prompt "A futuristic cityscape" `
  --aspect-ratio 16:9 `
  --resolution 4k `
  --output-dir .\output
```

With idempotency key (for safe retries):

```powershell
node skills/lanox-image-2/scripts/lanox_image_2.mjs `
  --prompt "A sunset over mountains" `
  --idempotency-key "my-unique-key-123"
```

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `LANOX_API_KEY` | API key (fallback if auth.json missing) | — |
| `LANOX_IMAGE_2_BASE_URL` | Base URL | `https://api.lanox.ai` |
| `LANOX_IMAGE_2_MODEL` | Model name | `lanox-image-2` |
| `LANOX_IMAGE_2_PROMPT` | Image prompt | — |
| `LANOX_IMAGE_2_ASPECT_RATIO` | Aspect ratio | `1:1` |
| `LANOX_IMAGE_2_RESOLUTION` | Resolution | `1080p` |
| `LANOX_IMAGE_2_INPUT_IMAGE` | Input image path (edit mode) | — |
| `LANOX_IMAGE_2_IDEMPOTENCY_KEY` | Idempotency key | — |
| `LANOX_IMAGE_2_POLL_INTERVAL_MS` | Polling interval | 3000 |
| `LANOX_IMAGE_2_MAX_POLL_ATTEMPTS` | Max poll attempts | 120 |
| `LANOX_IMAGE_2_TIMEOUT_MS` | Total timeout | 180000 |
| `LANOX_IMAGE_2_OUTPUT_DIR` | Output directory | `data/generated-images` |

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

- `scripts/lanox_image_2.mjs`: execution script
- `references/api.md`: API reference documentation
