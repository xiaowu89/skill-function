---
name: image-audit
description: >-
  自动化图片内容审核工作流。支持鉴黄、政治、暴恐识别，自动压缩图片并批量调用审核服务，
  以表格汇总结果。Use when auditing images, checking image content,
  scanning photos for inappropriate material.
version: "1.0.0"
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

# 图片内容审核专家

自动化图片审核工作流，支持鉴黄、政治、暴恐识别。

## 前置条件

在项目根目录或用户目录创建 `.mcp.json`，配置 MCP 服务及 API Key：

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

配置优先级：项目根目录 > 用户家目录。

## MCP 工具参数

`nx_img_audit` 工具参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `urls` | `string[]` | 二选一 | 网络图片 HTTP(S) 链接列表 |
| `files` | `string[]` | 二选一 | 本地图片 base64 dataUrl 列表 |
| `apiKey` | `string` | 否 | API Key，不传则使用环境变量 |

## 分批策略

1. 每批不超过 20 张
2. 单批 body 编码后不超过 **10MB**（安全阈值）
3. 按文件大小降序排列
4. 遇到 **413** 错误时拆分批次减半重试

## 审核流程

### 步骤一：收集图片

确定图片来源：
- **文件夹路径**：列出所有 png/jpg/jpeg/webp/bmp 文件
- **单张图片路径**：转为 base64 dataUrl
- **网络 URL**：直接使用

> 收集完成后先汇报：共 X 张图片，预计耗时 Y–Z 秒。

### 步骤二：压缩图片

所有图片先压缩再传——MCP 网关 payload 限制约 4MB。sharp 自动安装，参数：最长边 500px，JPEG Q40。

### 步骤三：审核图片

调用 `nx-mcp-audit` MCP 服务的 `nx_img_audit` 工具，按分批策略分组。本地图片用 `files` 参数（base64 dataUrl），网络图片用 `urls` 参数。

### 步骤四：汇总结果

| 文件 | 大小 | 结果 | 详情 |
|------|------|:---:|------|
| photo.png | 909KB | ✅ 通过 | - |
| bad.png | 2.8MB | ⛔ 违规 | 包含违规内容 |
| fail.png | 156KB | ❌ 失败 | 下载失败 |

### 步骤五：给出建议

- 违规图片：建议删除或人工复核
- 审核失败：重试一次
- 通过图片：可正常使用

## 返回字段

| 字段 | 说明 |
|------|------|
| `safe` | `true`=通过，`false`=违规 |
| `source` | 审核引擎来源（wechat / api） |
| `errcode` | 错误码，0 正常 |
| `errmsg` | 错误信息 |
| `auditVersion` | 审核服务版本号 |
| `summary` | 汇总 `{total, pass, block, error}` |

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| `.mcp.json` 不存在 | 引导用户创建配置 |
| API Key 未配置 | 中断并提示联系微信 zhjian_2026 获取 |
| API Key 无效 | 提示检查配置 |
| 单张失败 | 标记 ❌，不阻塞其他 |
| 文件不存在 | 跳过并标注 |
| 服务超时 | 等待 3 秒重试一次 |
| 413 Payload Too Large | 拆分批次减半重试 |
| 中文文件名编码错误 | 用 base64 dataUrl 方式避免路径编码问题 |
| MCP 工具不可用 | 重启 Claude Code |
