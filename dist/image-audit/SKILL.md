---
name: image-audit
description: Detects adult, political and violent content in images via automated batch auditing. Compresses all images before audit, calls MCP audit service, and outputs results as a table. Use when auditing images, checking image content, scanning photos for inappropriate material, or when the user says audit images, review pictures, check content, or image moderation.
license: MIT
compatibility: Requires Node.js >= 18 with sharp (npm install -g sharp) and nx-mcp-audit MCP service with NX_API_KEY configured. No Python required.
metadata:
  author: xiaowu89
  version: 1.0.1
  tags:
    - image-audit
    - content-moderation
    - batch-processing
---

# Image Content Moderation

Audit images for adult, political, and violent content using the nx-mcp-audit MCP service.

## 配置

在项目根目录创建 `.mcp.json`：

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

查找顺序：项目根目录 → 用户家目录。提取 `url` → `MCP_URL`，`env.NX_API_KEY` → `API_KEY`。

Skill 直连 MCP 端点，**无需重启 Claude Code**。

> **No API Key?** Contact WeChat `zhjian_2026` to get one.

## 审核流程

### 步骤 1：读取配置 + 确保 sharp 可用

```bash
cat .mcp.json 2>/dev/null || cat ~/.mcp.json 2>/dev/null
NODE_PATH=$(npm root -g) node -e "require('sharp')" 2>/dev/null || npm install -g sharp
```

### 步骤 2：执行审核脚本（一次调用完成全部操作）

将以下脚本保存为 `/tmp/audit.js`，修改脚本开头的 `PIC_DIR` 为目标图片目录，然后执行：

```bash
NODE_PATH=$(npm root -g) node /tmp/audit.js
```

```javascript
// /tmp/audit.js — 一次调用完成：收集 → 压缩 → MCP审核 → 汇总
const fs = require('fs'), path = require('path'), sharp = require('sharp');

const PIC_DIR = '<目标图片目录绝对路径>';     // ← 修改这里
const MCP_URL = '<从.mcp.json读取的url>';
const API_KEY = '<从.mcp.json读取的NX_API_KEY>';

(async () => {
  // === 收集图片 ===
  const exts = ['.png','.jpg','.jpeg','.webp','.bmp','.tga'];
  const imgs = fs.readdirSync(PIC_DIR).filter(f => exts.includes(path.extname(f).toLowerCase())).sort();
  const origTotal = imgs.reduce((s,f) => s + fs.statSync(path.join(PIC_DIR, f)).size, 0);
  console.log(`共 ${imgs.length} 张图片，总大小 ${(origTotal/1024).toFixed(0)}KB`);

  // === 压缩（内存操作，不落盘） ===
  const data_urls = [];
  let compTotal = 0;
  for (let i = 0; i < imgs.length; i++) {
    const f = imgs[i], fp = path.join(PIC_DIR, f);
    const osz = fs.statSync(fp).size;
    try {
      const buf = await sharp(fp).resize({width:500,height:500,fit:'inside',withoutEnlargement:true}).jpeg({quality:40}).toBuffer();
      data_urls.push('data:image/jpeg;base64,' + buf.toString('base64'));
      compTotal += buf.length;
      console.log(`  [${i+1}/${imgs.length}] ${f}  ${(osz/1024).toFixed(0)}KB → ${(buf.length/1024).toFixed(0)}KB`);
    } catch(e) {
      console.log(`  [${i+1}/${imgs.length}] ${f}  ❌ ${e.message}`);
    }
  }
  console.log(`压缩后 payload: ${(compTotal/1024).toFixed(0)}KB`);

  // === MCP 三步协议 ===
  const H = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${API_KEY}`
  };

  // 1. initialize
  const r1 = await fetch(MCP_URL, {method:'POST', headers:H,
    body: JSON.stringify({jsonrpc:'2.0',id:'1',method:'initialize',
      params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'cc',version:'1'}}})});
  const sid = r1.headers.get('Mcp-Session-Id'); H['Mcp-Session-Id'] = sid;
  console.log(`MCP: initialize → ${sid}`);

  // 2. notifications/initialized
  await fetch(MCP_URL, {method:'POST', headers:H,
    body: JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});
  console.log('MCP: notified → 202');

  // 3. tools/call
  const r3 = await fetch(MCP_URL, {method:'POST', headers:H,
    body: JSON.stringify({jsonrpc:'2.0',id:'3',method:'tools/call',
      params:{name:'nx_img_audit',arguments:{files:data_urls,apiKey:API_KEY}}})});
  const raw = await r3.json();
  const inner = JSON.parse(raw.result.content[0].text);
  const items = inner.items;

  // === 汇总 ===
  console.log('\n' + '='.repeat(70));
  console.log(`${'文件'.padEnd(52)} ${'原始'.padStart(6)} ${'结果'.padStart(6)} ${'引擎'.padStart(8)}`);
  console.log('-'.repeat(70));
  let pass = 0, block = 0, fail = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i], safe = item.safe, src = item.source || '-';
    const osz = (fs.statSync(path.join(PIC_DIR, imgs[i])).size / 1024).toFixed(0);
    let st;
    if (safe === true) { st = '✅ 通过'; pass++; }
    else if (safe === false) { st = '⛔ 违规'; block++; }
    else { st = '❌ 失败'; fail++; }
    console.log(`${imgs[i].padEnd(52)} ${(osz+'KB').padStart(6)} ${st.padStart(6)} ${src.padStart(8)}`);
  }
  console.log(`\n📊 ${items.length} 张 | ✅ ${pass} 通过 | ⛔ ${block} 违规 | ❌ ${fail} 失败 | v${inner.auditVersion}`);
})();
```

### 建议

- ✅ **通过**：可正常使用
- ⛔ **违规**：建议删除或人工复核
- ❌ **失败**：重试一次

---

## 返回字段速查

| 字段 | 类型 | 说明 |
|------|------|------|
| `safe` | `boolean` | `true`=通过，`false`=违规 |
| `source` | `string` | 审核引擎（`wechat` / `api`） |
| `errcode` | `number` | 错误码，`0`=正常 |
| `errmsg` | `string` | 错误信息，`"ok"`=正常 |
| `message` | `string` | 审核结果描述 |
| `auditVersion` | `string` | 服务版本号 |
| `summary` | `object` | `{total, pass, block, error}` |

## 常见错误速查

| 错误现象 | 原因 | 正确做法 |
|------|------|------|
| `-32602 Invalid request parameters` | 未发送 `notifications/initialized` | 必须三步：init → notified → call |
| `406 Not Acceptable` | 缺少 `Accept` 头 | 同时声明 `application/json` 和 `text/event-stream` |
| `"请提供 urls 或 files 参数"` | 用了不存在的 `imagePath` | 改用 `files`（base64 dataUrl 数组） |
| `"未配置 API Key"` | 没传 `apiKey` | **必须传**，工具定义说可选是误导 |
| `413 Payload Too Large` | payload 超限 | 压缩后通常 < 200KB，不触发；未压缩大图需分批 |
| `Cannot find module 'sharp'` | 未全局安装或缺少 NODE_PATH | `NODE_PATH=$(npm root -g) node ...` |

## 禁止事项

- ❌ 不要跳过压缩（即使图片很小）
- ❌ 不要使用 `imagePath` 参数（不存在）
- ❌ 不要省略 `apiKey` 参数
- ❌ 不要省略 `notifications/initialized` 步骤
- ❌ 不要写中间临时文件传递数据（全在内存中完成）
- ❌ 不要把流程拆成多次 Bash 调用（一次 `node /tmp/audit.js` 搞定）
