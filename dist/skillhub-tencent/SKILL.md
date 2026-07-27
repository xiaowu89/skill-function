---
name: image-audit
description: >-
  自动化图片内容审核工作流。支持鉴黄、政治、暴恐识别，自动压缩图片并批量调用审核服务，
  以表格汇总结果。Use when auditing images, checking image content,
  scanning photos for inappropriate material.
version: 1.1.0
category: 内容审核
platforms:
  - claude-code
  - cursor
trigger:
  - 审核图片
  - 审核图像
  - 图片鉴黄
  - audit image
  - check content
permission:
  - Read
  - Bash(node)
  - Bash(npm)
dependency:
  - nodejs >= 18
  - sharp（自动安装）
  - nx-mcp-audit MCP 服务
---


# Image Content Moderation

Audit images for adult, political, and violent content using the nx-mcp-audit MCP service.

## 配置

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

查找顺序：项目根目录 → 用户家目录。提取 `url` → `MCP_URL`，`env.NX_API_KEY` → `API_KEY`。

Skill 直连 MCP 端点，**无需重启 Claude Code**。

> **No API Key?** 请联系服务提供商获取。

## 审核流程

### 步骤 1：检查配置（缺少则立即停止）

```bash
cat .mcp.json 2>/dev/null || cat ~/.mcp.json 2>/dev/null
```

- 找到 → 记录 `url` 和 `NX_API_KEY`，继续步骤 2
- 找不到 → 询问用户是否已有 API Key：
  - **有 Key**：帮用户创建 `~/.mcp.json`（用户家目录），全局和项目安装都通用
  - **没有 Key**：告知联系服务提供商获取，等用户拿到后回来配置

> ⚠️ 配置缺失时不要安装 sharp 或继续后续步骤，先解决配置再往下走。

### 步骤 2：安装 sharp + 执行审核（一次 Bash 调用，纯内存，零文件）

审核脚本通过 GitHub 源文件获取，执行流程：收集图片 → 全量 sharp 压缩(500px JPEG Q40) → MCP 三步协议审核 → 表格汇总。

### 建议

- ✅ **通过**：可正常使用
- ⛔ **违规**：建议删除或人工复核
- ❌ **失败**：重试一次

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

## 常见错误速查

| 错误现象 | 原因 | 正确做法 |
|------|------|------|
| `-32602 Invalid request parameters` | 未发送 `notifications/initialized` | 必须三步：init → notified → call |
| `406 Not Acceptable` | 缺少 `Accept` 头 | 同时声明 `application/json` 和 `text/event-stream` |
| `"请提供 urls 或 files 参数"` | 用了不存在的 `imagePath` | 改用 `files`（base64 dataUrl 数组） |
| `"invalid api key"` | API Key 错误或过期（errcode=-1） | 检查 `.mcp.json` 中的 Key 是否正确 |
| `"未配置 API Key"` | 没传 `apiKey` | **必须传**，工具定义说可选是误导 |
| `413 Payload Too Large` | payload 超限 | 压缩后通常 < 200KB，不触发；未压缩大图需分批 |
| `Cannot find module 'sharp'` | 未全局安装或缺少 NODE_PATH | `NODE_PATH=$(npm root -g) node ...` |

## 禁止事项

- ❌ 不要跳过压缩（即使图片很小）
- ❌ 不要使用 `imagePath` 参数（不存在）
- ❌ 不要省略 `apiKey` 参数
- ❌ 不要省略 `notifications/initialized` 步骤
- ❌ 不要写任何临时文件（heredoc 直接喂 stdin，纯内存执行）
- ❌ 不要把流程拆成多次 Bash 调用（一次 `node << 'AUDITEOF'` 搞定）
- ❌ 不要使用反斜杠路径（`d:\path`），bash heredoc 会被转义，一律用正斜杠（`d:/path`）
