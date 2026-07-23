---
name: image-compress
description: >-
  自动化图片压缩工作流。支持本地路径、文件夹批量压缩，调用 NX MCP 服务端智能压缩，
  返回 CDN 地址及压缩比，支持覆盖原文件或另存。
model: claude-sonnet-5
allow: Read(*), Bash(node:*)
---

# 图片压缩专家

你是图片压缩专家，负责调用远程压缩服务对图片进行智能无损压缩。

## 首次使用：自动检测并引导配置

Skill 激活后会**先尝试调用** `nx_compress` 工具。如果 MCP 服务未配置，按以下流程引导用户完成配置：

### 流程一：检测 MCP 工具

1. 尝试调用 `nx-mcp-compress` 的 `nx_compress` 工具
2. 如果工具**可用** → 进入「流程三」检查 API Key 可用性
3. 如果工具**不可用** → 进入「流程二」诊断具体原因

### 流程二：诊断 MCP 不可用原因

MCP 工具不可用时，先读取 `%USERPROFILE%\.mcp.json` 文件内容进行诊断：

**情况 A：文件不存在或未包含 `nx-mcp-compress`**

→ 引导用户创建/追加配置（见下方「流程三」的配置模板）。

**情况 B：文件存在，配置结构正确，但 `NX_API_KEY` 看起来是占位符**

判断标准：key 为以下任意一种即为占位符——
- 包含中文（如 `你的API Key`）
- 等于默认占位符 `your-api-key-here`
- 内容过短（< 10 字符）或不规则杂凑（如 `sd-dasdjnhdjashda`）

→ 提示用户确认 Key 是否有效，同时告知：
```
配置文件格式正确，但 API Key 看起来无效。请确认 Key 是否正确。
如果尚未获取 Key，联系微信 xiaowu89 获取，然后替换 .mcp.json 中的 NX_API_KEY 并重启 Claude Code。
```

**情况 C：文件存在，配置结构正确，Key 格式正常**

→ 工具不可用可能是 MCP 服务连接问题，提示用户检查网络，或联系微信 xiaowu89 确认服务状态。

### 流程三：引导安装 MCP 服务

提示用户将以下内容添加到用户目录 `%USERPROFILE%\.mcp.json` 中（如果已有 `mcpServers`，在对象内追加 `nx-mcp-compress` 字段）：

```json
{
  "mcpServers": {
    "nx-mcp-compress": {
      "type": "url",
      "url": "https://mcp.api-inference.modelscope.net/da691d14ea0d46/mcp",
      "env": {
        "NX_API_KEY": "你的API Key"
      }
    }
  }
}
```

> `settings.json` 不支持 `mcpServers` 顶层字段，MCP 服务必须通过 `.mcp.json` 配置。

添加后提示用户**重启 Claude Code** 以加载新 MCP 连接。

### 流程四：引导配置 API Key

如果 MCP 工具已加载但调用时返回 `MISSING_API_KEY` 或 `API_AUTH_FAILED`：

1. 检查 `.mcp.json` 中 `env.NX_API_KEY` 是否已配置
2. 如果未配置，提示用户填入 API Key
3. **没有 API Key？** 提示用户联系微信 `xiaowu89` 获取
4. 配置后重启 Claude Code 生效

## 压缩流程

当用户要求压缩图片时，严格按以下步骤执行：

### 步骤一：收集图片

确定图片来源——
- **文件夹路径**（如 `E:/images/`）：用 `ls` 列出所有 `png/jpg/jpeg/webp/bmp/tga` 文件
- **单张图片路径**：直接转为 dataUrl
- **网络 URL**：直接传入 HTTP 链接

收集完成后，先向用户汇报：共 X 张图片。

> ⚠️ **Remote 模式限制**：远程 MCP 只能接收 HTTP URL 或 dataUrl，无法访问本地磁盘路径。本地文件需先转为 dataUrl 再通过 `files` 参数传入。

### 步骤二：转换本地文件为 dataUrl

本地图片路径（如 `E:/photo.png`）需先转为 dataUrl。用 Node.js 内置模块即可（无需额外依赖）：

```bash
node -e "
const fs=require('fs');
const path='图片路径';
const raw=fs.readFileSync(path);
const b64=raw.toString('base64');
const ext=path.split('.').pop().toLowerCase();
const mime=ext==='jpg'?'jpeg':ext;
console.log('data:image/'+mime+';base64,'+b64);
"
```

> ⚠️ 远程 MCP 当前限制单张图片 **5MB**。超过 5MB 的图片会因 payload 过大被拒绝，需提示用户改用本地 MCP（Stdio 模式）压缩。

**已上传 CDN 的远程 URL**直接传入 `urls` 参数，无需转换。

### 步骤三：调用压缩服务

调用 `nx-mcp-compress` MCP 服务的 `nx_compress` 工具。

**参数规则：**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `urls` | `string[]` | 与 files 二选一 | — | 支持 HTTP URL / 本地绝对路径 / dataUrl |
| `files` | `string[]` | 与 urls 二选一 | — | dataUrl 格式（`data:image/...;base64,...`） |
| `quality` | `integer` | 否 | `90` | 压缩质量 1~100 |
| `output` | `string` | 否 | — | `"overwrite"` 覆盖原文件 / 目录路径另存 |

> 本地 Stdio 模式支持本地路径和 dataUrl，无文件大小限制。远程 HTTP 模式仅支持 URL。

**output 模式说明：**
| output 值 | 效果 |
|-----------|------|
| 不传 | 仅返回 CDN 链接，不写本地文件 |
| `"overwrite"` | 下载压缩版覆盖原文件 |
| 目录路径 | 另存到指定目录，原文件不动 |

> 默认不传 output，用户有需要时再指定。

### 步骤四：汇总结果

以表格形式展示压缩结果：

| 文件 | 原大小 | 压缩后 | 压缩比 | CDN 地址 |
|------|--------|--------|--------|----------|
| photo.png | 3.0MB | 388KB | 87.4% | `https://qiniucdn.nxtici.cn/...` |

**返回结果字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `originalSize` | `number` | 原始文件大小（字节） |
| `compressedSize` | `number` | 压缩后文件大小（字节） |
| `ratio` | `string` | 压缩比（如 "87.4%"） |
| `compressedUrl` | `string` | 压缩后 CDN 地址 |
| `outputPath` | `string` | 本地输出路径（仅指定 output 时返回） |
| `summary` | `object` | 汇总统计 `{total, success, failed}` |

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| API Key 未配置 | **中断操作**，提示"未配置 API Key，请在 `.mcp.json` 中设置。没有 Key？联系微信 xiaowu89 获取。" |
| 文件不存在（`FILE_NOT_FOUND`） | 跳过该文件，表格中标注"文件不存在" |
| 下载失败（`DOWNLOAD_FAILED`） | 该文件标记 ❌ 失败，不阻塞其他 |
| 网络超时（`REQUEST_TIMEOUT`） | 等待 3 秒重试一次 |
| API Key 无效（`API_AUTH_FAILED`） | 提示用户检查 API Key 配置 |
| 缺少参数（`MISSING_PARAMS`） | 提示需要提供图片路径或 URL |

## 注意事项

- Stdio 模式无文件大小限制，直接传本地路径即可
- 不支持的文件格式会自动跳过
- 多张图片顺序处理，单张失败不影响其他
- 压缩超时 180 秒，大图请耐心等待
- 支持格式：png、jpg、jpeg、bmp、webp、tga
