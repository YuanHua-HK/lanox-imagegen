---
name: "lanox-imagegen"
description: "Generate or edit raster images through the Lanox Responses API. Use when the user wants image generation or reference-image editing through the project's API endpoint instead of built-in image tools or direct OpenAI API keys."
---

# Lanox Imagegen

Generates or edits images by calling the project's Lanox `POST /v1/responses` endpoint with the `image_generation` tool.

## When to use

- The user wants image generation routed through the project's API
- The user wants OpenAI-style image generation without changing `openclaw`
- The user wants reference-image editing through the same API path
- The user asks for a scriptable, repo-local image generation path

## When not to use

- The user wants the built-in Codex image tool
- The task is better handled by editing repo-native SVG, HTML/CSS, or canvas assets directly
- The user needs a different provider path that is unrelated to this API path

## Top-level mode

This skill uses one execution path only:

- `scripts/lanox_image_gen.mjs`

The script:
- calls the API endpoint directly
- sends `Responses + image_generation tool` payloads
- supports both text-to-image and reference-image editing
- parses SSE output and writes final images to disk

## Defaults

- Base URL: `https://api.lanox.ai/v1`
- Default responses model: `gpt-5.5`
- Default image model: `gpt-image-2`
- Default output directory: `data/generated-images`

Authentication is required:

- The script reads the API key from `auth.json` in the skill root directory (preferred), falling back to the `LANOX_API_KEY` environment variable.

**Before running the script, check if `auth.json` exists in the skill root.** If it does not exist or the key inside is empty, ask the user for their API key, then create the file:

```json
{
  "LANOX_API_KEY": "the_key_from_user"
}
```

Write the file using the Write tool. Do not commit `auth.json` to version control — it is listed in `.gitignore`.

Never hardcode secrets into any other committed files.

## Workflow

1. Decide whether the request is generate or edit.
2. Collect the prompt, output size, output format, count, and any reference images.
3. If the user names a destination path, pass `--output-dir` so the final asset lands in the workspace where they want it.
4. Run the bundled script.
5. Inspect the saved result if the task depends on visual correctness.
6. Report the final file path(s), image model used, and any revised prompt returned by the API.

## Reference-image editing

- For one reference image, pass one `--image <path>`
- For multiple references, repeat `--image <path>` for each file
- The script converts local files to `data:` URLs and sends them as `input_image`

## Transparency

- Default image generation uses `gpt-image-2`
- If the user explicitly asks for true native transparency, switch to:
  - `--image-model gpt-image-1.5`
  - `--background transparent`
  - `--output-format png` or `webp`
- Do not silently switch models for transparency-sensitive work; mention the model change

## Command patterns

Generate:

```powershell
node skills/lanox-imagegen/scripts/lanox_image_gen.mjs `
  --prompt "A friendly robot mascot" `
  --size 1024x1024 `
  --output-format png
```

Edit with one reference:

```powershell
node skills/lanox-imagegen/scripts/lanox_image_gen.mjs `
  --prompt "Keep the subject, replace the background with a bright studio setup" `
  --image .\reference.png `
  --size 1024x1536
```

Transparent output:

```powershell
node skills/lanox-imagegen/scripts/lanox_image_gen.mjs `
  --prompt "A red sticker icon on a transparent background" `
  --image-model gpt-image-1.5 `
  --background transparent `
  --output-format png
```

## Prompt guidance

Use a short structured spec when the user prompt is vague:

```text
Asset type: <icon/poster/hero/product image>
Primary request: <what to generate>
Reference images: <what each image contributes>
Style: <photo/illustration/3D/vector-like>
Composition: <framing and placement>
Lighting/mood: <lighting and mood>
Constraints: <must keep / must avoid>
```

Preserve detailed user prompts as-is when they are already specific.

## Files

- `scripts/lanox_image_gen.mjs`: execution script
- `references/api.md`: request/response notes and environment variables
