# image-audit — 图片内容审核 Skill

自动化图片内容审核（鉴黄 / 政治 / 暴恐），支持批量处理，以表格汇总结果。

## 快速安装

### Claude Code（用户级）

```bash
git clone https://github.com/xiaowu89/skill-function.git /tmp/sf && \
cp -r /tmp/sf/plugins/image-audit/skills/image-audit/ ~/.claude/skills/ && \
rm -rf /tmp/sf
```

### Claude Code（项目级）

```bash
git clone https://github.com/xiaowu89/skill-function.git /tmp/sf && \
cp -r /tmp/sf/plugins/image-audit/skills/image-audit/ .claude/skills/ && \
rm -rf /tmp/sf
```

### 通过 skills.sh 安装

```bash
npx skills add xiaowu89/skill-function --yes
```

## 配置 MCP 服务

在用户目录创建 `.mcp.json`（`%USERPROFILE%\.mcp.json`）：

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

> **没有 API Key？** 联系微信 `xiaowu89` 获取。

配置后重启 Claude Code 即可使用。

## 使用

在 Claude Code 中输入 `/image-audit` 或直接说"审核图片"，然后提供图片路径：

```
审核 E:/images/photo1.png
审核 E:/images/folder/   // 批量审核文件夹
```

Skill 会自动完成压缩 → 审核 → 汇总 → 给出建议。

## 审核流程

| 步骤 | 说明 |
|------|------|
| 收集 | 支持文件夹路径、单张路径、网络 URL |
| 压缩 | sharp 自动压缩（500px, JPEG Q40），通过网关 4MB 限制 |
| 审核 | MCP 调用 `nx_img_audit`，每次最多 20 张 |
| 汇总 | 表格展示通过 / 违规 / 失败 |
| 建议 | 违规建议删除或人工复核 |

## 依赖

- Node.js ≥ 18
- sharp（运行时自动安装，首次约 11 秒）
- nx-mcp-audit MCP 服务 + API Key

## 许可证

MIT
