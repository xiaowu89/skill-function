---
name: image-audit
description: Automated image content moderation workflow. Detects adult, political and violent content in images with batch processing, automatic compression, and table summary output. Use when auditing images, checking content, or scanning photos for inappropriate material.
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

## Setup

Configure the MCP server and API key in `.mcp.json`:

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

Restart Claude Code after configuring.

> **No API Key?** Contact WeChat `zhjian_2026` to get one.

## Usage

1. Collect images from a folder path or URL
2. Compress large images to fit gateway limits (sharp auto-install)
3. Call the nx_img_audit MCP tool for each image
4. Summarize results in a table with pass, block, or fail status
5. Provide recommendations for blocked images

## Response Fields

- safe: true for pass, false for blocked
- source: audit engine (e.g. wechat)
- summary: aggregate stats (total, pass, block, error)
