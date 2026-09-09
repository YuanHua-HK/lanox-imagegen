# Lanox-Video 统一异步视频 API 文档

本文档说明 Lanox-Video 统一异步视频接口。文生视频、首帧生视频、参考素材生视频和视频编辑不再使用不同端点；所有模型都调用同一个创建接口，并通过 `content[].type` 与可选的 `content[].role` 表达输入内容。

> 文档版本：2026-08-31（线上版）。本版已纳入 `wan3.0-video`，并明确 Wan 3.0 与 Wan 2.7 使用不同的媒体角色和参数契约。

## 1. 基础信息

| 项目 | 说明 |
| ---- | ---- |
| Base URL | `https://api.lanox.ai` |
| 鉴权 | 推荐 `Authorization: Bearer <API_KEY>`；统一视频入口也兼容 `x-api-key`，受信 Lanox-TV 调用可使用用户 Token + `X-Lanox-TV-Key` |
| 请求格式 | `application/json` |
| 调用方式 | 创建异步任务后，使用返回的任务 ID 轮询查询 |
| 协议风格 | 火山 ModelArk 的 `model + content[]` 结构 |
| 创建成功 HTTP 状态 | `200 OK`，返回裸对象 `{"id":"cvt-..."}` |
| 查询成功 HTTP 状态 | `200 OK`，返回裸任务对象 |
| 业务错误 HTTP 状态 | 当前通常仍为 `200 OK`，返回 `ApiResponse` 错误包络 |

接口一览：

| 能力 | Method | Path |
| ---- | ------ | ---- |
| 创建视频任务 | POST | `/api/v2/lanox-videos/generations` |
| 查询视频任务 | GET | `/api/v2/lanox-videos/tasks/{taskId}` |

统一接口当前不提供取消任务端点，也未提供 `Idempotency-Key` 契约。客户端不要假设重复提交会自动去重。

最短接入流程：创建任务后先区分“裸成功对象”和“业务错误包络”；仅当响应中存在非空 `id` 且不存在失败 `code` 时保存任务 ID。随后每 `10–30` 秒查询任务，直到进入终态；成功后立即下载或转存 `content.video_url`。

## 2. 模型目录与参数规格

视频模型会随服务端启用状态变化。下面是当前已知模型，实际可用列表以实时模型目录为准；`/v1/models` 是全模型目录，调用方应按返回的能力字段筛选视频模型。

### 2.1 当前已知模型

| 模型族 | 模型编码 |
| ------ | -------- |
| Seedance | `dreamina-seedance-2-0-260128` |
| Seedance | `dreamina-seedance-2-0-fast-260128` |
| Seedance | `dreamina-seedance-2-0-mini-260615` |
| Seedance | `dreamina-seedance-2-5-260628` |
| Seedance | `doubao-seedance-2-0-260128` |
| Grok | `grok-imagine-video` |
| Grok | `grok-imagine-video-1.5` |
| Grok | `grok-imagine-video-1.5-preview` |
| HappyHorse | `happyhorse-1.1-t2v` |
| HappyHorse | `happyhorse-1.1-i2v` |
| HappyHorse | `happyhorse-1.1-r2v` |
| HappyHorse | `happyhorse-1.0-video-edit` |
| 万相 | `wan3.0-video` |
| 万相 | `wan2.7-t2v-2026-06-12` |
| 万相 | `wan2.7-i2v-2026-04-25` |
| 万相 | `wan2.7-r2v-2026-06-12` |
| 万相 | `wan2.7-videoedit` |

### 2.2 查询实时模型列表

```bash
curl "https://api.lanox.ai/v1/models" \
  -H "Authorization: Bearer $API_KEY"
```

### 2.3 查询指定模型参数

对于 `resolution`、`ratio`、`duration` 等会随模型变化的字段，推荐调用参数查询接口：

```bash
curl -X POST "https://api.lanox.ai/api/v1/model/params" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"modelCode":"dreamina-seedance-2-0-260128"}'
```

该辅助接口返回 `ApiResponse` 包络。本文档列出的模型编码和约束用于说明当前统一契约；线上模型开关、账户权限和模型参数规格仍以实时查询结果为准。

## 3. 创建视频任务

```http
POST /api/v2/lanox-videos/generations
```

### 3.1 请求头

| 请求头 | 必填 | 说明 |
| ------ | ---- | ---- |
| `Authorization` | 是 | `Bearer <API_KEY>` |
| `Content-Type` | 是 | `application/json` |

### 3.2 顶层请求参数

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `model` | string | 是 | 模型编码或受支持的 Endpoint ID |
| `content` | object[] | 是 | 至少一项；使用严格判别联合，见第 4 节 |
| `return_last_frame` | boolean | 否 | Seedance：是否返回最后一帧 |
| `service_tier` | string | 否 | Seedance：`default` 或 `flex` |
| `execution_expires_after` | integer | 否 | 任务执行超时阈值，单位秒；缺省值通常为 `172800` |
| `generate_audio` | boolean | 否 | Seedance：是否生成音频；Wan 3.0 会映射为上游 `audio` 参数 |
| `draft` | boolean | 否 | Seedance：是否生成草稿视频 |
| `safety_identifier` | string | 否 | Seedance：最终用户安全标识 |
| `priority` | integer | 否 | Seedance：任务优先级 |
| `resolution` | string | 否 | 输出分辨率，具体取值由模型决定 |
| `ratio` | string | 否 | 输出画幅，具体取值由模型决定 |
| `duration` | integer | 否 | 视频时长，单位秒；Wan 3.0 额外支持 `-1` 表示智能时长 |
| `frames` | integer | 否 | Seedance：生成帧数 |
| `seed` | integer | 否 | 随机种子，具体范围由模型决定 |
| `negative_prompt` | string | 否 | 万相：反向提示词 |
| `prompt_extend` | boolean | 否 | 万相：是否开启提示词智能改写 |
| `audio_setting` | string | 否 | 支持该能力的视频编辑模型：音频处理方式 |
| `camera_fixed` | boolean | 否 | Seedance：是否固定相机 |
| `watermark` | boolean | 否 | 支持该能力的模型：是否添加 AI Generated 水印 |
| `enhance` | boolean | 否 | Lanox Seedance 扩展：是否启用链式超分 |
| `enhanceToolVersion` | string | 否 | Lanox Seedance 扩展：`standard` 或 `professional` |
| `enhance_fps` | integer | 否 | Lanox Seedance 扩展：超分目标帧率，`15–120` |
| `enhanceModelCode` | string | 否 | Lanox Seedance 扩展：超分模型编码 |

字段是否可用由模型族和具体模型共同决定。显式传入未知字段，或传入该模型族未开放的字段，会返回业务码 `400`；服务不会静默忽略拼写错误或不支持的参数。

公开请求建议使用表中的字段拼写。`negative_prompt`、`prompt_extend`、`audio_setting` 使用 snake_case；Lanox 扩展字段中的 `enhanceToolVersion`、`enhanceModelCode` 使用 camelCase，而 `enhance_fps` 使用 snake_case。`callback_url` 当前未开放。

## 4. `content[]` 统一内容结构

`content[]` 是严格判别联合。每一项的 `type` 决定唯一的数据容器，不允许同时携带其他类型的值。服务端会先去除 `type` 首尾空白，再按大小写敏感的枚举值判断；建议客户端直接发送规范小写值。

| `type` | 对应字段 | 必填内容 | 可用 `role` | 未传 `role` 时 |
| ------ | -------- | -------- | ------------- | --------------- |
| `text` | `text` | 非空字符串 | 不允许 | — |
| `image_url` | `image_url` | `image_url.url` | `first_frame`、`last_frame`、`reference_image`、`background_image` | `first_frame` |
| `video_url` | `video_url` | `video_url.url` | `video`、`first_clip`、`reference_video` | `video` |
| `audio_url` | `audio_url` | `audio_url.url` | `driving_audio`、`reference_audio` | `driving_audio` |
| `draft_task` | `draft_task` | `draft_task.id` | 不允许 | —（仅支持草稿续作的模型） |

上表是统一 JSON 结构允许表达的角色全集，不代表每个模型都支持所有角色。服务端会在结构校验后继续按模型族校验组合。例如：

- Wan 3.0 的 `video_url` 默认映射为 `reference_video`，`audio_url` 默认映射为 `reference_audio`，与上表的通用默认角色不同；建议调用 Wan 3.0 时显式传 `role`。
- Wan 3.0 不支持 `background_image`、`video`、`first_clip`、`driving_audio`、`draft_task` 或 `reference_voice`。
- Wan 2.7 仍使用分场景模型编码和对应角色，不会因为接入 Wan 3.0 而改变原有契约。
- Grok、HappyHorse、Seedance 各自允许的输入组合见第 6 节；结构合法但模型不支持的组合仍会返回业务码 `400`。

### 4.1 文本项

```json
{
  "type": "text",
  "text": "一只柯基在夕阳下冲浪，镜头平稳跟随"
}
```

### 4.2 图片项

```json
{
  "type": "image_url",
  "image_url": {
    "url": "https://example.com/first-frame.png"
  },
  "role": "first_frame"
}
```

### 4.3 视频项

```json
{
  "type": "video_url",
  "video_url": {
    "url": "https://example.com/source-video.mp4"
  },
  "role": "video"
}
```

### 4.4 音频项

```json
{
  "type": "audio_url",
  "audio_url": {
    "url": "https://example.com/driving-audio.wav"
  },
  "role": "driving_audio"
}
```

### 4.5 草稿任务项

```json
{
  "type": "draft_task",
  "draft_task": {
    "id": "cvt-draft-task-id"
  }
}
```

### 4.6 严格校验规则

1. `type` 去除首尾空白后仍大小写敏感，只接受 `text`、`image_url`、`video_url`、`audio_url`、`draft_task`。
2. 每一项只能包含其 `type` 对应的值。例如 `type=image_url` 时不能再包含 `text` 或 `video_url`。
3. `text` 和 `draft_task` 不允许设置 `role`；`draft_task` 最多一项。`draft_task` 不是所有模型的通用能力，当前主要用于支持草稿续作的 Seedance 模型；其他模型可能在适配层拒绝。
4. 媒体对象只开放 `url` 和受支持场景下的 `reference_voice`；草稿对象只开放 `id`。
5. 未知顶层字段、未知内容字段、未知嵌套字段和异型 sibling 都会被拒绝。
6. 媒体 URL 可使用服务可访问的公网 URL、Data URL 或 `asset://` 资产地址；实际格式与大小限制由统一校验、所选模型和上游共同决定。
7. `reference_voice` 只有万相 r2v 的 `reference_image` 或 `reference_video` 场景明确支持；其他模型或角色不保证支持，可能在适配层或上游被拒绝。
8. `role` 会去除前后空白并按小写值校验；为避免歧义，客户端应直接使用表中的全小写写法。

统一入口的媒体输入还会执行本地格式与大小校验。常见限制是：图片解码后不超过约 30 MB，视频不超过约 50 MB 且通常为 MP4/MOV，音频不超过约 15 MB 且通常为 WAV/MP3；具体模型可能进一步收紧尺寸、时长、宽高或宽高比限制，实际以参数查询和错误响应为准。

## 5. 统一入口请求示例

以下示例全部使用同一个 `/generations` 端点，区别只在 `model` 与 `content[]`。

### 5.1 文生视频

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-videos/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dreamina-seedance-2-0-260128",
    "content": [
      {
        "type": "text",
        "text": "一只柯基在夕阳下冲浪，电影感运镜"
      }
    ],
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 5
  }'
```

### 5.2 首帧生视频

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-videos/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "happyhorse-1.1-i2v",
    "content": [
      {
        "type": "text",
        "text": "让人物缓慢转身并向镜头挥手"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "https://example.com/first-frame.png"
        },
        "role": "first_frame"
      }
    ],
    "resolution": "720p",
    "duration": 5
  }'
```

### 5.3 参考图生视频

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-videos/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-imagine-video-1.5",
    "content": [
      {
        "type": "text",
        "text": "保持角色外观一致，在雨夜街头向前行走"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "https://example.com/character-front.png"
        },
        "role": "reference_image"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "https://example.com/character-side.png"
        },
        "role": "reference_image"
      }
    ],
    "resolution": "720p",
    "ratio": "16:9",
    "duration": 8
  }'
```

### 5.4 视频编辑

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-videos/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wan2.7-videoedit",
    "content": [
      {
        "type": "text",
        "text": "把白天场景改成雨夜霓虹风格，保留人物动作"
      },
      {
        "type": "video_url",
        "video_url": {
          "url": "https://example.com/source.mp4"
        },
        "role": "video"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "https://example.com/style-reference.png"
        },
        "role": "reference_image"
      }
    ],
    "resolution": "720p"
  }'
```

### 5.5 Wan 3.0 文本与多媒体混合生成

Wan 3.0 不再区分 t2v、i2v、r2v、videoedit 模型后缀。`prompt` 和媒体至少提供一种，可以单独提供，也可以混合提供：

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-videos/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wan3.0-video",
    "content": [
      {
        "type": "text",
        "text": "保持参考角色外观，在海边向镜头走来，电影感运镜"
      },
      {
        "type": "image_url",
        "image_url": {"url": "https://example.com/character.png"},
        "role": "reference_image"
      },
      {
        "type": "audio_url",
        "audio_url": {"url": "https://example.com/music.wav"},
        "role": "reference_audio"
      }
    ],
    "resolution": "720P",
    "ratio": "adaptive",
    "duration": -1,
    "generate_audio": true,
    "prompt_extend": true,
    "watermark": false
  }'
```

多个 `text` 项会按原顺序以换行符合并为一个提示词。`duration=-1` 表示由 Wan 3.0 决定智能时长；具体可用分辨率、画幅、媒体数量和智能时长能力以实时模型参数为准。

## 6. 模型族输入与参数矩阵

### 6.1 Seedance

当前已知模型：

- `dreamina-seedance-2-0-260128`
- `dreamina-seedance-2-0-fast-260128`
- `dreamina-seedance-2-0-mini-260615`
- `dreamina-seedance-2-5-260628`
- `doubao-seedance-2-0-260128`

Seedance 使用统一 ModelArk `content[]`。`draft_task` 仅在支持草稿续作的具体模型上可用；具体模型支持哪些输入角色、分辨率、比例、时长和草稿能力，应以 `/api/v1/model/params` 返回的规格为准。

Seedance 顶层可选字段只允许：

`return_last_frame`、`service_tier`、`execution_expires_after`、`generate_audio`、`draft`、`safety_identifier`、`priority`、`resolution`、`ratio`、`duration`、`frames`、`seed`、`camera_fixed`、`watermark`、`enhance`、`enhanceToolVersion`、`enhance_fps`、`enhanceModelCode`。

约束：

- `seed` 范围为 `-1` 到 `4294967295`。
- `enhance_fps` 范围为 `15–120`。
- `return_last_frame=true` 与 `enhance=true` 不能同时使用。
- `return_last_frame=true` 会关闭链式超分，并按请求的原生目标分辨率生成。
- `return_last_frame=true` 或 `enhance=false` 时，不能再传 `enhanceToolVersion`、`enhance_fps`、`enhanceModelCode`。
- `negative_prompt`、`prompt_extend`、`audio_setting` 不属于 Seedance 统一入口字段白名单。

### 6.2 Grok

当前已知模型：

- `grok-imagine-video`
- `grok-imagine-video-1.5`
- `grok-imagine-video-1.5-preview`

Grok 请求必须包含至少一个 `text` 项，并且只能选择以下三种素材模式之一：

| 模式 | `content[]` 要求 |
| ---- | ---------------- |
| 文生视频 | `text`，不带图片 |
| 首帧生视频 | `text` + 最多 1 个 `first_frame` |
| 参考图生视频 | `text` + 1–7 个 `reference_image` |

`first_frame` 与 `reference_image` 不能混用。Grok 不接受视频、音频、草稿任务或 `reference_voice`。

Grok 顶层可选字段只允许：`execution_expires_after`、`resolution`、`ratio`、`duration`。

| 参数 | `grok-imagine-video` | `grok-imagine-video-1.5` / `1.5-preview` |
| ---- | -------------------- | ---------------------------------------- |
| `resolution` | `480p`、`720p`；默认 `480p` | `480p`、`720p`、`1080p`；默认 `480p` |
| 参考图模式分辨率 | 最高 `720p` | 最高 `720p` |
| `ratio` | `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`；默认 `16:9` | 同左 |
| `duration` | `1–15` 秒；默认 `8` | `1–15` 秒；默认 `8` |

普通 API Key 调用 Grok 时还必须已开通 Grok 访问权限。未开通时会返回权限错误包络，当前常见业务码为 `GROK_ACCESS_001`；不要只看 HTTP `200`。受信 Lanox-TV 调用按内部授权规则处理。

### 6.3 HappyHorse

| 模型 | `content[]` 要求 | 允许的顶层可选字段 |
| ---- | ---------------- | ------------------ |
| `happyhorse-1.1-t2v` | 仅 `text` | `execution_expires_after`、`resolution`、`ratio`、`duration`、`watermark`、`seed` |
| `happyhorse-1.1-i2v` | `text` + 恰好 1 个 `first_frame` | `execution_expires_after`、`resolution`、`duration`、`watermark`、`seed` |
| `happyhorse-1.1-r2v` | `text` + 1–9 个 `reference_image` | `execution_expires_after`、`resolution`、`ratio`、`duration`、`watermark`、`seed` |
| `happyhorse-1.0-video-edit` | `text` + 恰好 1 个 `video` + 最多 5 个 `reference_image` | `execution_expires_after`、`resolution`、`watermark`、`seed`、`audio_setting` |

HappyHorse 全系列不支持 `reference_voice`。`i2v` 不支持 `ratio`；`video-edit` 不支持 `ratio` 或 `duration`。

### 6.4 Wan 3.0 统一协议

当前模型：`wan3.0-video`。

Wan 3.0 的 `content[]` 允许三种大类输入：仅文本、仅媒体、文本与媒体混合。至少必须存在一个非空文本或一项有效媒体，不再通过模型名区分文生、图生、参考生或编辑场景。

| `content.type` | 允许的 `role` | 未传 `role` 时 |
| -------------- | ------------- | --------------- |
| `image_url` | `first_frame`、`last_frame`、`reference_image` | `first_frame` |
| `video_url` | `reference_video` | `reference_video` |
| `audio_url` | `reference_audio` | `reference_audio` |

允许的顶层可选字段只有：`execution_expires_after`、`generate_audio`、`resolution`、`ratio`、`duration`、`seed`、`prompt_extend`、`watermark`。

参数映射与限制：

- `generate_audio` 会转换为 Wan 3.0 上游参数 `audio`。
- `duration` 接受正整数或 `-1`；`-1` 表示智能时长。
- `seed` 必须是非负整数。
- `resolution`、`ratio`、`prompt_extend`、`watermark` 按 Wan 3.0 统一参数透传，具体枚举以实时参数查询为准。
- 不支持 `draft_task`、`reference_voice`、`negative_prompt`、`audio_setting`、Seedance 超分字段，以及 `background_image`、`video`、`first_clip`、`driving_audio` 等 Wan 2.7 角色。传入后会在调用上游前返回业务码 `400`，不会静默丢弃。

### 6.5 Wan 2.7 分场景协议

| 模型 | `content[]` 要求 |
| ---- | ---------------- |
| `wan2.7-t2v-2026-06-12` | 至少一个 `text`；可再加最多 1 个不带 `role` 的 `audio_url` |
| `wan2.7-i2v-2026-04-25` | 至少 1 个 `first_frame` 或 `first_clip`；可加 `last_frame`、`driving_audio`，每种角色最多 1 项；文本可选 |
| `wan2.7-r2v-2026-06-12` | 至少一个 `text`；合计 1–5 个 `reference_image`/`reference_video`；可各加最多 1 个 `first_frame` 和 `background_image` |
| `wan2.7-videoedit` | 恰好 1 个 `video`；可加最多 4 个 `reference_image`；文本可选 |

顶层字段白名单：

| 模型操作 | 允许的顶层可选字段 |
| -------- | ------------------ |
| t2v / r2v | `execution_expires_after`、`resolution`、`ratio`、`duration`、`seed`、`negative_prompt`、`prompt_extend`、`watermark` |
| i2v | `execution_expires_after`、`resolution`、`duration`、`seed`、`negative_prompt`、`prompt_extend`、`watermark` |
| videoedit | `execution_expires_after`、`resolution`、`ratio`、`duration`、`seed`、`negative_prompt`、`prompt_extend`、`audio_setting`、`watermark` |

`reference_voice` 只允许 r2v 的 `reference_image` 或 `reference_video` 项使用。例如：

```json
{
  "type": "video_url",
  "video_url": {
    "url": "https://example.com/reference-person.mp4",
    "reference_voice": "https://example.com/reference-voice.wav"
  },
  "role": "reference_video"
}
```

## 7. 创建成功响应

创建成功时返回 HTTP `200 OK`，响应是裸对象，不带 `data`、`code` 或 `codeMsg` 包络：

```json
{
  "id": "cvt-2026-08-24-1234567890123456"
}
```

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | string | 异步任务 ID，用于查询任务状态与结果 |

创建成功只代表任务已受理，不代表视频已经生成完成。请保存 `id` 并调用查询接口。

## 8. 查询视频任务

```http
GET /api/v2/lanox-videos/tasks/{taskId}
```

### 8.1 查询示例

```bash
curl "https://api.lanox.ai/api/v2/lanox-videos/tasks/cvt-2026-08-24-1234567890123456" \
  -H "Authorization: Bearer $API_KEY"
```

普通 API Key 查询按该 Key 所属用户隔离。不存在或不属于当前用户的任务返回业务码 `404`；Grok 任务查询时仍会检查当前 API Key 的 Grok 权限。

### 8.2 任务状态

| 状态 | 含义 | 是否终态 |
| ---- | ---- | -------- |
| `queued` | 已创建，等待执行 | 否 |
| `running` | 正在生成或后处理 | 否 |
| `succeeded` | 生成成功 | 是 |
| `failed` | 生成失败 | 是 |
| `cancelled` | 任务已取消 | 是 |
| `expired` | 任务或结果已过期 | 是 |

上游的 `reviewing`、`processing` 等状态会映射到上述统一状态。建议每 `10–30` 秒查询一次，并在客户端设置总超时。

### 8.3 查询响应字段

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | string | 任务 ID |
| `model` | string | 实际模型编码 |
| `status` | string | 统一任务状态 |
| `error` | object/null | 失败错误；非失败状态通常为 `null` |
| `error.code` | string | 错误码 |
| `error.message` | string | 错误说明 |
| `created_at` | integer/null | 创建时间，Unix 秒 |
| `updated_at` | integer/null | 更新时间，Unix 秒 |
| `content` | object | 结果对象 |
| `content.video_url` | string/null | 成功后的视频地址 |
| `content.last_frame_url` | string/null | 请求并成功生成最后一帧时的图片地址 |
| `seed` | integer/null | 请求保存的随机种子；未传时常见为 `-1`，不保证等于供应商实际采样种子 |
| `resolution` | string/null | 实际分辨率 |
| `ratio` | string/null | 实际画幅 |
| `duration` | integer/null | 视频时长，秒 |
| `frames` | integer/null | 帧数 |
| `framespersecond` | integer/null | 实际帧率 |
| `generate_audio` | boolean/null | 是否包含生成音频 |
| `safety_identifier` | string/null | 最终用户安全标识 |
| `priority` | integer/null | 优先级 |
| `draft` | boolean/null | 是否为草稿 |
| `draft_task_id` | string/null | 输入草稿任务 ID |
| `service_tier` | string/null | 实际服务等级 |
| `execution_expires_after` | integer/null | 任务执行超时阈值，秒 |
| `usage` | object | 用量对象；统一视频结算不以此 Token 数作为计价单位 |
| `usage.completion_tokens` | integer | 完成 Token 数 |
| `usage.total_tokens` | integer | 总 Token 数 |

### 8.4 处理中响应示例

```json
{
  "id": "cvt-2026-08-24-1234567890123456",
  "model": "dreamina-seedance-2-0-260128",
  "status": "running",
  "error": null,
  "created_at": 1787529600,
  "updated_at": 1787529660,
  "content": {
    "video_url": null,
    "last_frame_url": null
  },
  "seed": -1,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "frames": null,
  "framespersecond": null,
  "generate_audio": false,
  "safety_identifier": null,
  "priority": 0,
  "draft": false,
  "draft_task_id": null,
  "service_tier": "default",
  "execution_expires_after": 172800,
  "usage": {
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

### 8.5 成功响应示例

```json
{
  "id": "cvt-2026-08-24-1234567890123456",
  "model": "dreamina-seedance-2-0-260128",
  "status": "succeeded",
  "error": null,
  "created_at": 1787529600,
  "updated_at": 1787529900,
  "content": {
    "video_url": "https://example.com/generated/video.mp4",
    "last_frame_url": "https://example.com/generated/last-frame.png"
  },
  "seed": 12345,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "frames": 120,
  "framespersecond": 24,
  "generate_audio": true,
  "safety_identifier": null,
  "priority": 0,
  "draft": false,
  "draft_task_id": null,
  "service_tier": "default",
  "execution_expires_after": 172800,
  "usage": {
    "completion_tokens": 50638,
    "total_tokens": 50638
  }
}
```

`video_url` 只有有限有效期：非 Grok 任务通常按完成时间派生约 24 小时，Grok 任务优先采用上游返回的 `expires_at`。任务成功后请立即下载或转存，不要把该地址当作永久存储；地址过期后任务状态可能显示为 `expired`。

### 8.6 失败响应示例

任务已创建但异步执行失败时，查询仍返回裸任务对象：

```json
{
  "id": "cvt-2026-08-24-1234567890123456",
  "model": "grok-imagine-video",
  "status": "failed",
  "error": {
    "code": "task_failed",
    "message": "视频生成失败"
  },
  "created_at": 1787529600,
  "updated_at": 1787529700,
  "content": {
    "video_url": null,
    "last_frame_url": null
  },
  "seed": null,
  "resolution": "480p",
  "ratio": "16:9",
  "duration": 8,
  "frames": null,
  "framespersecond": null,
  "generate_audio": null,
  "safety_identifier": null,
  "priority": null,
  "draft": null,
  "draft_task_id": null,
  "service_tier": null,
  "execution_expires_after": 172800,
  "usage": {
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

## 9. 错误响应：必须读取业务 `code`

统一视频接口的参数错误、鉴权错误、余额错误和任务不存在等业务错误，当前通常仍返回 HTTP `200 OK`，响应使用 `ApiResponse` 包络：

```json
{
  "data": null,
  "code": "400",
  "codeMsg": "content[0].text 不能为空"
}
```

| 业务码示例 | 含义 |
| ---------- | ---- |
| `400` | JSON 结构、字段、内容组合或模型参数不正确 |
| `401` | API Key 缺失、无效或已停用 |
| `402` | 余额或预算不足 |
| `403` 或 Grok 权限分类码 | 当前 API Key 无模型访问权限 |
| `404` | 任务不存在或不属于当前用户 |
| `429` | 并发、风控或上游限流 |
| `5xx` 类业务码 | 服务或上游暂不可用 |

Wan 3.0 常见参数错误包括：使用 `driving_audio` 代替 `reference_audio`、传入 `draft_task`/`reference_voice`、传入 `negative_prompt` 或 Seedance 超分字段。此类错误会在创建阶段返回业务码 `400`，不会创建任务。

客户端必须同时处理三类 HTTP `200` 响应：

- 创建成功：裸对象，存在 `id`，没有 `code`。
- 查询成功：裸任务对象，存在 `id`、`status`，没有 `code`。
- 业务失败：存在字符串 `code` 且 `code` 不等于 `"200"`，通常 `data=null`，并通过 `codeMsg` 说明原因。

不要仅根据 HTTP 状态判断调用成功，也不要把错误包络误当成已创建任务。

## 10. 轮询与结果保存建议

1. 创建请求返回后，先检查响应是否存在业务 `code`；只有裸对象中的非空 `id` 才是任务 ID。
2. 每 `10–30` 秒调用查询接口，避免高频轮询。
3. 对 `queued`、`running` 继续轮询；对 `succeeded`、`failed`、`cancelled`、`expired` 停止轮询。
4. 设置合理的客户端总超时；异步任务执行时长受模型、分辨率、时长和排队情况影响。
5. `succeeded` 后立即下载或转存 `content.video_url`，如有需要也保存 `content.last_frame_url`。
6. 网络超时后的创建请求不可假设已失败。由于当前无视频幂等键契约，盲目重试可能创建重复任务，建议在业务侧记录请求并谨慎重试。

## 11. 计费与余额说明

- 企业 API Key 会在创建前执行钱包和员工预算校验；预算或余额不足时返回业务错误包络。
- 个人账户在余额不足等情况下，任务也可能先进入等待状态，对外表现为 `queued`；应以查询状态和错误为准。
- 任务按创建时冻结的账户售价和可信用量结算。`usage.completion_tokens`、`usage.total_tokens` 是兼容字段，不等同于视频价格。
- 生成失败、取消或过期通常不按成功视频收取生成费；Seedance 链式超分属于独立处理能力，可能产生额外费用，具体以账户报价和账单为准。
- Wan 3.0 的 `duration=-1` 是智能时长请求，不应在客户端按 `-1` 计价；最终结算使用系统确认的实际视频用量和任务创建时冻结的价格规则。
- 视频模型与价格会动态调整，本文档不硬编码统一视频公开价。客户端应以账户模型目录、价格查询结果和最终账单为准。
- Seedance 开启链式超分时，超分服务读取原视频会由服务端自动切换到配置的加速域名；调用方仍只提交原始素材 URL，无需自行改写。该内部读取地址不会改变统一查询接口返回字段的语义。

## 12. 从旧专用接口迁移

旧的供应商专用接口可继续作为兼容入口，但新接入建议统一迁移到 `/api/v2/lanox-videos/generations`：

| 原输入形态 | 统一 `content[]` 表达 |
| ---------- | -------------------- |
| 文生视频 | `{"type":"text","text":"..."}` |
| 首帧生视频 | 文本项 + `image_url`，`role=first_frame` |
| 尾帧约束 | `image_url`，`role=last_frame` |
| 参考图生视频 | 文本项 + 一个或多个 `image_url`，`role=reference_image` |
| 参考视频生视频 | 文本项 + `video_url`，`role=reference_video` |
| 视频编辑 | `video_url`，`role=video`，按模型需要附加文本和参考图 |
| 驱动音频 | `audio_url`，`role=driving_audio` |
| 草稿续作 | `draft_task.id` |

选择具体 `model` 后，仍需遵守第 6 节对应模型族的素材组合与字段白名单。统一端点消除了“文字生视频”和“首帧生视频”的路径差异，但不会取消模型本身的能力约束。

迁移到 `wan3.0-video` 时要特别调整角色：旧 Wan 2.7 的 `video`/`first_clip` 应按实际用途改为 `reference_video`，`driving_audio` 改为 `reference_audio`；不能直接把旧请求只替换模型名后原样发送。
