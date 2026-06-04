# Lanox Image API

This skill calls the API endpoint:

- `POST https://api.lanox.ai/v1/responses`

Request style:

- outer model: usually `gpt-5.5`
- `input`: user message with `input_text` and optional `input_image`
- `tools`: one `image_generation` tool entry
- `tool_choice: { type: "image_generation" }`
- `stream: true`
- `store: false`

Authentication:

- `Authorization: Bearer <LANOX_API_KEY>`

Preferred environment variables:

- `LANOX_API_KEY`
- `LANOX_IMAGEGEN_BASE_URL`
- `LANOX_IMAGEGEN_RESPONSES_MODEL`
- `LANOX_IMAGEGEN_IMAGE_MODEL`
- `LANOX_IMAGEGEN_IMAGE_PROMPT`
- `LANOX_IMAGEGEN_IMAGE_SIZE`
- `LANOX_IMAGEGEN_IMAGE_OUTPUT_FORMAT`
- `LANOX_IMAGEGEN_IMAGE_BACKGROUND`
- `LANOX_IMAGEGEN_IMAGE_QUALITY`
- `LANOX_IMAGEGEN_IMAGE_OUTPUT_COMPRESSION`
- `LANOX_IMAGEGEN_IMAGE_COUNT`
- `LANOX_IMAGEGEN_TIMEOUT_MS`
- `LANOX_IMAGEGEN_OUTPUT_DIR`

Output handling:

- The script parses SSE events
- It accepts both `response.output_item.done` and `response.completed`
- Returned image payloads are base64-decoded and saved locally
