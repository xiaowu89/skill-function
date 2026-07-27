---
name: image-audit
description: Detects adult, political and violent content in images via automated batch auditing. Compresses all images before audit, calls MCP audit service, and outputs results as a table. Use when auditing images, checking image content, scanning photos for inappropriate material, or when the user says audit images, review pictures, check content, or image moderation.
license: MIT
compatibility: Requires node npm and nx-mcp-audit MCP service with NX_API_KEY configured
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
- 提取 `url` 字段作为 MCP 端点
- 提取 `env.NX_API_KEY` 作为认证凭据

> **No API Key?** Contact WeChat `zhjian_2026` to get one.

---

## 审核流程（严格按此顺序执行，不可跳过或变更）

### 步骤 1：读取配置

从项目根目录 `.mcp.json` 读取：
- `mcpServers["nx-mcp-audit"].url` → MCP 端点
- `mcpServers["nx-mcp-audit"].env.NX_API_KEY` → API Key

如果文件不存在，尝试用户家目录 `%USERPROFILE%\.mcp.json`。两者都不存在则引导用户创建。

### 步骤 2：收集图片

- 用 `ls` 或 `find` 命令列出目标路径下所有图片（png / jpg / jpeg / webp / bmp / tga）
- 记录每张图片的文件名和原始大小（KB）
- 汇报：共 X 张图片，总大小 Y KB

### 步骤 3：压缩全部图片 ⚠️ 不可跳过

**无论图片大小，每一张都必须压缩。** 不区分大小文件。

统一使用 sharp 压缩参数：
- 最长边：**500px**
- 格式：**JPEG**
- 质量：**Q40**

执行方式：
```bash
npx sharp-cli -i <input> -o <output> --resize 500 --format jpeg --quality 40
```

或调用 `npx sharp` 内联处理。sharp 首次运行自动安装。

压缩后汇报：原始总大小 → 压缩后总大小，节省百分比。单张压缩失败不阻塞，标记跳过继续。

### 步骤 4：初始化 MCP 会话并审核

**4.1 读取配置：**
从步骤 1 读取的 `.mcp.json` 中获取：
- `MCP_URL` = `mcpServers["nx-mcp-audit"].url`
- `API_KEY` = `mcpServers["nx-mcp-audit"].env.NX_API_KEY`

**4.2 base64 编码：**
对每张压缩后的图片做 base64 编码：
```
data:image/jpeg;base64,<base64字符串>
```

**4.3 按以下规则分批（同时满足）：**
- 每批不超过 **20 张**
- 单批请求体（JSON + base64 dataUrl）总大小不超过 **10MB**（计算方式：所有图片 base64 字符串长度之和 ÷ 1024 ÷ 1024 + 1MB JSON 开销）
- 按文件大小降序排列，大文件优先

**4.4 调用 MCP 工具：**

工具名 `nx_img_audit`（所属服务 `nx-mcp-audit`）。

| 参数 | 类型 | 必填 | 值 |
|------|------|:---:|------|
| `files` | `string[]` | 是 | base64 dataUrl 数组 |
| `apiKey` | `string` | **否** | ⚠️ 不传（apiKey 是可选参数，无需传入） |

> 本地图片只用 `files` 参数，不要用 `urls`（`urls` 仅用于远程 HTTP 图片）。不要使用不存在的 `imagePath` 参数。

**4.5 调用方式（curl 直连 MCP 端点，无需重启 Claude Code）：**

从 `.mcp.json` 读取 `MCP_URL` 和 `API_KEY` 后，两步操作：

```
# 第一步：initialize（获取 Session ID）
curl -s -D - "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code","version":"1.0"}}}'

# 从响应头提取 Mcp-Session-Id  →  赋值 SID

# 第二步：tools/call（传入 Mcp-Session-Id）
curl -s "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SID" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"nx_img_audit","arguments":{"files":["data:image/jpeg;base64,..."]}}}'
```

> ⚠️ 注意：initialize 请求需要传 `Authorization: Bearer` 头。接收响应时需同时接受 `application/json` 和 `text/event-stream`。

**4.6 分批执行：** 逐批等待返回，报告进度 `[N/总数]`。

遇到 **413 Request Entity Too Large** → 将当前批次拆分为两半，分别重试。遇到网络超时 → 等 3 秒重试一次。

### 步骤 5：解析返回并汇总

MCP 返回结构为：
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "<JSON字符串>" }],
    "isError": false
  }
}
```

解析路径：`result.content[0].text` → JSON.parse → 得到审核结果对象：

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

从 `items[0]` 提取每条结果，以表格展示：

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
| `safe` | `boolean` | `true`=通过，`false`=违规 |
| `source` | `string` | 审核引擎（`wechat` / `api`） |
| `errcode` | `number` | 错误码，`0`=正常 |
| `errmsg` | `string` | 错误信息，`"ok"`=正常 |
| `message` | `string` | 审核结果描述 |
| `auditVersion` | `string` | 服务版本号 |
| `summary` | `object` | `{total, pass, block, error}` |

---

## 常见错误速查

| 错误现象 | 原因 | 正确做法 |
|------|------|------|
| `"请提供 urls 或 files 参数"` | 传了不存在的 `imagePath` 参数 | 改用 `files`（base64 dataUrl 数组） |
| `"413 Request Entity Too Large"` | 单批 payload 超 12MB | 拆分当前批次减半重试 |
| `"Not Acceptable"` (406) | initialize 请求缺少 Accept 头 | 同时声明 `application/json` 和 `text/event-stream` |
| `"request without mcp-session-id header"` | 未初始化直接调 tools/call | 先调 initialize 获取 Session ID |
| `"utf-8 codec can't decode byte"` | 中文文件名直接拼入 JSON | 用 base64 dataUrl 传图片内容 |
| 请求体过大但未报 413 | 网关静默拒绝 | 严格按 10MB 安全阈值分批 |
| `.mcp.json` 不存在 | 未创建配置文件 | 引导用户创建 `.mcp.json` |

---

## 禁止事项

- ❌ 不要跳过压缩（即使图片很小）
- ❌ 不要使用 `imagePath` 参数（不存在）
- ❌ 不要传 `apiKey` 参数（用 `.mcp.json` 环境变量）
- ❌ 不要传本地文件路径给工具（必须 base64 编码）
- ❌ 不要在单批塞超过 10MB payload
- ❌ 不要在 MCP 未初始化时直接调用 tools/call
- ❌ 不要用 `urls` 参数传本地文件（`urls` 仅用于远程 HTTP 链接）
