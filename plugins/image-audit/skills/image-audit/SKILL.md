---
name: image-audit
description: Detects adult, political and violent content in images via automated batch auditing. Compresses all images before audit, calls MCP audit service, and outputs results as a table. Use when auditing images, checking image content, scanning photos for inappropriate material, or when the user says audit images, review pictures, check content, or image moderation.
license: MIT
compatibility: Requires Node.js with sharp (npm install -g sharp) and nx-mcp-audit MCP service with NX_API_KEY configured
metadata:
  author: xiaowu89
  version: 1.0.1
  tags:
    - image-audit
    - content-moderation
    - batch-processing
---

# Image Content Moderation

Audit images for adult, political, and violent content using the nx-mcp-audit MCP service.

## 配置

审核服务通过 **curl 直连 MCP 端点**，无需 Claude Code 加载 MCP 服务，**安装后无需重启**。

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "nx-mcp-audit": {
      "type": "url",
      "url": "https://mcp.api-inference.modelscope.net/da16b3f65bdb4e/mcp",
      "env": {
        "NX_API_KEY": "你的 API Key"
      }
    }
  }
}
```

Skill 启动时自动读取 `.mcp.json`：
- 查找顺序：项目根目录 → 用户家目录（`%USERPROFILE%`）
- 提取 `url` 字段 → `MCP_URL`
- 提取 `env.NX_API_KEY` 字段 → `API_KEY`

> **No API Key?** Contact WeChat `zhjian_2026` to get one.

---

## 审核流程（严格按此顺序执行，不可跳过或变更）

### 步骤 1：读取配置

从 `.mcp.json` 读取（项目根目录优先，其次用户家目录）：
- `MCP_URL` = `mcpServers["nx-mcp-audit"].url`
- `API_KEY` = `mcpServers["nx-mcp-audit"].env.NX_API_KEY`

两者都不存在则引导用户创建 `.mcp.json` 并填入 API Key。

### 步骤 2：收集图片

- 用 `ls` 或 `find` 列出目标路径下所有图片（png / jpg / jpeg / webp / bmp / tga）
- 记录每张图片的文件名和原始大小（KB）
- 汇报："共 X 张图片，总大小 Y KB"

### 步骤 3：压缩全部图片 ⚠️ 不可跳过

**无论图片原始大小，每一张都必须压缩。** 不区分大小文件。

#### 3.1 首次使用：全局安装 sharp（只需一次）

```bash
# 检查是否已安装
node -e "require('sharp')" 2>/dev/null && echo "已安装" || npm install -g sharp
```

`npm install -g sharp` 全局安装后，后续所有调用零弹窗、零下载。

#### 3.2 压缩脚本（内存操作，不落盘）

```bash
cat > /tmp/sharp_compress.js << 'EOF'
const sharp = require('sharp');
(async () => {
  try {
    const buf = await sharp(process.argv[2])
      .resize({ width: 500, height: 500, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 40 })
      .toBuffer();
    process.stdout.write(JSON.stringify({ok: true, len: buf.length, b64: buf.toString('base64')}));
  } catch(e) {
    process.stdout.write(JSON.stringify({ok: false, error: e.message}));
  }
})();
EOF
```

#### 3.3 逐张压缩

```bash
node /tmp/sharp_compress.js <输入图片绝对路径>
# 输出: {"ok":true,"len":14233,"b64":"/9j/2wBD..."}
```

每张图片执行一次，解析 stdout 的 JSON，取 `b64` 字段拼 `data:image/jpeg;base64,`。

压缩参数统一：最长边 **500px**，格式 **JPEG**，质量 **Q40**。

全部处理完后 `rm /tmp/sharp_compress.js`。

汇报压缩前后总大小及节省百分比。单张压缩失败不阻塞，标记跳过继续。

### 步骤 4：初始化 MCP 会话并审核

#### 4.1 设置请求头（全程复用）

所有请求共用以下头部：

| Header | 值 |
|------|------|
| `Content-Type` | `application/json` |
| `Accept` | `application/json, text/event-stream` |
| `Authorization` | `Bearer {API_KEY}` |

> ⚠️ 同时接受 `application/json` 和 `text/event-stream` 缺一不可，否则 initialize 返回 406。

#### 4.2 第一步：initialize（获取 Session ID）

```bash
curl -s -D - "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code","version":"1.0"}}}'
```

从响应头提取 `Mcp-Session-Id` → 赋值 `SID`。

#### 4.3 第二步：notifications/initialized ⚠️ 不可跳过

```bash
curl -s "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SID" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
```

响应应为 `202`（空 body）。**不发送此通知直接调用 tools/call 会报 `-32602 Invalid request parameters`。**

#### 4.4 第三步：tools/call（审核图片）

请求体：
```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "tools/call",
  "params": {
    "name": "nx_img_audit",
    "arguments": {
      "files": ["data:image/jpeg;base64,..."],
      "apiKey": "{API_KEY}"
    }
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `files` | `string[]` | **是** | base64 dataUrl 数组（`data:image/jpeg;base64,...`） |
| `apiKey` | `string` | **是** | ⚠️ 工具定义标注"可选"，但实测不传返回 `"未配置 API Key"`，**必须传** |

> `files` 参数仅用于本地图片。`urls` 参数仅用于远程 HTTP 图片。不存在 `imagePath` 参数。

curl 命令：
```bash
curl -s "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SID" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"nx_img_audit","arguments":{"files":["data:image/jpeg;base64,..."],"apiKey":"{API_KEY}"}}}'
```

#### 4.5 分批策略

- 每批不超过 **20 张**
- 压缩后的图片通常几十 KB，8 张总量 < 200KB，单批可轻松容纳
- 如果有大量未经压缩的大图，计算 payload 总量不超过 **10MB**
- 按文件大小降序排列，大文件优先
- 遇到 **413** → 拆分当前批次减半重试
- 遇到超时 → 等 3 秒重试一次

#### 4.6 分批执行

逐批等待返回，报告进度 `[N/总数]`。

### 步骤 5：解析返回并汇总

MCP 返回结构：
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "<JSON字符串>" }],
    "isError": false
  }
}
```

**解析路径：** `result.content[0].text` → `JSON.parse()` → 审核结果对象：

```json
{
  "success": true,
  "message": "审核完成: 通过 6, 违规 2, 失败 0",
  "items": [
    {
      "safe": true,
      "errcode": 0,
      "errmsg": "ok",
      "source": "wechat",
      "message": "图片审核通过"
    }
  ],
  "summary": { "total": 8, "pass": 6, "block": 2, "error": 0 },
  "auditVersion": "1.0.18"
}
```

从 `items[i]` 提取每条结果，与原始文件名按索引对应，表格展示：

| 文件 | 原始大小 | 压缩后 | 审核结果 | 引擎 | 说明 |
|------|------|------|:---:|------|------|
| photo.png | 909KB | 45KB | ✅ 通过 | wechat | 图片审核通过 |
| bad.png | 2.8MB | 112KB | ⛔ 违规 | api | 包含违规内容 |
| err.png | 156KB | — | ❌ 失败 | — | 压缩失败 |

### 步骤 6：给出建议

- ✅ **通过**：可正常使用
- ⛔ **违规**：建议删除或人工复核
- ❌ **失败**：重试一次，仍失败则跳过

最后输出汇总：`📊 N 张 | ✅ X 通过 | ⛔ Y 违规 | ❌ Z 失败`

---

## 返回字段速查

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | `boolean` | 请求是否成功 |
| `safe` | `boolean` | `true`=通过，`false`=违规（失败时此字段不存在，通过 `errcode` 判断） |
| `source` | `string` | 审核引擎（`wechat` / `api`） |
| `errcode` | `number` | 错误码，`0`=正常 |
| `errmsg` | `string` | 错误信息，`"ok"`=正常 |
| `message` | `string` | 审核结果描述 |
| `auditVersion` | `string` | 服务版本号 |
| `summary` | `object` | `{total, pass, block, error}` |

---

## MCP 协议三步（完整流程）

```
┌─────────────────────────────────┐
│ 1. initialize                   │
│    → 获取 Mcp-Session-Id        │
│    → 请求头: Authorization      │
│    → 响应头提取 SID              │
├─────────────────────────────────┤
│ 2. notifications/initialized    │  ← ⚠️ 不可跳过！
│    → 请求头: Mcp-Session-Id     │     缺少此步 → -32602
│    → 响应: 202 (空 body)        │
├─────────────────────────────────┤
│ 3. tools/call                   │
│    → 请求头: Mcp-Session-Id     │
│    → method: tools/call          │
│    → name: nx_img_audit          │
│    → arguments: {files, apiKey}  │
└─────────────────────────────────┘
```

---

## 常见错误速查

| 错误现象 | 原因 | 正确做法 |
|------|------|------|
| `-32602 Invalid request parameters` | 未发送 `notifications/initialized` | 在 initialize 之后、tools/call 之前发送通知 |
| `406 Not Acceptable` | 缺少 `Accept: application/json, text/event-stream` | 请求头同时声明两种类型 |
| `"request without mcp-session-id header"` | 未先调 initialize | 从 initialize 响应头获取 SID |
| `"请提供 urls 或 files 参数"` | 传了不存在的 `imagePath` 参数 | 改用 `files`（base64 dataUrl 数组） |
| `"未配置 API Key"` | 没传 `apiKey` 参数 | **必须传 `apiKey`**，工具定义说可选是误导 |
| `413 Request Entity Too Large` | 单批 payload 超限 | 拆分当前批次减半重试 |
| `utf-8 codec can't decode byte` | 中文文件名直接拼入 JSON | 用 base64 dataUrl 传图片内容，文件名仅用于表格展示 |

---

## 禁止事项

- ❌ 不要跳过压缩（即使图片很小）
- ❌ 不要使用 `imagePath` 参数（不存在）
- ❌ 不要省略 `apiKey` 参数（不传会导致审核失败）
- ❌ 不要省略 `notifications/initialized` 步骤（会报 -32602）
- ❌ 不要传本地文件路径给工具（必须 base64 编码为 dataUrl）
- ❌ 不要用 `urls` 参数传本地文件（`urls` 仅用于远程 HTTP 链接）
- ❌ 不要在单批塞超过 10MB 未压缩 payload
