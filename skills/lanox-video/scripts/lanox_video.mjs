import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = (k,d="") => process.env[k] || d;
function arg(name, fallback) { const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : fallback; }
async function key(){ try{return JSON.parse(await fs.readFile(path.join(root,"auth.json"),"utf8")).LANOX_API_KEY||""}catch{return ""} }
const apiKey=await key()||env("LANOX_API_KEY"); if(!apiKey) throw Error("Missing API key: create auth.json or set LANOX_API_KEY.");
const prompt=arg("--prompt",env("LANOX_VIDEO_PROMPT")); if(!prompt) throw Error("Missing --prompt.");
const model=arg("--model",env("LANOX_VIDEO_MODEL","dreamina-seedance-2-5-260628"));
const content=[{type:"text",text:prompt}];
for(const [flag,type,roleFlag,defRole] of [["--image","image_url","--image-role","first_frame"],["--video","video_url","--video-role","video"],["--audio","audio_url","--audio-role","driving_audio"]]){let vals=[]; for(let i=0;i<process.argv.length;i++) if(process.argv[i]===flag&&process.argv[i+1]) vals.push(process.argv[i+1]); for(const url of vals){const role=arg(roleFlag,defRole); content.push({type,[type]:{url},...(role?{role}: {})});}}
const body={model,content}; for(const [f,k] of [["--resolution","resolution"],["--ratio","ratio"],["--duration","duration"],["--seed","seed"]]){const v=arg(f,env("LANOX_VIDEO_"+k.toUpperCase())); if(v!==undefined&&v!=="") body[k]=k==="duration"||k==="seed"?Number(v):v;}
const base=arg("--base-url",env("LANOX_VIDEO_BASE_URL","https://api.lanox.ai")).replace(/\/+$/,"");
const headers={Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"};
const create=await fetch(base+"/api/v2/lanox-videos/generations",{method:"POST",headers,body:JSON.stringify(body)}); const cr=await create.json(); if(!cr.id||cr.code&&cr.code!=="200") throw Error(`Create failed: ${cr.code||create.status} ${cr.codeMsg||JSON.stringify(cr)}`);
let task; const interval=Number(arg("--poll-interval-ms",env("LANOX_VIDEO_POLL_INTERVAL_MS","15000"))); const max=Number(arg("--max-poll-attempts",env("LANOX_VIDEO_MAX_POLL_ATTEMPTS","120")));
for(let i=0;i<max;i++){task=await (await fetch(`${base}/api/v2/lanox-videos/tasks/${cr.id}`,{headers:{Authorization:`Bearer ${apiKey}`} })).json(); if(["succeeded","failed","cancelled","expired"].includes(task.status)) break; await new Promise(r=>setTimeout(r,interval));}
if(task.status!=="succeeded") throw Error(`Task ${cr.id} ${task.status}: ${task.error?.message||"not completed"}`); const url=task.content?.video_url; if(!url) throw Error("Succeeded task has no content.video_url"); const out=arg("--output-dir",env("LANOX_VIDEO_OUTPUT_DIR",path.resolve(process.cwd(),"data","generated-videos"))); await fs.mkdir(out,{recursive:true}); const buf=Buffer.from(await (await fetch(url)).arrayBuffer()); const file=path.join(out,`lanox-video-${new Date().toISOString().replace(/[:.]/g,"-")}.mp4`); await fs.writeFile(file,buf); console.log(JSON.stringify({ok:true,taskId:cr.id,model,status:task.status,saved:{path:file,bytes:buf.length}},null,2));

