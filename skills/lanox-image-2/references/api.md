# Lanox Image-2 API Reference

## Endpoints

### Text-to-Image

```
POST https://api.lanox.ai/api/v2/lanox-images/generations
Content-Type: application/json; charset=utf-8
Authorization: Bearer <API_KEY>
```

**Request body:**

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `model` | string | No | `lanox-image-2` | Must be `lanox-image-2` |
| `prompt` | string | Yes | — | Image content, style, and composition description |
| `aspect_ratio` | string | Yes | — | `1:1`, `4:3`, `3:4`, `16:9`, `9:16` |
| `resolution` | string | Yes | — | `1080p`, `2k`, `4k` |

**Optional headers:**
- `Idempotency-Key`: Max 128 characters, same key must map to same request

**Success response (HTTP 202):**

```json
{
  "id": "imgtask_20260726856515565422",
  "object": "image.task",
  "status": "queued",
  "created_at": 1785031200
}
```

### Image Editing

```
POST https://api.lanox.ai/api/v2/lanox-images/edits
Content-Type: multipart/form-data
Authorization: Bearer <API_KEY>
```

**Form fields:**

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `image` | file | Yes | — | Input image (PNG, JPEG, WebP), max 20 MiB |
| `model` | string | No | `lanox-image-2` | Must be `lanox-image-2` |
| `prompt` | string | Yes | — | Edit instruction |
| `aspect_ratio` | string | Yes | — | `1:1`, `4:3`, `3:4`, `16:9`, `9:16` |
| `resolution` | string | Yes | — | `1080p`, `2k`, `4k` |

**File MIME types:**
- PNG → `image/png`
- JPEG → `image/jpeg`
- WebP → `image/webp`

**Success response (HTTP 202):** Same as text-to-image.

### Query Task

```
GET https://api.lanox.ai/api/v2/lanox-images/tasks/{taskId}
Authorization: Bearer <API_KEY>
```

**Task statuses:**

| Status | Meaning | Terminal |
| --- | --- | --- |
| `queued` | Waiting to execute | No |
| `processing` | Currently processing | No |
| `succeeded` | Completed successfully | Yes |
| `failed` | Failed | Yes |

**Success response (status = succeeded):**

```json
{
  "id": "imgtask_...",
  "object": "image.task",
  "status": "succeeded",
  "created_at": 1785031200,
  "completed_at": 1785031260,
  "data": [
    {
      "url": "https://example.com/image/result.png?signature=..."
    }
  ]
}
```

**Failure response (status = failed):**

```json
{
  "id": "imgtask_...",
  "object": "image.task",
  "status": "failed",
  "created_at": 1785031200,
  "completed_at": 1785031260,
  "error": {
    "code": "image_task_failed",
    "message": "图片任务执行失败"
  }
}
```

## Image Dimensions

| aspect_ratio | 1080p | 2k | 4k |
| --- | --- | --- | --- |
| 1:1 | 1920×1920 | 2560×2560 | 3840×3840 |
| 4:3 | 1920×1440 | 2560×1920 | 3840×2880 |
| 3:4 | 1440×1920 | 1920×2560 | 2880×3840 |
| 16:9 | 1920×1080 | 2560×1440 | 3840×2160 |
| 9:16 | 1080×1920 | 1440×2560 | 2160×3840 |

## HTTP Error Codes

| Code | Description |
| --- | --- |
| 400 | Invalid parameters, image file, aspect ratio or resolution |
| 401 | API Key missing, invalid or disabled |
| 403 | User, model or account status not allowed |
| 404 | Task not found or not owned by current API Key |
| 409 | Idempotency-Key used with different request |
| 500 | Service temporarily unavailable |

## Notes

1. Each task returns exactly 1 PNG image
2. `aspect_ratio` and `resolution` are both required; `720p` is not supported
3. Image editing accepts only 1 image file per request
4. Task query must use the same API Key used to create the task
5. `data[0].url` is time-limited; download promptly after task succeeds
6. No task cancellation endpoint currently available
7. Recommended polling interval: 2–5 seconds until terminal status
