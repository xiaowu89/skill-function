---
name: image-audit
description: Detects adult, political and violent content in images via automated batch auditing. Compresses large images, calls MCP audit service, and outputs results as a table. Use when auditing images, checking image content, scanning photos for inappropriate material, or when the user says audit images, review pictures, check content, or image moderation.
license: MIT
compatibility: Requires node npm and nx-mcp-audit MCP service with NX_API_KEY configured
metadata:
  author: zhjian_2026
  version: 1.0.1
  tags:
    - image-audit
    - content-moderation
    - batch-processing
---

# Image Content Moderation

Audit images for adult, political, and violent content using the nx-mcp-audit MCP service.

## Setup

Create `.mcp.json` in project root or user home directory:

```json
{
  "mcpServers": {
    "nx-mcp-audit": {
      "type": "url",
      "url": "https://mcp.api-inference.modelscope.net/da16b3f65bdb4e/mcp",
      "env": {
        "NX_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Config lookup order: project root > user home (`%USERPROFILE%`).

Restart Claude Code after configuring.

> **No API Key?** Contact WeChat `zhjian_2026` to get one.

## Usage

Say "audit these images" and the skill will:

1. Collect images from a folder path or URL
2. Compress large images to fit gateway limits
3. Call the `nx_img_audit` MCP tool in batches
4. Summarize results in a table with pass/block/fail status
5. Provide recommendations for blocked images

## MCP Tool Parameters

`nx_img_audit` tool parameters:

| Parameter | Type | Required | Description |
|------|------|:---:|------|
| `urls` | `string[]` | one of | HTTP(S) image URL list |
| `files` | `string[]` | one of | Local image base64 dataUrl list |
| `apiKey` | `string` | no | API Key (optional, uses env var if omitted) |

## Batch Strategy

1. Max 20 images per batch
2. Keep total request body under **10MB** (safe threshold)
3. Sort by file size descending
4. On **413 Payload Too Large** — split batch in half and retry

## Workflow

1. Collect images (folder / single file / URL) → report count
2. Compress images > 4MB (sharp, 500px JPEG Q40)
3. Encode local images to base64 dataUrl, call `nx_img_audit` with `files`/`urls`
4. Summarize results in table (pass / block / fail)
5. Recommendations for blocked images

## Response Fields

- `safe`: true for pass, false for blocked
- `source`: audit engine (e.g. wechat)
- `errcode`: error code, 0 = success
- `errmsg`: error message
- `auditVersion`: service version
- `summary`: aggregate stats `{total, pass, block, error}`

## Error Handling

| Scenario | Action |
|------|------|
| Missing `.mcp.json` | Guide user to create config |
| Missing API Key | Prompt to contact zhjian_2026 |
| Invalid API Key | Check config |
| File not found | Skip, mark "not found" |
| Download failed | Mark ❌, continue |
| Network timeout | Retry after 3s |
| 413 Payload Too Large | Split batch, retry |
| CJK filename encoding | Use base64 dataUrl |
| MCP tool unavailable | Restart Claude Code |
