---
name: image-audit
description: 自动化图片内容审核工作流。支持鉴黄、政治、暴恐识别，批量处理，自动压缩超限图片，以表格汇总审核结果。适用于图片审核、内容检查、违规扫描等场景。
license: MIT
compatibility: Requires node npm and nx-mcp-audit MCP service with NX_API_KEY configured
metadata:
  author: xiaowu89
  version: 1.0.1
  tags: image-audit, content-moderation, batch-processing
---

# 图片内容审核

调用 NX MCP 审核服务对图片进行鉴黄、政治、暴恐识别，支持批量处理。

## 首次使用：自动检测并引导配置

Skill 激活后会**先尝试调用** `nx_img_audit` 工具。如果 MCP 服务未配置，按以下流程引导用户完成配置：

### 流程一：检测 MCP 工具

1. 尝试调用 `nx-mcp-audit` 的 `nx_img_audit` 工具
2. 如果工具**可用** → 进入「流程三」检查 API Key 可用性
3. 如果工具**不可用** → 进入「流程二」诊断具体原因

### 流程二：诊断 MCP 不可用原因

MCP 工具不可用时，按以下顺序查找 `.mcp.json` 文件：

1. **当前工作目录** `.mcp.json`
2. **用户家目录** `%USERPROFILE%\.mcp.json`

读取找到的第一个文件内容进行诊断：

**情况 A：文件不存在或未包含 `nx-mcp-audit`**

→ 引导用户创建/追加配置。

**情况 B：文件存在，配置结构正确，但 `NX_API_KEY` 看起来是占位符**

→ 提示用户确认 Key 是否有效，同时告知：
```
配置文件格式正确，但 API Key 看起来无效。请确认 Key 是否正确。
如果尚未获取 Key，联系微信 zhjian_2026 获取，然后替换 .mcp.json 中的 NX_API_KEY 并重启 Claude Code。
```

**情况 C：文件存在，配置结构正确，Key 格式正常**

→ 工具不可用可能是 MCP 服务连接问题，提示用户检查网络，或联系微信 zhjian_2026 确认服务状态。

### 流程三：引导安装 MCP 服务

```json
{
  "mcpServers": {
    "nx-mcp-audit": {
      "type": "url",
      "url": "https://mcp.api-inference.modelscope.net/da16b3f65bdb4e/mcp",
      "env": {
        "NX_API_KEY": "你的API Key"
      }
    }
  }
}
```

添加后重启 Claude Code。

### 流程四：引导配置 API Key

1. 检查 `.mcp.json` 中 `env.NX_API_KEY` 是否已配置
2. 如果未配置，提示用户填入 API Key
3. **没有 API Key？** 提示用户联系微信 `zhjian_2026` 获取
4. 配置后重启 Claude Code 生效

## 审核流程

### 步骤一：收集图片

- 文件夹路径：用 `ls` 列出所有 `png/jpg/jpeg/webp/bmp/tga` 文件
- 单张图片路径：直接处理
- 网络 URL：直接传入 HTTP 链接

收集完成后汇报：共 X 张图片。

### 步骤二：压缩超限图片

超过 4MB 自动用 sharp 压缩（500px、JPEG Q40）。

### 步骤三：调用审核服务

调用 `nx-mcp-audit` 的 `nx_img_audit` 工具，每次最多 20 张。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `imagePath` | `string` | 是 | 图片 URL |
| `apiKey` | `string` | 是 | 从 `.mcp.json` 读取 |

### 步骤四：汇总结果

以表格展示：

| 文件 | 大小 | 审核状态 | 引擎 | 建议 |
|------|------|----------|------|------|

**返回字段：**
| 字段 | 说明 |
|------|------|
| `safe` | true 通过，false 违规 |
| `source` | 审核引擎（如 wechat） |
| `summary` | 汇总 `{total, pass, block, error}` |

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| API Key 未配置 | 中断操作，提示"未配置 API Key。没有 Key？联系微信 zhjian_2026 获取。" |
| 文件不存在 | 跳过，标注"文件不存在" |
| 下载失败 | 标记 ❌，不阻塞其他 |
| 网络超时 | 等待 3 秒重试 |
| API Key 无效 | 提示检查配置 |

## 注意事项

- 每次最多 20 张，单张失败不影响其他
- 违规建议删除或人工复核
- 支持格式：png、jpg、jpeg、bmp、webp、tga
