#!/usr/bin/env node
// @version 1.3.0
// ===== 图片审核脚本 =====
// 用法:
//   node audit.js <目录路径> [--key=xxx] [--client=xxx]
//   node audit.js <单张图片路径> [--key=xxx] [--client=xxx]
//
// API Key 优先级: --key 参数 > NX_API_KEY 环境变量
// deviceId 优先级: --client 参数 > NX_CLIENT_ID 环境变量 > 自动机器指纹

const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');

// ===== 读取 .env 文件 =====
// 查找链: 当前目录逐级向上爬到根 → 兜底主目录 ~/.env，就近优先合并，已有环境变量优先
function findEnvFiles(){
  const files=[];
  let dir=process.cwd();
  while(true){
    const candidate=path.join(dir,'.env');
    if(fs.existsSync(candidate)) files.push(candidate);
    const parent=path.dirname(dir);
    if(parent===dir) break;
    dir=parent;
  }
  const homeEnv=path.join(os.homedir(),'.env');
  if(fs.existsSync(homeEnv)) files.push(homeEnv);
  return files;
}
function loadEnv(){
  for(const envFile of findEnvFiles()){
    const lines=fs.readFileSync(envFile,'utf-8').split(/\r?\n/);
    for(const line of lines){
      const trimmed=line.trim();
      if(!trimmed||trimmed.startsWith('#')) continue;
      const idx=trimmed.indexOf('=');
      if(idx===-1) continue;
      const key=trimmed.slice(0,idx).trim();
      const val=trimmed.slice(idx+1).trim().replace(/^["']|["']$/g,'');
      if(!process.env[key]) process.env[key]=val;
    }
  }
}
loadEnv();

// ===== 电脑唯一标识 =====
// 服务端用于区分来源电脑，优先级: --client 参数 > NX_CLIENT_ID 环境变量 > 自动机器指纹
function getMachineId(){
  // hostname + 非 internal 网卡 MAC 排序后哈希，单机稳定、跨机唯一，无外部环境依赖
  const macs=[];
  for(const name of Object.keys(os.networkInterfaces())){
    for(const iface of (os.networkInterfaces()[name]||[])){
      if(!iface.internal&&iface.mac&&(iface.mac!=='00:00:00:00:00:00')) macs.push(iface.mac);
    }
  }
  return crypto.createHash('sha256').update([os.hostname(),...macs.sort()].join('|')).digest('hex').slice(0,16);
}

// ===== 参数解析 =====
const args=process.argv.slice(2);
if(args.length===0||args.includes('-h')||args.includes('--help')){
  console.log('用法: node audit.js <图片目录|单张图片路径> [--key=API_KEY] [--client=客户端标识]');
  console.log('API Key 优先级: --key 参数 > NX_API_KEY 环境变量 > .env 文件');
  console.log('deviceId 优先级: --client 参数 > NX_CLIENT_ID 环境变量 > 自动机器指纹');
  process.exit(args.length===0?1:0);
}

let apiKey='';
let channel='';
let clientId='';
let inputPath='';
let urlList=[];
for(const arg of args){
  if(arg.startsWith('--key=')){apiKey=arg.slice(6)}
  else if(arg.startsWith('--channel=')){channel=arg.slice(10)}
  else if(arg.startsWith('--client=')){clientId=arg.slice(9)}
  else if(arg.startsWith('--urls=')){urlList=arg.slice(7).split(',').filter(Boolean)}
  else if(!arg.startsWith('--')){inputPath=arg}
}
apiKey=apiKey||process.env.NX_API_KEY||'';
channel=channel||'github';
clientId=clientId||process.env.NX_CLIENT_ID||getMachineId();

if(!inputPath&&urlList.length===0){console.error('请提供图片目录/文件路径，或通过 --urls= 传入');process.exit(1);}

inputPath=path.resolve(inputPath.replace(/\\/g,'/'));

// ===== 依赖检查 =====
function addGlobalModulePath(){
  try{
    const {execSync}=require('child_process');
    const nm=execSync('npm root -g',{encoding:'utf-8'}).trim();
    if(!module.paths.includes(nm)) module.paths.push(nm);
  }catch(_){}
}
addGlobalModulePath();

async function ensureSharp(){
  try{return require('sharp')}catch(e){
    console.log('sharp 未安装，正在全局安装（npm install -g sharp）...');
    const {execSync}=require('child_process');
    execSync('npm install -g sharp',{stdio:'inherit'});
    addGlobalModulePath();
    return require('sharp');
  }
}

// ===== 主流程 =====
async function main(){
  const sharp=await ensureSharp();

  const API_URL='https://ai.nxtici.com/v1/nx/imgSecCheck';
  const exts=['.png','.jpg','.jpeg','.webp'];
  const records=[];let compTotal=0;

  // 阶段 1：本地文件扫描 + 压缩（如有）
  if(inputPath){
    const stat=fs.statSync(inputPath);
    const isFile=stat.isFile();
    const PIC_DIR=isFile?path.dirname(inputPath):inputPath;
    const SINGLE_FILE=isFile?path.basename(inputPath):'';

    let imgs;
    if(SINGLE_FILE){
      const ext=path.extname(SINGLE_FILE).toLowerCase();
      if(!exts.includes(ext)){console.error(`不支持的文件格式: ${ext}`);process.exit(1);}
      imgs=[SINGLE_FILE];
    }else{
      imgs=fs.readdirSync(PIC_DIR).filter(f=>exts.includes(path.extname(f).toLowerCase())).sort();
    }

    const origTotal=imgs.reduce((s,f)=>s+fs.statSync(path.join(PIC_DIR,f)).size,0);
    const urlCount=urlList.length;
    console.log(`文件 ${imgs.length} 张${urlCount>0?` + URL ${urlCount} 个`:''}，总 ${(origTotal/1024).toFixed(0)}KB`);

    console.time('压缩');
    for(let i=0;i<imgs.length;i++){
      const f=imgs[i],fp=path.join(PIC_DIR,f),osz=fs.statSync(fp).size;
      try{
        const buf=await sharp(fp,{limitInputPixels:false})
          .resize({width:500,height:500,fit:'inside',withoutEnlargement:true})
          .jpeg({quality:40}).toBuffer();
        records.push({name:f,origKb:osz,compKb:buf.length,buffer:buf});
        compTotal+=buf.length;
        console.log(`  [${i+1}/${imgs.length}] ${f} ${(osz/1024).toFixed(0)}KB→${(buf.length/1024).toFixed(0)}KB`);
      }catch(e){
        records.push({name:f,origKb:osz,compKb:0,buffer:null,error:e.message});
        console.log(`  [${i+1}/${imgs.length}] ${f} ❌ ${e.message}`);
      }
    }
    console.timeEnd('压缩');
    console.log(`payload: ${(compTotal/1024).toFixed(0)}KB`);
  }else if(urlList.length>0){
    console.log(`URL ${urlList.length} 个（无本地文件）`);
  }

  // 阶段 2：并发审核（files 分批 + urls 独立请求，互不干扰）
  console.time('审核');
  const totalCount=records.length+urlList.length;
  const MAX_PER_BATCH=20;
  const tasks=[];
  const urlRecords=[];// URL 审核结果

  // 2a：本地文件分批
  const pending=records.filter(r=>r.buffer);
  if(pending.length>0){
    const batchCount=Math.ceil(pending.length/MAX_PER_BATCH);
    const baseSize=Math.floor(pending.length/batchCount);
    const remainder=pending.length%batchCount;
    const batches=[];
    let cursor=0;
    for(let b=0;b<batchCount;b++){
      const size=baseSize+(b<remainder?1:0);
      batches.push(pending.slice(cursor,cursor+size));
      cursor+=size;
    }
    for(let bi=0;bi<batches.length;bi++){
      const batch=batches[bi];
      tasks.push((async()=>{
        const fd=new FormData();
        for(const r of batch){
          fd.append('files',new Blob([r.buffer],{type:'image/jpeg'}),r.name.replace(/\.\w+$/,'.jpg'));
        }
        try{
          const res=await fetch(API_URL,{
            method:'POST',
            headers:{'Authorization':`Bearer ${apiKey}`,'authSource':'api','authChannel':channel,'deviceId':clientId},
            body:fd,
          });
          const data=await res.json();
          if(data.code!==0){
            const err=data.message||'API错误';
            for(const r of batch){r.apiError=err;r.errcode=-1;r.errmsg=err;r.source='api'}
            console.log(`  [files批次${bi+1}] ⚠️ ${err}`);
          }else{
            const items=data.data&&(Array.isArray(data.data.items)?data.data.items:[data.data])||[];
            for(let j=0;j<batch.length;j++){
              const r=batch[j],item=items[j]||{},inner=item.data||item;
              r.safe=inner.safe;r.source=inner.source;r.errcode=inner.errcode;r.errmsg=inner.errmsg||'';
              console.log(`  ${r.name} ${r.safe===true?'✅ 通过':r.safe===false?'⛔ 违规':'❌ 失败'} (${r.source||'-'})`);
            }
          }
        }catch(e){
          for(const r of batch){r.apiError=e.message;r.errcode=-1}
          console.log(`  [files批次${bi+1}] ❌ ${e.message}`);
        }
      })());
    }
  }

  // 2b：URL 独立请求（不与 files 混合）
  if(urlList.length>0){
    tasks.push((async()=>{
      const fd=new FormData();
      fd.append('urls',JSON.stringify(urlList));
      try{
        const res=await fetch(API_URL,{
          method:'POST',
          headers:{'Authorization':`Bearer ${apiKey}`,'authSource':'api','authChannel':channel,'deviceId':clientId},
          body:fd,
        });
        const data=await res.json();
        if(data.code!==0){
          console.log(`  [urls] ⚠️ ${data.message||'API错误'}`);
          for(const u of urlList){urlRecords.push({name:u.split('/').pop().split('?')[0],origKb:0,compKb:0,buffer:undefined,apiError:data.message||'API错误',isUrl:true})}
        }else{
          const items=data.data&&(Array.isArray(data.data.items)?data.data.items:[data.data])||[];
          for(const item of items){
            const inner=(item.data||item);
            urlRecords.push({
              name:(item.filename||inner.filename||'?').split('?')[0],
              origKb:0,compKb:0,buffer:undefined,
              safe:inner.safe,source:inner.source,errcode:inner.errcode,errmsg:inner.errmsg||'',
              isUrl:true,
            });
            console.log(`  [url] ${urlRecords[urlRecords.length-1].name} ${inner.safe===true?'✅ 通过':inner.safe===false?'⛔ 违规':'❌ 失败'} (${inner.source||'-'})`);
          }
        }
      }catch(e){
        console.log(`  [urls] ❌ ${e.message}`);
        for(const u of urlList){urlRecords.push({name:u.split('/').pop().split('?')[0],origKb:0,compKb:0,buffer:undefined,apiError:e.message,isUrl:true})}
      }
    })());
  }

  await Promise.all(tasks);
  console.timeEnd('审核');

  // 输出表格
  const allRecords=[...records,...urlRecords];
  let passCount=0,blockCount=0,failCount=0;
  console.log('\n'+'='.repeat(85));
  console.log(`${'文件'.padEnd(50)} ${'原始'.padStart(6)} ${'结果'.padStart(6)} ${'引擎'.padStart(6)} 说明`);
  console.log('-'.repeat(85));
  for(const r of allRecords){
    const oszS=r.isUrl?'URL':r.origKb>0?(r.origKb/1024).toFixed(0)+'KB':'—';
    if(r.safe===true){
      console.log(`${r.name.padEnd(50)} ${oszS.padStart(6)} ${'✅ 通过'.padStart(6)} ${(r.source||'-').padStart(6)}`);
      passCount++;
    }else if(r.safe===false){
      console.log(`${r.name.padEnd(50)} ${oszS.padStart(6)} ${'⛔ 违规'.padStart(6)} ${(r.source||'-').padStart(6)} ${(r.errmsg||'')}`);
      blockCount++;
    }else if(r.buffer){
      console.log(`${r.name.padEnd(50)} ${oszS.padStart(6)} ${'❌ 失败'.padStart(6)} ${'—'.padStart(6)} ${(r.apiError||r.errmsg||'')}`);
      failCount++;
    }else{
      console.log(`${r.name.padEnd(50)} ${oszS.padStart(6)} ${'❌ 失败'.padStart(6)} ${'—'.padStart(6)} ${r.isUrl?(r.apiError||'URL审核失败'):'压缩失败'}`);
      failCount++;
    }
  }
  const total=allRecords.length;
  console.log(`\n📊 ${total} 张 | ✅ ${passCount} 通过 | ⛔ ${blockCount} 违规 | ⚠️ ${failCount} 错误/失败`);
}

main().catch(e=>{console.error(e.message);process.exit(1);});
