---
name: image-compress
description: Automated image compression workflow using server-side smart compression. Supports local paths, folders, and URLs with CDN output and compression ratio reporting. Use when compressing images, reducing file size, or optimizing photos.
license: MIT
compatibility: Requires nodejs and nx-mcp-server with NX_API_KEY configured
metadata:
  author: xiaowu89
  version: 1.0.0
  tags: image-compress, compression, optimization, media
---

# Image Compression

Compress images using the nx-mcp-server remote compression service.

## Setup

Configure the MCP server in `.mcp.json` (Stdio mode):

```json
{
  "mcpServers": {
    "nx-mcp-compress": {
      "command": "npx",
      "args": ["-y", "nx-mcp-server"],
      "env": {
        "NX_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Code after configuring.

> **No API Key?** Contact WeChat `xiaowu89` to get one.

## Usage

Say "compress these images" and the skill will:

1. Collect images from a folder path or URL
2. Call the nx_compress MCP tool for each image
3. Summarize compression results in a table with size comparison and ratio

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | `string[]` | Yes* | — | HTTP URLs or local paths |
| `files` | `string[]` | Yes* | — | dataUrl format images |
| `quality` | `integer` | No | `90` | 1-100, higher is better |
| `output` | `string` | No | — | `"overwrite"` or directory path |

## Response Fields

- `originalSize` — original file size in bytes
- `compressedSize` — compressed file size in bytes
- `ratio` — compression ratio (e.g. "87.4%")
- `compressedUrl` — CDN URL of compressed image
- `summary` — aggregate stats (total, success, failed)

## Supported Formats

png, jpg, jpeg, bmp, webp, tga
