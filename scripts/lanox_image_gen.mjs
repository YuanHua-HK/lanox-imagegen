import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "https://api.lanox.ai/v1";
const DEFAULT_RESPONSES_MODEL = "gpt-5.5";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_SIZE = "1024x1024";
const DEFAULT_OUTPUT_FORMAT = "png";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "data", "generated-images");

function readEnv(primary, fallback) {
  return process.env[primary] || (fallback ? process.env[fallback] : "") || "";
}

function parseArgs(argv) {
  const result = {
    baseUrl: readEnv("LANOX_IMAGEGEN_BASE_URL") || DEFAULT_BASE_URL,
    apiKey: readEnv("LANOX_API_KEY"),
    responsesModel:
      readEnv("LANOX_IMAGEGEN_RESPONSES_MODEL") || DEFAULT_RESPONSES_MODEL,
    imageModel: readEnv("LANOX_IMAGEGEN_IMAGE_MODEL") || DEFAULT_IMAGE_MODEL,
    prompt: readEnv("LANOX_IMAGEGEN_IMAGE_PROMPT"),
    size: readEnv("LANOX_IMAGEGEN_IMAGE_SIZE") || DEFAULT_SIZE,
    outputFormat:
      readEnv("LANOX_IMAGEGEN_IMAGE_OUTPUT_FORMAT") || DEFAULT_OUTPUT_FORMAT,
    background: readEnv("LANOX_IMAGEGEN_IMAGE_BACKGROUND") || undefined,
    quality: readEnv("LANOX_IMAGEGEN_IMAGE_QUALITY") || undefined,
    outputCompression: readEnv("LANOX_IMAGEGEN_IMAGE_OUTPUT_COMPRESSION") || undefined,
    count: Number(readEnv("LANOX_IMAGEGEN_IMAGE_COUNT") || 1),
    timeoutMs: Number(readEnv("LANOX_IMAGEGEN_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS),
    outputDir: readEnv("LANOX_IMAGEGEN_OUTPUT_DIR") || DEFAULT_OUTPUT_DIR,
    inputImages: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--base-url":
        result.baseUrl = next;
        index += 1;
        break;
      case "--responses-model":
        result.responsesModel = next;
        index += 1;
        break;
      case "--image-model":
        result.imageModel = next;
        index += 1;
        break;
      case "--prompt":
        result.prompt = next;
        index += 1;
        break;
      case "--size":
        result.size = next;
        index += 1;
        break;
      case "--output-format":
        result.outputFormat = next;
        index += 1;
        break;
      case "--background":
        result.background = next;
        index += 1;
        break;
      case "--quality":
        result.quality = next;
        index += 1;
        break;
      case "--output-compression":
        result.outputCompression = next;
        index += 1;
        break;
      case "--count":
        result.count = Number(next);
        index += 1;
        break;
      case "--timeout-ms":
        result.timeoutMs = Number(next);
        index += 1;
        break;
      case "--output-dir":
        result.outputDir = next;
        index += 1;
        break;
      case "--image":
        result.inputImages.push(next);
        index += 1;
        break;
      case "--help":
      case "-h":
        printHelpAndExit(0);
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!result.apiKey) {
    throw new Error("Missing API key. Set the system environment variable LANOX_API_KEY.");
  }
  if (!result.prompt) {
    throw new Error("Missing prompt. Pass --prompt or set LANOX_IMAGEGEN_IMAGE_PROMPT.");
  }
  if (!Number.isFinite(result.count) || result.count < 1) {
    throw new Error("count must be a positive integer.");
  }
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive integer.");
  }
  return result;
}

function printHelpAndExit(code) {
  const text = `
Usage:
  node skills/lanox-imagegen/scripts/lanox_image_gen.mjs --prompt "A blue square"

Options:
  --base-url <url>            Responses base URL. Default: ${DEFAULT_BASE_URL}
  --responses-model <model>   Outer responses model. Default: ${DEFAULT_RESPONSES_MODEL}
  --image-model <model>       Image tool model. Default: ${DEFAULT_IMAGE_MODEL}
  --prompt <text>             Image prompt
  --size <WxH>                Image size. Default: ${DEFAULT_SIZE}
  --output-format <fmt>       png | jpeg | webp. Default: ${DEFAULT_OUTPUT_FORMAT}
  --background <mode>         transparent | opaque | auto
  --quality <level>           low | medium | high | auto
  --output-compression <n>    JPEG/WebP compression hint
  --count <n>                 Number of runs. Default: 1
  --timeout-ms <n>            Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --output-dir <dir>          Save directory. Default: ${DEFAULT_OUTPUT_DIR}
  --image <path>              Reference image path; repeat for multiple images

Environment:
  LANOX_API_KEY               Required
`;
  process.stdout.write(text.trimStart());
  process.stdout.write("\n");
  process.exit(code);
}

function resolveOutputExtension(outputFormat) {
  switch (String(outputFormat || "").toLowerCase()) {
    case "jpeg":
    case "jpg":
      return "jpg";
    case "webp":
      return "webp";
    case "png":
    default:
      return "png";
  }
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function parseSseEvents(bodyText) {
  const events = [];
  for (const line of String(bodyText).split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      // Ignore intermediary non-JSON lines.
    }
  }
  return events;
}

function extractFailure(events) {
  return events.find(
    (event) => event?.type === "response.failed" || event?.type === "error",
  );
}

function decodeBase64Image(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  return Buffer.from(value, "base64");
}

function extractImagesFromEvents(events, outputFormat) {
  const outputItems = events
    .filter(
      (event) =>
        event?.type === "response.output_item.done" &&
        event?.item?.type === "image_generation_call" &&
        typeof event?.item?.result === "string" &&
        event.item.result.length > 0,
    )
    .map((event, index) => ({
      buffer: decodeBase64Image(event.item.result),
      revisedPrompt: event.item.revised_prompt,
      fileName: `image-${index + 1}.${resolveOutputExtension(outputFormat)}`,
    }))
    .filter((entry) => entry.buffer);

  if (outputItems.length > 0) {
    return outputItems;
  }

  const completed = events.find((event) => event?.type === "response.completed");
  const outputs = Array.isArray(completed?.response?.output)
    ? completed.response.output
    : [];
  return outputs
    .filter(
      (entry) =>
        entry?.type === "image_generation_call" &&
        typeof entry?.result === "string" &&
        entry.result.length > 0,
    )
    .map((entry, index) => ({
      buffer: decodeBase64Image(entry.result),
      revisedPrompt: entry.revised_prompt,
      fileName: `image-${index + 1}.${resolveOutputExtension(outputFormat)}`,
    }))
    .filter((entry) => entry.buffer);
}

async function fileToDataUrl(filePath) {
  const absolutePath = path.resolve(filePath);
  const buffer = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : "image/png";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function buildInputContent(prompt, imagePaths) {
  const content = [{ type: "input_text", text: prompt }];
  for (const imagePath of imagePaths) {
    content.push({
      type: "input_image",
      image_url: await fileToDataUrl(imagePath),
      detail: "auto",
    });
  }
  return content;
}

function buildRequestBody(params, content) {
  return {
    model: params.responsesModel,
    input: [{ role: "user", content }],
    instructions: "You are an image generation assistant.",
    tools: [
      {
        type: "image_generation",
        model: params.imageModel,
        size: params.size,
        ...(params.quality ? { quality: params.quality } : {}),
        ...(params.outputFormat ? { output_format: params.outputFormat } : {}),
        ...(params.background ? { background: params.background } : {}),
        ...(params.outputCompression
          ? { output_compression: Number(params.outputCompression) }
          : {}),
      },
    ],
    tool_choice: { type: "image_generation" },
    stream: true,
    store: false,
  };
}

async function callBridgeResponses(params, requestBody) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${bodyText}`);
    }
    return bodyText;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveImages(outputDir, images) {
  await fs.mkdir(outputDir, { recursive: true });
  const saved = [];
  for (const [index, image] of images.entries()) {
    const fileName = image.fileName || `image-${index + 1}.png`;
    const filePath = path.resolve(outputDir, fileName);
    await fs.writeFile(filePath, image.buffer);
    saved.push({
      path: filePath,
      revisedPrompt: image.revisedPrompt || null,
      bytes: image.buffer.length,
    });
  }
  return saved;
}

async function main() {
  const params = parseArgs(process.argv.slice(2));
  const content = await buildInputContent(params.prompt, params.inputImages);
  const savedRuns = [];

  for (let index = 0; index < params.count; index += 1) {
    const requestBody = buildRequestBody(params, content);
    const bodyText = await callBridgeResponses(params, requestBody);
    const events = parseSseEvents(bodyText);
    const failure = extractFailure(events);
    if (failure) {
      throw new Error(
        failure?.error?.message || failure?.message || "Image generation failed.",
      );
    }
    const images = extractImagesFromEvents(events, params.outputFormat);
    if (!images.length) {
      throw new Error(`No image payload found. Raw response:\n${bodyText}`);
    }
    const runDir =
      params.count > 1
        ? path.join(params.outputDir, `run-${String(index + 1).padStart(2, "0")}`)
        : params.outputDir;
    const saved = await saveImages(runDir, images);
    savedRuns.push({
      run: index + 1,
      outputDir: path.resolve(runDir),
      files: saved,
    });
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        baseUrl: normalizeBaseUrl(params.baseUrl),
        responsesModel: params.responsesModel,
        imageModel: params.imageModel,
        count: params.count,
        savedRuns,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
