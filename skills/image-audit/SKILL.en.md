---
name: image-audit
description: Automated image content moderation workflow. Full compression before batch audit, detects adult/political/violent content, outputs table summary. Use when auditing images, checking image content, or scanning photos for inappropriate material.
license: MIT
compatibility: Requires Node.js >= 18 with sharp (npm install -g sharp) and nx-mcp-audit MCP service with NX_API_KEY configured. No Python required.
metadata:
  author: xiaowu89
  version: 1.1.2
  tags:
    - image-audit
    - content-moderation
    - batch-processing
---

# Image Content Moderation

Audit images for adult, political, and violent content using the nx-mcp-audit MCP service.

## Configuration

Create `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "nx-mcp-audit": {
      "type": "url",
      "url": "https://mcp.api-inference.modelscope.net/da16b3f65bdb4e/mcp",
      "env": {
        "NX_API_KEY": "Your API Key"
      }
    }
  }
}
```

Search order: project root -> user home directory. Extract `url` -> `MCP_URL`, `env.NX_API_KEY` -> `API_KEY`.

Skill connects directly to MCP endpoint, **no Claude Code restart required**.

> **No API Key?** Contact WeChat `zhjian_2026` to get one.

## Audit Workflow

### Step 1: Check Configuration (Stop if Missing)

```bash
cat .mcp.json 2>/dev/null || cat ~/.mcp.json 2>/dev/null
```

- Found -> Record `url` and `NX_API_KEY`, continue to Step 2
- Not found -> Ask user if they have an API Key:
  - **Has Key**: Create `~/.mcp.json` in user home (works for both global and project installs)
  - **No Key**: Tell user to contact WeChat `zhjian_2026` to get one

> WARNING: Do not install sharp or continue without config. Resolve config first.

### Step 2: Install sharp + Run Audit (Single Bash Call, Zero Files)

Replace `PIC_DIR`, `MCP_URL`, `API_KEY`, then feed heredoc to node via stdin, **no files written**:

```bash
NODE_PATH=$(npm root -g) node -e "require('sharp')" 2>/dev/null || npm install -g sharp
NODE_PATH=$(npm root -g) node << 'AUDITEOF'
const fs=require('fs'),path=require('path'),sharp=require('sharp');
let PIC_DIR='<absolute image directory path>';
const SINGLE_FILE='<single file path, empty to audit entire directory>';
const MCP_URL='<MCP service URL from .mcp.json>';
const API_KEY='<NX_API_KEY from .mcp.json>';
(async()=>{
const exts=['.png','.jpg','.jpeg','.webp','.bmp','.tga'];
let imgs;
if(SINGLE_FILE){imgs=[path.basename(SINGLE_FILE)];PIC_DIR=path.dirname(SINGLE_FILE)}
else{imgs=fs.readdirSync(PIC_DIR).filter(f=>exts.includes(path.extname(f).toLowerCase())).sort()}
const origTotal=imgs.reduce((s,f)=>s+fs.statSync(path.join(PIC_DIR,f)).size,0);
console.log(`Total ${imgs.length} images, ${(origTotal/1024).toFixed(0)}KB`);
const records=[],data_urls=[];let compTotal=0;console.time('compression');
for(let i=0;i<imgs.length;i++){const f=imgs[i],fp=path.join(PIC_DIR,f),osz=fs.statSync(fp).size;
try{const buf=await sharp(fp,{limitInputPixels:false}).resize({width:500,height:500,fit:'inside',withoutEnlargement:true}).jpeg({quality:40}).toBuffer();
const url='data:image/jpeg;base64,'+buf.toString('base64');records.push({name:f,origKb:osz,compKb:buf.length,dataUrl:url});
data_urls.push(url);compTotal+=buf.length;console.log(`  [${i+1}/${imgs.length}] ${f} ${(osz/1024).toFixed(0)}KB->${(buf.length/1024).toFixed(0)}KB`)}
catch(e){records.push({name:f,origKb:osz,compKb:0,dataUrl:null,error:e.message});console.log(`  [${i+1}/${imgs.length}] ${f} FAIL ${e.message}`)}}
console.timeEnd('compression');
console.log(`payload: ${(compTotal/1024).toFixed(0)}KB`);
console.time('MCP audit');
const H={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':`Bearer ${API_KEY}`};
const r1=await fetch(MCP_URL,{method:'POST',headers:H,body:JSON.stringify({jsonrpc:'2.0',id:'1',method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'cc',version:'1'}}})});
const sid=r1.headers.get('Mcp-Session-Id');H['Mcp-Session-Id']=sid;console.log(`MCP: init->${sid}`);
await fetch(MCP_URL,{method:'POST',headers:H,body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});console.log('MCP: notified->202');
let items=[];
if(data_urls.length>0){const r3=await fetch(MCP_URL,{method:'POST',headers:H,body:JSON.stringify({jsonrpc:'2.0',id:'3',method:'tools/call',params:{name:'nx_img_audit',arguments:{files:data_urls,apiKey:API_KEY}}})});
const raw=await r3.json();const inner=JSON.parse(raw.result.content[0].text);items=inner.items}
console.timeEnd('MCP audit');
let itemIdx=0,pass=0,block=0,fail=0;
console.log('\n'+'='.repeat(85));console.log(`${'File'.padEnd(50)} ${'Original'.padStart(6)} ${'Result'.padStart(6)} ${'Engine'.padStart(6)} Detail`);console.log('-'.repeat(85));
for(const r of records){const oszS=(r.origKb/1024).toFixed(0)+'KB';
if(r.dataUrl){const item=items[itemIdx++],safe=item.safe,src=item.source||'-';const ec=item.errcode,em=item.errmsg||item.error||'';let st;
if(em==='invalid api key'||em==='API Key not configured'){st='ERROR';fail++}else if(safe===true){st='PASS';pass++}else if(safe===false){st='BLOCK';block++}else{st='FAIL';fail++}
console.log(`${r.name.padEnd(50)} ${oszS.padStart(6)} ${st.padStart(6)} ${src.padStart(6)} ${em.padStart(8)}`)}
else{console.log(`${r.name.padEnd(50)} ${oszS.padStart(6)} ${'FAIL'.padStart(6)} ${'—'.padStart(6)} compression failed`);fail++}}
const total=records.length;console.log(`\nTotal: ${total} | PASS: ${pass} | BLOCK: ${block} | FAIL: ${fail} | v${items[0]?.auditVersion||'?'}`);
})();
AUDITEOF
```

### Suggestions

- PASS: OK to use
- BLOCK: Delete or manually review
- FAIL: Retry once

---

## Response Fields Reference

| Field | Type | Description |
|------|------|------|
| `safe` | `boolean` | `true`=pass, `false`=block |
| `source` | `string` | audit engine (`wechat` / `api`) |
| `errcode` | `number` | error code, `0`=normal |
| `errmsg` | `string` | error message, `"ok"`=normal |
| `message` | `string` | audit result description |
| `auditVersion` | `string` | service version |
| `summary` | `object` | `{total, pass, block, error}` |

## Common Errors Reference

| Error | Cause | Solution |
|------|------|------|
| `-32602 Invalid request parameters` | Missing `notifications/initialized` | Must follow 3 steps: init -> notified -> call |
| `406 Not Acceptable` | Missing `Accept` header | Include both `application/json` and `text/event-stream` |
| `"Please provide urls or files"` | Used non-existent `imagePath` | Use `files` (base64 dataUrl array) |
| `"invalid api key"` | API Key wrong or expired | Check Key in `.mcp.json` |
| `"API Key not configured"` | Missing `apiKey` parameter | **Must pass** apiKey |
| `413 Payload Too Large` | payload exceeds limit | Compressed usually <200KB; batch large uncompressed images |
| `Cannot find module 'sharp'` | Not globally installed or missing NODE_PATH | `NODE_PATH=$(npm root -g) node ...` |

## Prohibited Actions

- DO NOT skip compression (even for small images)
- DO NOT use `imagePath` parameter (does not exist)
- DO NOT omit `apiKey` parameter
- DO NOT skip `notifications/initialized` step
- DO NOT write any temp files (heredoc directly to stdin, pure memory execution)
- DO NOT split into multiple Bash calls (one `node << 'AUDITEOF'` handles all)
- DO NOT use backslash paths (`d:\path`), bash heredoc will escape them, always use forward slashes (`d:/path`)
