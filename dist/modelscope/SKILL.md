---
name: image-audit
description: 自动化图片内容审核工作流。支持鉴黄、政治、暴恐识别，批量处理，自动压缩超限图片，以表格汇总审核结果。适用于图片审核、内容检查、违规扫描等场景。
license: MIT
version: 1.1.0
metadata:
  author: xiaowu89
  tags:
    - image-audit
    - content-moderation
    - batch-processing
    - mcp
---

# 图片内容审核

调用 NX MCP 审核服务对图片进行鉴黄、政治、暴恐识别，支持批量处理。

## 配置

在项目根目录或用户目录创建 `.mcp.json`：

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

查找顺序：项目根目录 → 用户家目录。配置后重启 Claude Code。

> **没有 API Key？** 联系微信 `zhjian_2026` 获取。

## 使用

对图片说"审核"即可，Skill 自动完成：

1. 收集图片（本地路径、文件夹、远程 URL）
2. 全量压缩图片（sharp, 500px JPEG Q40）
3. 调用 `nx_img_audit` MCP 审核
4. 表格汇总通过/违规/失败
5. 违规则建议删除或人工复核

## MCP 工具参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `files` | `string[]` | 是 | 本地图片 base64 dataUrl 数组 |
| `urls` | `string[]` | 二选一 | 网络图片 HTTP(S) 链接 |
| `apiKey` | `string` | 是 | API Key（必须传） |

## 返回字段

| 字段 | 说明 |
|------|------|
| `safe` | `true` 通过，`false` 违规 |
| `source` | 审核引擎（wechat / api） |
| `errcode` | 错误码，`0`=正常 |
| `errmsg` | 错误信息，`"ok"`=正常 |
| `auditVersion` | 审核服务版本号 |
| `summary` | 汇总 `{total, pass, block, error}` |

## 错误处理

| 场景 | 处理 |
|------|------|
| `.mcp.json` 不存在 | 引导用户创建配置 |
| API Key 未配置或无效 | 提示联系微信 zhjian_2026 获取 |
| 文件不存在 | 跳过，标注"文件不存在" |
| 下载失败 | 标记 ❌，不阻塞其他 |
| 网络超时 | 等待 3 秒重试一次 |

## 依赖

- Node.js >= 18
- sharp（`npm install -g sharp`，脚本自动安装）
- nx-mcp-audit MCP 服务 + API Key
