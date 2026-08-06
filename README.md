# image-audit — 图片内容审核 Skill

直连 NX API 对图片进行鉴黄、政治、暴恐识别。自动压缩后并发审核，以表格汇总结果。支持免费体验。

## 快速安装

### skills.sh（推荐）

```bash
npx skills add https://github.com/xiaowu89/skill-function --skill image-audit
```

### GitHub 安装

```bash
npx skills add https://github.com/xiaowu89/skill-function
```

### 手动安装

```bash
git clone https://github.com/xiaowu89/skill-function.git /tmp/sf && \
mkdir -p ~/.claude/skills/image-audit && \
cp -r /tmp/sf/. ~/.claude/skills/image-audit/ && \
rm -rf /tmp/sf
```

## 配置

Skill 通过 `.env` 文件读取 `NX_API_KEY`，首次使用时会自动引导配置。

```bash
# 在项目根目录（或任意位置）创建 .env
NX_API_KEY=你的API_Key
```

> **没有 API Key？** 联系微信 `zhijian_2026` 获取。

配置后无需重启，直接使用。

## 使用

在 Claude Code 中输入 `/image-audit`，然后提供图片路径：

```
/image-audit 审核 E:/images/                    # 批量审核文件夹
/image-audit 审核 E:/images/photo1.png          # 单张审核
```

Skill 自动完成压缩 → 并发审核 → 表格汇总。

## 审核流程

| 步骤 | 说明 |
|------|------|
| 检查配置 | 读取 `.env` 中的 `NX_API_KEY`，缺失则引导用户配置 |
| 压缩 | sharp 自动压缩（500px, JPEG Q40），纯内存不留文件 |
| 审核 | ≤20 张 1 批直发，>20 张均分多批并发，`files` 字段传多文件 |
| 汇总 | 表格展示通过 / 违规 / 失败 |
| 建议 | 违规建议删除或人工复核 |

## 依赖

- Node.js ≥ 18
- sharp（运行时自动安装，首次约 11 秒）
- NX_API_KEY

## 许可证

MIT
