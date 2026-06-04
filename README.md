# lanox-imagegen

[![skills.sh](https://skills.sh/b/YuanHua-HK/skills)](https://skills.sh/YuanHua-HK/skills)

A Claude Code skill for generating and editing images through the Lanox Responses API.

## Install

```bash
npx skills add https://github.com/YuanHua-HK/skills --skill lanox-imagegen
```

## What it does

- Text-to-image generation via `POST /v1/responses` with the `image_generation` tool
- Reference-image editing (pass one or more source images)
- Supports `gpt-image-2` (default) and `gpt-image-1.5` (native transparency)
- Outputs PNG, JPEG, or WebP

## Authentication

On first use, Claude will ask for your API key and save it to `auth.json` in the skill directory. This file is gitignored.

You can also set the `LANOX_API_KEY` environment variable as a fallback.

## Skills in this repo

| Skill | Description |
|---|---|
| `lanox-imagegen` | Generate or edit raster images through the Lanox Responses API |

## File structure

```
skills/
  lanox-imagegen/
    SKILL.md              # Skill definition
    scripts/
      lanox_image_gen.mjs # Execution script
    references/
      api.md              # API reference
```
