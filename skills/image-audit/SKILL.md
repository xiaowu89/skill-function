---
name: image-audit
description: Automated image content moderation workflow for auditing images for adult political and violent content with batch processing and table summary output
license: MIT
compatibility: Claude Code Cursor Windsurf Copilot
metadata:
  author: bai9707
  version: 1.0.1
  tags: image-audit content-moderation batch-processing
---

# Image Content Moderation

Audit images for adult, political, and violent content using the nx-mcp-audit MCP service.

## Setup

Configure the MCP server in settings.json:

```json
{
  "mcpServers": {
    "nx-mcp-audit": {
      "type": "url",
      "url": "https://mcp.api-inference.modelscope.net/da16b3f65bdb4e/mcp"
    }
  }
}
```

## Usage

Say "audit these images" and the skill will:

1. Collect images from a folder path or URL
2. Compress large images to fit gateway limits
3. Call the nx_img_audit MCP tool for each image
4. Summarize results in a table with pass/block/fail status
5. Provide recommendations for blocked images

## Response Fields

- safe: true for pass, false for blocked
- source: audit engine (e.g. wechat)
- summary: aggregate stats (total, pass, block, error)
