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

在用户目录创建 `.mcp.json`（`%USERPROFILE%\.mcp.json`）：

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

配置后重启 Claude Code。

> **没有 API Key？** 联系微信 `zhjian_2026` 获取。

## 使用

对图片说"审核"即可，Skill 自动完成：

1. 收集图片（本地路径、文件夹、远程 URL）
2. 压缩超限图片（sharp 自动安装，500px JPEG Q40）
3. 调用 nx_img_audit 审核（每次最多 20 张）
4. 表格汇总通过/违规/失败
5. 违规则建议删除或人工复核

## 返回字段

- safe — true 通过，false 违规
- source — 审核引擎（如 wechat）
- summary — 汇总 `{total, pass, block, error}`

## 错误处理

| 场景 | 处理 |
|------|------|
| API Key 未配置 | 提示配置 `.mcp.json` |
| 文件不存在 | 跳过，标注"文件不存在" |
| 下载失败 | 标记 ❌，不阻塞其他 |
| 网络超时 | 等待 3 秒重试一次 |
| API Key 无效 | 提示检查配置 |
