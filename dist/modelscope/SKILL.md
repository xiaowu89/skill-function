---
name: image-audit
description: 自动化图片内容审核工作流。支持鉴黄、政治、暴恐识别，批量处理，自动压缩超限图片，以表格汇总审核结果。适用于图片审核、内容检查、违规扫描等场景。
license: MIT
version: 1.0.1
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
        "NX_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

配置文件查找优先级：项目根目录 > 用户家目录（`%USERPROFILE%`）。

配置后重启 Claude Code。

> **没有 API Key？** 联系微信 `zhjian_2026` 获取。

## 使用

对图片说"审核"即可，Skill 自动完成：

1. 收集图片（本地路径、文件夹、远程 URL）
2. 压缩超限图片（sharp 自动安装，500px JPEG Q40）
3. 分批调用 `nx_img_audit` 审核
4. 表格汇总通过/违规/失败
5. 违规则建议删除或人工复核

## MCP 工具参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `urls` | `string[]` | 二选一 | 网络图片 HTTP(S) 链接列表 |
| `files` | `string[]` | 二选一 | 本地图片 dataUrl 列表（base64 编码） |
| `apiKey` | `string` | 否 | API Key，不传则使用服务端环境变量 |

> ⚠️ 建议不传 `apiKey`，由 `.mcp.json` 统一管理。

## 分批策略

MCP 网关有 payload 大小限制（约 12MB）：

1. 每批不超过 20 张
2. 单批 body 编码后不超过 **10MB**（安全阈值）
3. 按文件大小降序排列，大文件优先
4. 遇到 **413 Request Entity Too Large** 时，拆分当前批次减半重试

## 审核流程

### 步骤一：收集图片

- 文件夹路径：列出所有 `png/jpg/jpeg/webp/bmp/tga` 文件
- 单张图片：转为 base64 dataUrl
- 网络 URL：直接传入 `urls` 参数
- 收集完成后汇报：共 X 张图片

### 步骤二：压缩超限图片

超过 4MB 自动用 sharp 压缩（500px、JPEG Q40）。

### 步骤三：审核

调用 `nx_img_audit`，本地图片通过 `files` 参数传入 base64 dataUrl，网络图片通过 `urls` 参数传入 HTTP 链接。

### 步骤四：汇总结果

| 文件 | 大小 | 审核结果 | 引擎 | 详情 |
|------|------|:---:|------|------|

## 返回字段

| 字段 | 说明 |
|------|------|
| `safe` | true 通过，false 违规 |
| `source` | 审核引擎（如 wechat） |
| `errcode` | 错误码，0 正常 |
| `errmsg` | 错误信息 |
| `auditVersion` | 审核服务版本号 |
| `summary` | 汇总 `{total, pass, block, error}` |

## 错误处理

| 场景 | 处理 |
|------|------|
| `.mcp.json` 不存在 | 引导用户创建配置 |
| API Key 未配置 | 提示联系微信 zhjian_2026 获取 |
| API Key 无效 | 提示检查 `.mcp.json` 配置 |
| 文件不存在 | 跳过，标注"文件不存在" |
| 下载失败 | 标记 ❌，不阻塞其他 |
| 网络超时 | 等待 3 秒重试一次 |
| 413 Payload Too Large | 拆分当前批次，减半重试 |
| 中文文件名编码错误 | 使用 base64 dataUrl 传递，避免路径编码问题 |
| MCP 工具不可用 | 重启 Claude Code 后重试 |
