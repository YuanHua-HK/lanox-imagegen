import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_JSON_PATH = path.resolve(__dirname, "..", "auth.json");

const DEFAULT_BASE_URL = "https://api.lanox.ai";
const DEFAULT_MODEL = "lanox-image-2.5-flare";
const DEFAULT_ASPECT_RATIO = "1:1";
const DEFAULT_RESOLUTION = "1080p";
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_ATTEMPTS = 120;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "data", "generated-images");

const VALID_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const VALID_RESOLUTIONS = ["1080p", "2k", "4k"];

function readEnv(varName) {
  return process.env[varName] || "";
}

async function readApiKeyFromAuth() {
  try {
    const raw = await fs.readFile(AUTH_JSON_PATH, "utf-8");
    const data = JSON.parse(raw);
    return data.LANOX_API_KEY || "";
  } catch {
    return "";
  }
}

async function parseArgs(argv) {
  const authKey = await readApiKeyFromAuth();
  const result = {
    baseUrl: readEnv("LANOX_IMAGE_BASE_URL") || DEFAULT_BASE_URL,
    apiKey: authKey || readEnv("LANOX_API_KEY"),
    model: readEnv("LANOX_IMAGE_MODEL") || DEFAULT_MODEL,
    prompt: readEnv("LANOX_IMAGE_PROMPT"),
    aspectRatio: readEnv("LANOX_IMAGE_ASPECT_RATIO") || DEFAULT_ASPECT_RATIO,
    resolution: readEnv("LANOX_IMAGE_RESOLUTION") || DEFAULT_RESOLUTION,
    inputImage: readEnv("LANOX_IMAGE_INPUT_IMAGE"),
    idempotencyKey: readEnv("LANOX_IMAGE_IDEMPOTENCY_KEY") || undefined,
    pollIntervalMs: Number(readEnv("LANOX_IMAGE_POLL_INTERVAL_MS") || DEFAULT_POLL_INTERVAL_MS),
    maxPollAttempts: Number(readEnv("LANOX_IMAGE_MAX_POLL_ATTEMPTS") || DEFAULT_MAX_POLL_ATTEMPTS),
    timeoutMs: Number(readEnv("LANOX_IMAGE_TIMEOUT_MS") || DEFAULT_TIMEOUT_MS),
    outputDir: readEnv("LANOX_IMAGE_OUTPUT_DIR") || DEFAULT_OUTPUT_DIR,
    mode: "generate",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--base-url":
        result.baseUrl = next; i++; break;
      case "--model":
        result.model = next; i++; break;
      case "--prompt":
        result.prompt = next; i++; break;
      case "--aspect-ratio":
        result.aspectRatio = next; i++; break;
      case "--resolution":
        result.resolution = next; i++; break;
      case "--image":
        result.inputImage = next; i++; break;
      case "--idempotency-key":
        result.idempotencyKey = next; i++; break;
      case "--poll-interval-ms":
        result.pollIntervalMs = Number(next); i++; break;
      case "--max-poll-attempts":
        result.maxPollAttempts = Number(next); i++; break;
      case "--timeout-ms":
        result.timeoutMs = Number(next); i++; break;
      case "--output-dir":
        result.outputDir = next; i++; break;
      case "--edit":
        result.mode = "edit"; break;
      case "--generate":
        result.mode = "generate"; break;
      case "--help":
      case "-h":
        printHelpAndExit(0); break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!result.apiKey) {
    throw new Error("Missing API key. Write {\"LANOX_API_KEY\":\"your_token\"} to auth.json in the skill root, or set the LANOX_API_KEY environment variable.");
  }
  if (!result.prompt) {
    throw new Error("Missing prompt. Pass --prompt or set LANOX_IMAGE_PROMPT.");
  }
  if (result.mode === "edit" && !result.inputImage) {
    throw new Error("Edit mode requires --image <path>.");
  }
  if (!VALID_ASPECT_RATIOS.includes(result.aspectRatio)) {
    throw new Error(`Invalid aspect_ratio: ${result.aspectRatio}. Valid values: ${VALID_ASPECT_RATIOS.join(", ")}`);
  }
  if (!VALID_RESOLUTIONS.includes(result.resolution)) {
    throw new Error(`Invalid resolution: ${result.resolution}. Valid values: ${VALID_RESOLUTIONS.join(", ")}`);
  }
  return result;
}

function printHelpAndExit(code) {
  const text = `
Usage:
  node skills/lanox-image/scripts/lanox_image.mjs --prompt "A blue square"
  node skills/lanox-image/scripts/lanox_image.mjs --edit --prompt "Change background" --image input.png

Options:
  --generate                  Text-to-image mode (default)
  --edit                      Image edit mode (requires --image)
  --base-url <url>            Base URL. Default: ${DEFAULT_BASE_URL}
  --model <model>             Model name. Default: ${DEFAULT_MODEL}
  --prompt <text>             Image prompt / edit instruction
  --aspect-ratio <ratio>      Aspect ratio. Valid: ${VALID_ASPECT_RATIOS.join(", ")}. Default: ${DEFAULT_ASPECT_RATIO}
  --resolution <res>          Resolution. Valid: ${VALID_RESOLUTIONS.join(", ")}. Default: ${DEFAULT_RESOLUTION}
  --image <path>              Input image for edit mode
  --idempotency-key <key>     Idempotency key for safe retries (max 128 chars)
  --poll-interval-ms <ms>     Polling interval for task status. Default: ${DEFAULT_POLL_INTERVAL_MS}
  --max-poll-attempts <n>     Max polling attempts. Default: ${DEFAULT_MAX_POLL_ATTEMPTS}
  --timeout-ms <ms>           Total timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --output-dir <dir>          Output directory. Default: ${DEFAULT_OUTPUT_DIR}
  --help, -h                  Show this help
`;
  process.stdout.write(text);
  process.exitCode = code;
  process.exit(code);
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createGenerationTask(params) {
  const url = `${normalizeBaseUrl(params.baseUrl)}/api/v2/lanox-images/generations`;
  const headers = {
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json; charset=utf-8",
  };
  if (params.idempotencyKey) {
    headers["Idempotency-Key"] = params.idempotencyKey;
  }

  const body = {
    model: params.model,
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio,
    resolution: params.resolution,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function createEditTask(params) {
  const url = `${normalizeBaseUrl(params.baseUrl)}/api/v2/lanox-images/edits`;
  const formData = new FormData();

  const imageBuffer = await fs.readFile(params.inputImage);
  const ext = path.extname(params.inputImage).toLowerCase();
  const mimeTypeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypeMap[ext] || "image/png";

  formData.append("image", new Blob([imageBuffer], { type: mimeType }), path.basename(params.inputImage));
  formData.append("model", params.model);
  formData.append("prompt", params.prompt);
  formData.append("aspect_ratio", params.aspectRatio);
  formData.append("resolution", params.resolution);

  const headers = {
    Authorization: `Bearer ${params.apiKey}`,
  };
  if (params.idempotencyKey) {
    headers["Idempotency-Key"] = params.idempotencyKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function queryTask(params, taskId) {
  const url = `${normalizeBaseUrl(params.baseUrl)}/api/v2/lanox-images/tasks/${taskId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function pollForCompletion(params, taskId) {
  let attempt = 0;
  const startTime = Date.now();
  const maxDuration = params.timeoutMs;

  while (attempt < params.maxPollAttempts) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDuration) {
      throw new Error(`Task ${taskId} timed out after ${elapsed}ms.`);
    }

    attempt++;
    const taskResult = await queryTask(params, taskId);
    const status = taskResult.status;

    if (status === "succeeded") {
      return taskResult;
    }
    if (status === "failed") {
      const errorMsg = taskResult.error?.message || "Task failed.";
      const errorCode = taskResult.error?.code || "unknown";
      throw new Error(`Task ${taskId} failed [${errorCode}]: ${errorMsg}`);
    }

    process.stderr.write(`[Attempt ${attempt}/${params.maxPollAttempts}] Task ${taskId} status: ${status} (elapsed: ${elapsed}ms)\n`);
    await sleep(params.pollIntervalMs);
  }

  throw new Error(`Task ${taskId} did not complete after ${params.maxPollAttempts} polling attempts.`);
}

async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading image from: ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

async function saveImage(outputDir, buffer, fileName) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.resolve(outputDir, fileName);
  await fs.writeFile(filePath, buffer);
  return { path: filePath, bytes: buffer.length };
}

async function main() {
  const params = await parseArgs(process.argv.slice(2));

  let taskCreationResult;
  if (params.mode === "edit") {
    process.stderr.write(`Creating edit task with image: ${params.inputImage}\n`);
    taskCreationResult = await createEditTask(params);
  } else {
    process.stderr.write(`Creating generation task\n`);
    taskCreationResult = await createGenerationTask(params);
  }

  const taskId = taskCreationResult.id;
  process.stderr.write(`Task created: ${taskId} (status: ${taskCreationResult.status})\n`);

  const completedTask = await pollForCompletion(params, taskId);
  const imageUrl = completedTask.data?.[0]?.url;

  if (!imageUrl) {
    throw new Error(`Task ${taskId} succeeded but no image URL found in response.`);
  }

  process.stderr.write(`Task ${taskId} succeeded. Downloading image...\n`);
  const imageBuffer = await downloadImage(imageUrl);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `lanox-image-${timestamp}.png`;
  const saved = await saveImage(params.outputDir, imageBuffer, fileName);

  process.stderr.write(`Image saved: ${saved.path} (${saved.bytes} bytes)\n`);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        taskId,
        status: completedTask.status,
        model: params.model,
        mode: params.mode,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        createdAt: completedTask.created_at,
        completedAt: completedTask.completed_at,
        saved,
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

