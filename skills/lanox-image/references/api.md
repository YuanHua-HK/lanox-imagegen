# Lanox Image 图片异步生成与编辑 API 文档（统一版）

本文档说明 `lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst`、`lanox-banana-2`、`lanox-grok-imagine`、`lanox-grok-imagine-quality` 的异步图片生成、图片编辑和任务查询接口。推荐统一使用 `/generations`：不传参考图时执行文生图，传入 `image_url`、`images` 或 multipart `image` 时自动执行图片编辑，客户端不需要区分两个任务入口。

> 文档版本：2026-09-09（新增 Lanox Image 2.5 Flare / Sunburst）。本文档描述的是 Lanox 对外产品模型与异步任务契约，不应把内部真实模型名、供应商端点或同步图片接口直接暴露给客户端。

## 1. 基础信息

| 项目             | 说明                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Base URL         | `https://api.lanox.ai`                                                                              |
| 鉴权方式         | `Authorization: Bearer <API_KEY>`                                                                   |
| 调用方式         | 创建任务后，通过任务 ID 轮询查询结果                                                                  |
| 模型             | `lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst`、`lanox-banana-2`、`lanox-grok-imagine`、`lanox-grok-imagine-quality`             |
| 默认模型         | 不传 `model` 时使用 `lanox-image-2`                                                                  |
| 单次输入图片数量 | 取决于模型和请求形式；两个 Grok 模型的 JSON 编辑支持 1～3 张，multipart 编辑支持 1 个 `image` 文件 |
| 单次结果数量     | 1 张                                                                                                  |
| 结果交付         | 成功后通过任务对象的 `data[0].url` 返回 OSS 签名地址；`lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst` 固定为 PNG，其余模型以实际结果格式为准 |

接口一览：

| 能力                       | Method | Path                                    | Content-Type                                    |
| -------------------------- | ------ | --------------------------------------- | ----------------------------------------------- |
| 图片生成或自动编辑（推荐） | POST   | `/api/v2/lanox-images/generations`    | `application/json` 或 `multipart/form-data` |
| 图片编辑（兼容入口）       | POST   | `/api/v2/lanox-images/edits`          | `multipart/form-data` 或 `application/json` |
| 查询任务                   | GET    | `/api/v2/lanox-images/tasks/{taskId}` | —                                              |

最短接入流程：

1. 调用 `/generations` 创建任务；HTTP `202` 且响应中存在非空 `id` 才表示受理成功。
2. 保存任务 `id`，每隔 `2–5` 秒查询一次 `/tasks/{taskId}`。
3. `status=succeeded` 时立即下载或转存 `data[0].url`；`failed` 时读取 `error.code` 和 `error.message`。
4. 创建请求建议始终携带业务侧唯一的 `Idempotency-Key`，网络超时后使用相同 Key 和完全相同的请求重试。

## 2. 图片规格

图片规格主要通过 `aspect_ratio + resolution` 表达，但允许值和必填规则取决于模型及操作类型。`resolution` 均为必填；`aspect_ratio` 对 `lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst`、`lanox-banana-2` 必填，Grok 文生图可省略并默认使用 `1:1`，Grok 图片编辑则不支持该参数，显式传入会返回 HTTP `400`。

### 2.1 `lanox-image-2`

`aspect_ratio` 支持：`1:1`、`3:2`、`2:3`、`16:9`、`9:16`、`4:3`、`3:4`、`21:9`、`9:21`、`1:3`、`3:1`、`2:1`、`1:2`。

`aspect_ratio` 用于指导图片构图方向，不保证最终像素宽高严格等于数学比例。`resolution` 支持 `1080p`、`2k`、`4k`，大小写兼容。

当前交付规则如下。`2k`/`4k` 会进入图片处理 Worker；处理失败时任务进入 `failed`，不会回退为未处理的原图。

| `resolution` | 交付说明 |
| ------------ | -------- |
| `1080p`      | 直接交付模型基础原图，实际宽高以结果为准，不承诺固定 1920 px 长边 |
| `2k`         | Worker 处理目标长边为 2560 px |
| `4k`         | Worker 处理目标长边为 3840 px |

### 2.1.1 `lanox-image-2.5-flare` 与 `lanox-image-2.5-sunburst`

两个新增模型均支持文生图、单图编辑和 JSON 多图编辑，使用相同的 `/generations`、`/edits` 和任务查询接口。调用时在 `model` 中填写完整名称；不传 `model` 时仍使用 `lanox-image-2`。

- `aspect_ratio` 必填，允许值与第 2.1 节一致：`1:1`、`3:2`、`2:3`、`16:9`、`9:16`、`4:3`、`3:4`、`21:9`、`9:21`、`1:3`、`3:1`、`2:1`、`1:2`。
- `resolution` 必填，支持 `1080p`、`2k`、`4k`，大小写兼容。
- 每个任务固定交付一张 PNG 图片，通过成功任务的 `data[0].url` 获取。
- 参考图参数沿用第 3.3 节：JSON 使用 `image_url` 或 `images`，multipart 使用一个 `image` 文件或 `image_url`；同一请求中的两种输入方式互斥。
- 两个模型的用量记录分别保留各自完整模型名称。

### 2.2 `lanox-banana-2`

`aspect_ratio` 支持：`1:1`、`1:4`、`1:8`、`2:3`、`3:2`、`3:4`、`4:1`、`4:3`、`4:5`、`5:4`、`8:1`、`9:16`、`16:9`、`21:9`。

`resolution` 支持 `512`、`1K`、`2K`、`4K`。`K` 同时兼容小写，例如 `1k`、`2k`、`4k`；响应按对应的大写档位处理。该模型不接受 `1080p`。

以下为当前线上接口的输出尺寸观察值。标记为“实测”的画幅已逐档调用线上接口验证；标记为“宽高反转”的画幅与对应实测画幅互为横竖版，尺寸按实测结果交换宽高。供应商画布策略变化时，实际像素可能调整：

| `aspect_ratio` | 尺寸来源 |   `512` |     `1K` |     `2K` |      `4K` |
| ---------------- | -------- | --------: | ---------: | ---------: | ----------: |
| `1:1`          | 实测     |  512×512 | 1024×1024 | 2048×2048 |  4096×4096 |
| `1:4`          | 实测     | 256×1024 |  512×2064 | 1024×4128 |  2048×8256 |
| `4:1`          | 宽高反转 | 1024×256 |  2064×512 | 4128×1024 |  8256×2048 |
| `1:8`          | 实测     | 176×1456 |  352×2928 |  704×5856 | 1408×11712 |
| `8:1`          | 宽高反转 | 1456×176 |  2928×352 |  5856×704 | 11712×1408 |
| `2:3`          | 实测     |  416×624 |  848×1264 | 1696×2528 |  3392×5056 |
| `3:2`          | 宽高反转 |  624×416 |  1264×848 | 2528×1696 |  5056×3392 |
| `3:4`          | 实测     |  448×592 |  896×1200 | 1792×2400 |  3584×4800 |
| `4:3`          | 宽高反转 |  592×448 |  1200×896 | 2400×1792 |  4800×3584 |
| `4:5`          | 实测     |  464×576 |  928×1152 | 1856×2304 |  3712×4608 |
| `5:4`          | 宽高反转 |  576×464 |  1152×928 | 2304×1856 |  4608×3712 |
| `9:16`         | 宽高反转 |  384×688 |  768×1376 | 1536×2752 |  3072×5504 |
| `16:9`         | 实测     |  688×384 |  1376×768 | 2752×1536 |  5504×3072 |
| `21:9`         | 实测     |  784×336 |  1584×672 | 3168×1344 |  6336×2688 |

`resolution` 表示模型的分辨率档位，不表示图片长边像素。同一档位在不同画幅下会产生不同的实际宽高。

### 2.3 Grok 图片模型

两个 Grok 产品都支持文生图和图片编辑：

| 对外模型 | 能力 | `n` |
| -------- | ---- | --- |
| `lanox-grok-imagine` | Grok Imagine 标准文生图与图片编辑 | 固定为 `1` |
| `lanox-grok-imagine-quality` | Grok Imagine 高质量文生图与图片编辑 | 固定为 `1` |

调用方只需使用本文档中的 Lanox 模型名；服务端会根据有无参考图自动选择生成或编辑能力。

Grok 文生图的 `aspect_ratio` 可省略，默认 `1:1`；支持以下 14 个值：

`auto`、`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`2:1`、`1:2`、`19.5:9`、`9:19.5`、`20:9`、`9:20`。

Grok 图片编辑支持以下参考图输入：

- JSON 单图：传 `image_url`。
- JSON 多图：传 `images[].image_url`，共 1～3 张；`image_url` 与 `images` 互斥。
- multipart 文件：传一个 `image` 文件。服务端会先上传 OSS，再使用临时签名 URL 调用 Grok 编辑能力。

Grok 编辑使用远程图片时，URL 必须是公网可访问的 HTTPS 地址。Data URL 只支持 PNG、JPEG、WebP；解码后每张图片不超过 10 MiB，全部输入图片合计不超过 20 MiB。Grok 编辑不支持 `aspect_ratio`，显式传入会返回 HTTP `400`。

Grok 的 `resolution` 可省略或显式传 `null`，缺省按 `1K` 处理；显式值只支持 `1K`、`2K`，大小写兼容。JSON 请求如显式传 `n`，必须是整数 `1`；通常直接省略即可。Grok 上游结果由服务端转存 OSS，对外仍通过任务查询响应的 `data[].url` 交付。两个 Grok 模型使用与其他模型相同的标准 API Key 鉴权方式。

## 3. 创建图片生成或自动编辑任务（推荐）

```http
POST /api/v2/lanox-images/generations
```

`/generations` 是六个模型的统一入口。服务根据请求中是否出现参考图自动选择操作，客户端不需要额外传 `task_type` 或 `action`：不传参考图执行文生图，传入参考图执行图片编辑。

| 请求形式  | 参考图字段                      | 实际操作             |
| --------- | ------------------------------- | -------------------- |
| JSON      | 不传`image_url` 和 `images` | 文生图`generation` |
| JSON      | 传`image_url`                 | 图片编辑`edit`     |
| JSON      | 传非空 `images` 数组          | 图片编辑 `edit`    |
| multipart | 不传`image` 和 `image_url`  | 文生图`generation` |
| multipart | 传`image` 文件                | 图片编辑`edit`     |
| multipart | 传`image_url`                 | 图片编辑`edit`     |

创建成功后的响应、任务查询方式和计费方式不因自动选择结果而改变。

两个 Grok 模型使用 JSON 时支持 `image_url` 或 `images`，使用 multipart 时支持一个 `image` 文件。Grok multipart 文件由服务端上传 OSS，并以临时签名 URL 执行编辑；Grok 客户端无需自行完成该转换。multipart `image_url` 适用于其他可编辑模型，Grok 编辑请使用 JSON URL 或 multipart 文件。

注意：JSON 请求只要出现 `image_url` 或 `images` 字段，就会进入编辑校验；空字符串、`null`、空数组或无效数组项不会退化为文生图，而是返回 HTTP `400`。

### 3.1 请求头

| 请求头              | 必填 | 说明                                                                                                                        |
| ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `Authorization`   | 是   | 格式：`Bearer <API_KEY>`                                                                                                  |
| `Content-Type`    | 是   | `application/json; charset=utf-8` 或 `multipart/form-data`；multipart 必须包含正确的 boundary，使用 cURL 时无需手动设置 |
| `Idempotency-Key` | 否   | 请求幂等标识，最长 128 个字符；同一个 Key 不可用于不同请求                                                                  |

### 3.2 公共参数

| 参数             | 类型   | 必填 | 默认值            | 说明                                             |
| ---------------- | ------ | ---- | ----------------- | ------------------------------------------------ |
| `model`        | string  | 否   | `lanox-image-2` | 六个支持模型之一，见第 1 节                                      |
| `prompt`       | string  | 是   | —                | 图片内容、风格和构图描述                                         |
| `aspect_ratio` | string  | 条件必填 | Grok 文生图默认 `1:1` | 非 Grok 必填；Grok 文生图可省略，Grok 编辑必须省略；允许值取决于 `model`，见第 2 节 |
| `resolution`   | string  | 条件必填 | Grok 缺省 `1K` | 图片分辨率档位；非 Grok 模型必填，Grok 可省略或传 `null`，允许值取决于 `model`，见第 2 节 |
| `n`            | integer | 否   | `1`              | 所有模型固定为 `1`；Grok JSON 如显式传入，必须是数值类型的整数 `1` |

图片规格按模型和操作类型使用 `aspect_ratio`、`resolution`；不需要传入 `size` 或 `image_size`。Grok 编辑只传 `resolution`。结果统一以 URL 交付；`lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst` 固定为 PNG，其余模型的文件格式以实际结果为准。

### 3.3 JSON 参考图参数

| 参数                   | 类型     | 必填                | 说明                                                                                                                      |
| ---------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `image_url`          | string   | 否                  | 单张参考图片的完整 HTTP/HTTPS URL 或 Base64 Data URL，字段字符串最长 20 MiB；`lanox-banana-2` 和两个 Grok 模型的远程 URL 仅接受公网 HTTPS |
| `images`             | object[] | 否                  | 多张参考图片，至少 1 项；`lanox-banana-2` 最多 4 项，两个 Grok 模型支持 1～3 项 |
| `images[].image_url` | string   | 使用 `images` 时是 | 完整 HTTP/HTTPS URL 或 Base64 Data URL，字段字符串最长 20 MiB；`lanox-banana-2` 和两个 Grok 模型另有单图 10 MiB、合计 20 MiB 的解码后限制 |

JSON 请求中 `image_url` 和 `images` 不能同时传入。字段存在但为空、`images` 为空数组、数组项缺少有效 `image_url`，均返回 HTTP `400`。

Base64 输入在创建时先按 Data URL 语法校验；实际 Base64 解码和图片格式校验可能在异步执行阶段完成。对于 `lanox-banana-2` 和两个 Grok 模型，只接受 PNG/JPEG/WebP，解码后的单张图片不超过 10 MiB、全部参考图合计不超过 20 MiB；其远程 URL 必须是可公开访问的 HTTPS 公网地址，不能指向本机或私网。`lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst` 的远程 URL 可使用 HTTP/HTTPS。

### 3.4 JSON 文生图示例

```json
{
  "model": "lanox-image-2",
  "prompt": "一只坐在窗边看雨的橘猫，主体居中，柔和自然光，电影感构图",
  "aspect_ratio": "9:16",
  "resolution": "4k"
}
```

对应的 cURL：

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Idempotency-Key: lanox-generation-20260726-001" \
  -d '{
    "model": "lanox-image-2",
    "prompt": "一只坐在窗边看雨的橘猫，主体居中，柔和自然光，电影感构图",
    "aspect_ratio": "9:16",
    "resolution": "4k"
  }'
```

### 3.5 JSON 单图自动编辑示例

下面的请求因为包含 `image_url`，会自动按 `edit` 执行：

```json
{
  "model": "lanox-banana-2",
  "prompt": "保留杯子的造型，把背景改为薄荷绿色，并增加柔和轮廓光",
  "image_url": "https://example.com/source-cup.jpg",
  "aspect_ratio": "1:1",
  "resolution": "1K"
}
```

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Idempotency-Key: lanox-generation-url-edit-001" \
  -d '{
    "model": "lanox-banana-2",
    "prompt": "保留杯子的造型，把背景改为薄荷绿色，并增加柔和轮廓光",
    "image_url": "https://example.com/source-cup.jpg",
    "aspect_ratio": "1:1",
    "resolution": "1K"
  }'
```

### 3.6 JSON 多图自动编辑示例

下面的请求因为包含非空 `images` 数组，会自动按 `edit` 执行：

```json
{
  "model": "lanox-image-2",
  "prompt": "融合第一张图的主体与第二张图的视觉风格，保持主体清晰",
  "images": [
    {"image_url": "https://example.com/subject.png"},
    {"image_url": "https://example.com/style.png"}
  ],
  "aspect_ratio": "16:9",
  "resolution": "2k"
}
```

### 3.7 multipart 文生图示例

multipart 请求不包含 `image` 和 `image_url` 时仍按文生图执行：

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: lanox-multipart-generation-001" \
  -F "model=lanox-banana-2" \
  -F "prompt=未来城市上空的悬浮花园，广角构图，清晨柔光，细节丰富" \
  -F "aspect_ratio=16:9" \
  -F "resolution=2K"
```

### 3.8 multipart 图片自动编辑示例

上传文件时，包含 `image` 即自动按图片编辑执行：

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: lanox-generation-file-edit-001" \
  -F "image=@./input.png;type=image/png" \
  -F "model=lanox-image-2" \
  -F "prompt=保留主体造型，把背景改为雨夜霓虹街道" \
  -F "aspect_ratio=16:9" \
  -F "resolution=2k"
```

也可以不上传文件，改传 `image_url`：

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: lanox-generation-multipart-url-edit-001" \
  -F "image_url=https://example.com/source.jpg" \
  -F "model=lanox-banana-2" \
  -F "prompt=保留主体，把背景改为浅蓝色摄影棚" \
  -F "aspect_ratio=1:1" \
  -F "resolution=512"
```

multipart 请求中 `image` 和 `image_url` 不能同时传入。空文件或空 `image_url` 会返回 HTTP `400`；无效图片也可能在后续上游校验中失败。为确保正确识别，上传 PNG、JPEG、WebP 时建议分别使用 `image/png`、`image/jpeg`、`image/webp`，不要使用 `application/octet-stream`。

### 3.9 `lanox-banana-2` 文生图示例

```json
{
  "model": "lanox-banana-2",
  "prompt": "未来城市上空的悬浮花园，广角构图，清晨柔光，细节丰富",
  "aspect_ratio": "16:9",
  "resolution": "2K"
}
```

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Idempotency-Key: lanox-banana-generation-001" \
  -d '{
    "model": "lanox-banana-2",
    "prompt": "未来城市上空的悬浮花园，广角构图，清晨柔光，细节丰富",
    "aspect_ratio": "16:9",
    "resolution": "2K"
  }'
```

### 3.10 Grok 文生图示例

标准模型：

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Idempotency-Key: lanox-grok-generation-001" \
  -d '{
    "model": "lanox-grok-imagine",
    "prompt": "雨后的东京街头，霓虹灯倒映在路面，电影感摄影",
    "aspect_ratio": "16:9",
    "resolution": "2K"
  }'
```

高质量模型：

```json
{
  "model": "lanox-grok-imagine-quality",
  "prompt": "精细的东方幻想城市概念设计，云海、宫殿与晨光",
  "resolution": "1K"
}
```

第二个示例省略 `aspect_ratio`，因此使用默认值 `1:1`。Grok 文生图如显式传 `n`，必须在 JSON 中传整数 `1`；通常建议省略。

### 3.11 Grok JSON 单图自动编辑示例

请求包含 `image_url`，因此会自动执行图片编辑。Grok 编辑不得传 `aspect_ratio`：

```json
{
  "model": "lanox-grok-imagine",
  "prompt": "把背景改成雨夜霓虹街道",
  "image_url": "https://example.com/source.png",
  "resolution": "1K"
}
```

### 3.12 Grok JSON 多图自动编辑示例

两个 Grok 模型都支持 1～3 张 JSON 参考图；远程 URL 与 Data URL 可以混合使用：

```json
{
  "model": "lanox-grok-imagine-quality",
  "prompt": "保留第一张图主体，参考第二张图的色彩与光影",
  "images": [
    {"image_url": "https://example.com/subject.png"},
    {"image_url": "data:image/png;base64,<合法Base64内容>"}
  ],
  "resolution": "2K"
}
```

### 3.13 Grok multipart 文件自动编辑示例

Grok multipart 编辑接受一个 `image` 文件。文件由服务端上传至 OSS，随后通过临时签名 URL 执行编辑：

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/generations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: lanox-grok-file-edit-001" \
  -F "image=@./input.png;type=image/png" \
  -F "model=lanox-grok-imagine-quality" \
  -F "prompt=保留主体，把背景改为电影感雨夜街道" \
  -F "resolution=2K"
```

Grok 编辑示例均不包含 `aspect_ratio`；显式传入该参数会返回 HTTP `400`。Data URL 的 `<合法Base64内容>` 仅为占位符，实际调用时必须替换为完整、可解码且 MIME 正确的数据。

### 3.14 Lanox Image 2.5 调用示例

`lanox-image-2.5-flare` 文生图，请求 `POST /api/v2/lanox-images/generations`：

```json
{
  "model": "lanox-image-2.5-flare",
  "prompt": "雨后花园中的玻璃温室，清晨自然光，写实摄影风格",
  "aspect_ratio": "16:9",
  "resolution": "1080p"
}
```

`lanox-image-2.5-sunburst` 单图自动编辑，同样请求 `POST /api/v2/lanox-images/generations`：

```json
{
  "model": "lanox-image-2.5-sunburst",
  "prompt": "保留主体造型，将背景改为柔和的日落海岸",
  "image_url": "https://example.com/source.png",
  "aspect_ratio": "3:4",
  "resolution": "2k"
}
```

两个示例中的 `model` 均可替换为另一新增模型；需要 4K 档位时将 `resolution` 改为 `4k`。请求头、HTTP `202` 受理响应、幂等与轮询流程均沿用本文档的公共说明。

## 4. 创建图片编辑任务（兼容入口）

```http
POST /api/v2/lanox-images/edits
```

`/edits` 为已有客户端保留，仍然只执行图片编辑。新接入建议统一使用第 3 节的 `/generations`，并通过是否传入参考图自动选择生成或编辑。

`/edits` 支持 `lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst`、`lanox-banana-2`、`lanox-grok-imagine` 和 `lanox-grok-imagine-quality`。两个 Grok 模型在该入口的参数约束与 `/generations` 自动编辑一致。

兼容入口支持两种输入方式：

- `multipart/form-data`：上传一个本地图片文件，或者为非 Grok 模型传入一个 `image_url`；Grok multipart 编辑使用一个 `image` 文件。
- `application/json`：六个模型都支持 `image_url` 单图编辑或 `images` 多图编辑；`lanox-banana-2` 最多支持 4 张，两个 Grok 模型支持 1～3 张。

### 4.1 multipart 文件上传

#### 请求头

| 请求头              | 必填 | 说明                                                                       |
| ------------------- | ---- | -------------------------------------------------------------------------- |
| `Authorization`   | 是   | 格式：`Bearer <API_KEY>`                                                 |
| `Content-Type`    | 是   | `multipart/form-data`；必须包含正确的 boundary，使用 cURL 时无需手动设置 |
| `Idempotency-Key` | 否   | 请求幂等标识，最长 128 个字符；同一个 Key 不可用于不同请求或不同图片       |

#### 表单参数

| 参数             | 类型   | 必填     | 默认值            | 说明                                                                                                                           |
| ---------------- | ------ | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `image`        | file   | 条件必填 | —                | 待编辑图片，单个文件，最大 20 MiB；建议使用 PNG、JPEG 或 WebP，并携带与文件一致的图片 MIME 类型                              |
| `image_url`    | string | 条件必填 | —                | 完整图片 URL 或 Base64 Data URL；字段字符串最长 20 MiB，不能与 `image` 同时传入；Grok multipart 编辑不使用此字段 |
| `model`        | string | 否       | `lanox-image-2` | 六个支持模型之一，见第 1 节                                                                                                    |
| `prompt`       | string | 是       | —                | 对图片的编辑要求                                                                                                               |
| `aspect_ratio` | string | 条件必填 | —                | 非 Grok 模型必填；Grok 编辑不支持，必须省略                                                                                      |
| `resolution`   | string | 条件必填 | Grok 缺省 `1K` | 图片分辨率档位；非 Grok 模型必填，Grok 可省略或传 `null`，允许值取决于 `model`，见第 2 节                       |

`image` 和 `image_url` 必须二选一。Grok multipart 编辑必须传一个 `image` 文件；服务端会将文件上传 OSS，并以有效期 10 分钟的临时签名 URL 执行编辑。该接口不提供单独的 `mask` 文件参数。

为确保上游正确识别，上传 PNG、JPEG 和 WebP 时建议分别使用 `image/png`、`image/jpeg` 和 `image/webp`，不要使用 `application/octet-stream`。MIME 和真实文件内容的最终校验可能在异步执行阶段完成。

#### cURL 示例

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/edits" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Idempotency-Key: lanox-edit-20260726-001" \
  -F "image=@./input.png;type=image/png" \
  -F "model=lanox-image-2" \
  -F "prompt=保留主体造型，把背景改为雨夜霓虹街道，主体居中，写实摄影风格" \
  -F "aspect_ratio=16:9" \
  -F "resolution=2k"
```

### 4.2 JSON URL、Base64 或多图编辑

请求头：

| 请求头              | 必填 | 说明                                                                 |
| ------------------- | ---- | -------------------------------------------------------------------- |
| `Authorization`   | 是   | 格式：`Bearer <API_KEY>`                                           |
| `Content-Type`    | 是   | `application/json; charset=utf-8`                                  |
| `Idempotency-Key` | 否   | 请求幂等标识，最长 128 个字符；同一个 Key 不可用于不同请求或不同图片 |

请求参数：

| 参数                   | 类型     | 必填                | 默认值            | 说明                                                                                                                                    |
| ---------------------- | -------- | ------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `model`              | string   | 否                  | `lanox-image-2` | 六个支持模型之一，见第 1 节                                                                                                          |
| `prompt`             | string   | 是                  | —                | 对图片的编辑要求                                                                                                                        |
| `image_url`          | string   | 条件必填            | —                | 单张参考图片的完整 HTTP/HTTPS URL 或 Base64 Data URL；字段字符串最长 20 MiB，不能与 `images` 同时传入；`lanox-banana-2` 和 Grok 仅接受公网 HTTPS URL 或 Base64 Data URL |
| `images`             | object[] | 条件必填            | —                | 参考图片数组，至少 1 项；不能与 `image_url` 同时传入；`lanox-banana-2` 最多 4 项，两个 Grok 模型支持 1～3 项                  |
| `images[].image_url` | string   | 使用 `images` 时是 | —                | 完整图片 URL 或 Base64 Data URL；字段字符串最长 20 MiB；`lanox-banana-2` 和 Grok 另有单图 10 MiB、合计 20 MiB 的解码后限制 |
| `aspect_ratio`       | string   | 条件必填            | —                | 非 Grok 模型必填；Grok 编辑不支持，显式传入会返回 HTTP `400`                                                                        |
| `resolution`         | string   | 条件必填            | Grok 缺省 `1K`    | 图片分辨率档位；非 Grok 模型必填，Grok 可省略或传 `null`，允许值取决于 `model`，见第 2 节                         |

`image_url` 和 `images` 必须二选一。Grok 的远程 URL 必须为公网可访问的 HTTPS 地址；Grok Data URL 只支持 PNG/JPEG/WebP，解码后每张不超过 10 MiB、全部图片合计不超过 20 MiB。

下方 Data URL 示例中的 `<合法Base64内容>` 是占位符，实际请求必须替换为完整、可解码且与 MIME 一致的 Base64 数据。

#### `lanox-image-2` JSON 多图编辑示例

```json
{
  "model": "lanox-image-2",
  "prompt": "融合第一张图的主体与第二张图的视觉风格，保持主体清晰",
  "images": [
    {
      "image_url": "https://example.com/subject.png"
    },
    {
      "image_url": "https://example.com/style.png"
    }
  ],
  "aspect_ratio": "16:9",
  "resolution": "2k"
}
```

#### `lanox-banana-2` JSON 多图编辑示例

```json
{
  "model": "lanox-banana-2",
  "prompt": "保留第一张图的人物造型，参考第二张图的色彩和光影，生成电影海报",
  "images": [
    {
      "image_url": "https://example.com/reference-person.png"
    },
    {
      "image_url": "data:image/jpeg;base64,<合法Base64内容>"
    }
  ],
  "aspect_ratio": "3:4",
  "resolution": "2K"
}
```

```bash
curl -X POST "https://api.lanox.ai/api/v2/lanox-images/edits" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Idempotency-Key: lanox-banana-edit-001" \
  -d '{
    "model": "lanox-banana-2",
    "prompt": "保留第一张图的人物造型，参考第二张图的色彩和光影，生成电影海报",
    "images": [
      {"image_url": "https://example.com/reference-person.png"},
      {"image_url": "https://example.com/reference-style.png"}
    ],
    "aspect_ratio": "3:4",
    "resolution": "2K"
  }'
```

## 5. 创建成功响应

文生图和图片编辑任务创建成功时，均返回 HTTP `202 Accepted`：

```json
{
  "id": "imgtask_20260726856515565422",
  "object": "image.task",
  "status": "queued",
  "created_at": 1785031200
}
```

| 字段           | 类型    | 说明                            |
| -------------- | ------- | ------------------------------- |
| `id`         | string  | 任务 ID，用于查询任务状态和结果 |
| `object`     | string  | 固定为`image.task`            |
| `status`     | string  | 创建时通常为`queued`          |
| `created_at` | integer | 创建时间，Unix 秒               |

请保存返回的 `id`。创建成功只表示任务已受理，图片结果需要通过任务查询接口获取。

使用相同 `Idempotency-Key` 重放完全相同的请求时，接口会返回既有任务的当前对象，因此响应状态也可能已经是 `processing`、`succeeded` 或 `failed`，并相应携带 `completed_at`、`data` 或 `error`。

## 6. 查询任务

```http
GET /api/v2/lanox-images/tasks/{taskId}
```

文生图和图片编辑任务使用同一个查询接口。

### 6.1 请求参数

| 参数              | 位置   | 类型   | 必填 | 说明                         |
| ----------------- | ------ | ------ | ---- | ---------------------------- |
| `taskId`        | Path   | string | 是   | 创建接口返回的任务 ID        |
| `Authorization` | Header | string | 是   | 普通 API Key 查询时应使用创建任务所属用户的 API Key |

该接口没有 Query 参数。建议每隔 2–5 秒查询一次，直到任务进入终态。

### 6.2 查询示例

```bash
curl "https://api.lanox.ai/api/v2/lanox-images/tasks/imgtask_20260726856515565422" \
  -H "Authorization: Bearer $API_KEY"
```

### 6.3 任务状态

| 状态           | 含义                       | 是否终态 |
| -------------- | -------------------------- | -------- |
| `queued`     | 任务已创建，等待执行       | 否       |
| `processing` | 任务正在处理               | 否       |
| `succeeded`  | 任务成功，可以读取图片地址 | 是       |
| `failed`     | 任务失败，可以读取错误信息 | 是       |

### 6.4 排队或处理中响应

```json
{
  "id": "imgtask_20260726856515565422",
  "object": "image.task",
  "status": "processing",
  "created_at": 1785031200
}
```

任务完成前不会返回 `data` 字段。

### 6.5 成功响应

```json
{
  "id": "imgtask_20260726856515565422",
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

| 字段             | 类型     | 说明                                                       |
| ---------------- | -------- | ---------------------------------------------------------- |
| `id`           | string   | 任务 ID                                                    |
| `object`       | string   | 固定为`image.task`                                       |
| `status`       | string   | `succeeded`                                              |
| `created_at`   | integer  | 创建时间，Unix 秒                                          |
| `completed_at` | integer  | 完成时间，Unix 秒                                          |
| `data`         | object[] | 图片结果数组，固定包含 1 项                                |
| `data[0].url`  | string   | 有时效的图片下载地址，请及时下载或转存；实际格式取决于模型 |

### 6.6 失败响应

任务执行失败时，查询接口仍返回任务对象：

```json
{
  "id": "imgtask_20260726856515565422",
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

| 字段              | 类型   | 说明             |
| ----------------- | ------ | ---------------- |
| `error.code`    | string | 错误码           |
| `error.message` | string | 可展示的错误信息 |

失败任务不会返回 `data` 或图片地址。

常见异步失败说明：

| `error.code` 示例 | `error.message` 示例 | 含义与处理建议 |
| ----------------- | -------------------- | -------------- |
| `image_generation_failed` | `模型网关暂不可用` | 服务调用内部模型网关、读取模型响应或解析交付图片时发生异常。任务已经进入失败终态，不会自行恢复；确认服务恢复后，使用新的 `Idempotency-Key` 重新创建任务。 |
| `image_generation_failed` | 上游返回的安全审核或生成错误 | 请求已受理，但模型在异步执行阶段拒绝或未产出可交付图片。调整提示词或参考图后重新创建。 |
| `image_task_failed` | `图片任务执行失败` | 未取得更具体错误信息的通用执行失败。应结合请求 ID、任务 ID 和服务日志排查。 |
| 图片处理相关错误 | 图片下载、解码、存储或处理失败 | `lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst` 的 `2k`/`4k` 需要完成本地图片处理；处理失败时任务直接失败，不降级交付基础原图。 |

`模型网关暂不可用` 不代表提示词或图片参数一定有问题。常见触发条件包括：内部模型网关不可达、连接超时或中断、模型服务返回异常、响应不完整、暂时没有可用模型资源。该错误发生在异步执行阶段，因此创建接口可能已经成功返回 `queued`。

## 7. 接口错误

请求本身不合法时，接口使用真实 HTTP 状态码，并返回统一错误结构：

```json
{
  "error": {
    "code": "400",
    "message": "请求参数不正确"
  }
}
```

| HTTP 状态码 | 说明                                   |
| ----------- | -------------------------------------- |
| `400`     | 请求结构、空/超限图片、画幅或分辨率不正确；真实图片格式校验也可能在异步执行阶段导致任务 `failed` |
| `401`     | API Key 缺失、无效或已停用             |
| `403`     | 用户、模型或账户状态不允许调用         |
| `404`     | 任务不存在，或任务不属于当前 API Key 所属用户 |
| `409`     | `Idempotency-Key` 已用于不同请求     |
| `502`     | 模型网关或模型服务暂不可用；若发生在异步执行阶段，会体现在任务的 `error` 中 |
| `503`     | 图片处理服务、协调服务或其他必要依赖暂不可用 |
| `500`     | 未分类的服务端错误                     |

为避免暴露内部信息，创建阶段的 HTTP `5xx` 响应可能统一返回 `error.code=server_error` 和通用提示；异步任务已经创建时，则以查询结果中的 `status`、`error.code`、`error.message` 为准。

## 8. 调用注意事项

1. 推荐统一调用 `/api/v2/lanox-images/generations`：六个模型不传参考图是文生图，传入参考图自动变为图片编辑；`/edits` 支持六个模型，仅作为兼容入口保留。
2. 六个模型每个任务都只返回一张图片；`lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst` 固定 PNG，其他模型以实际 MIME 为准。
3. 非 Grok 模型的 `resolution` 始终必填；Grok 的 `resolution` 可省略或传 `null`，缺省为 `1K`。非 Grok 模型的 `aspect_ratio` 必填，Grok 文生图可省略并默认 `1:1`，Grok 编辑必须省略该参数。
4. `lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst` 支持 `1080p`、`2k`、`4k`，并额外支持 `1:3`、`3:1`；`lanox-banana-2` 支持 `512`、`1K`、`2K`、`4K`，其中 `K` 兼容小写；Grok 只支持 `1K`/`2K`。
5. 六个模型都支持 JSON `images` 多图编辑；`lanox-banana-2` 最多 4 张，Grok 为 1～3 张。multipart 编辑一次接受一个 `image` 文件。
6. JSON 中 `image_url` 与 `images` 互斥；multipart 中 `image` 与 `image_url` 互斥。Grok multipart 编辑使用 `image` 文件。显式传空值不会被当作文生图，而会返回 HTTP `400`。
7. `lanox-image-2`、`lanox-image-2.5-flare`、`lanox-image-2.5-sunburst` 的参考图 URL 可使用 HTTP/HTTPS；`lanox-banana-2` 和 Grok 的远程参考图必须是公网 HTTPS。Grok Data URL 仅支持 PNG/JPEG/WebP，解码后每张不超过 10 MiB、合计不超过 20 MiB。
8. 两个 Grok 模型与其他模型使用相同的标准 API Key 鉴权，不需要额外授权机制；图片编辑按一张成功交付结果计费，输入图或参考图不单独收费。
9. 普通 API Key 查询按所属用户隔离；受信 Lanox-TV 查询存在内部授权例外。外部客户端应使用创建任务所属用户的 API Key。
10. `Idempotency-Key` 最长 128 个字符，作用域为 API Key + endpoint + key；相同 Key 的规范化请求相同则复用原任务，不同请求返回 HTTP `409`。
11. `data[0].url` 默认是约一小时有效的 OSS 签名地址，任务成功后请及时下载或转存。
12. 服务端会覆盖或过滤不作为稳定能力公开的 `response_format`、`output_format` 等字段，调用方无需传入。当前不提供任务取消接口；任务失败不会返回 `data`，也不会按成功交付处理。
13. 创建请求网络超时但未拿到响应时，应使用原 `Idempotency-Key` 和完全相同的请求重放；不要立即换 Key，否则可能创建重复任务。已经查询到 `failed` 的任务是终态，修正问题后应换新 Key 创建新任务。
14. 日志和工单中可记录任务 ID、请求时间、模型、分辨率和业务请求 ID，但不要记录 API Key、完整 Base64 图片或带签名的结果 URL。
