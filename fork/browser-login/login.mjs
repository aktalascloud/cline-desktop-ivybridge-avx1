// SPDX-License-Identifier: Apache-2.0
// Own isolated browser profile, process-owned pipes, no TCP debugger or shared profile.
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,lstat,open,readFile,unlink} from 'node:fs/promises';
import {basename,isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const ORIGIN='https://chat.deepseek.com';
export function validSession(value){return value && value.origin===ORIGIN && typeof value.token==='string' && value.token.trim().length>0 && value.token.length<=16384 && !/[\r\n]/.test(value.token);}

export class PipeRpc {
 constructor(writer,reader){
  this.writer=writer;this.pending=new Map();this.serial=0;this.buffer=Buffer.alloc(0);
  reader.on('data',chunk=>this.consume(chunk));reader.on('end',()=>this.close());reader.on('error',()=>this.close());writer.on('error',()=>this.close());
 }
 consume(chunk){
  this.buffer=Buffer.concat([this.buffer,chunk]);
  if(this.buffer.length>8*1024*1024){this.close();return;}
  let index;
  while((index=this.buffer.indexOf(0))>=0){
   const frame=this.buffer.subarray(0,index);this.buffer=this.buffer.subarray(index+1);let message;
   try{message=JSON.parse(frame);}catch{continue;}
   const entry=this.pending.get(message.id);if(!entry)continue;
   clearTimeout(entry.timer);this.pending.delete(message.id);
   message.error?entry.reject(Error('Browser communication failed')):entry.resolve(message.result);
  }
 }
 call(method,params={},sessionId,timeout=15000){
  if(this.closed)return Promise.reject(Error('Browser was closed'));
  return new Promise((resolve,reject)=>{const id=++this.serial;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Browser response timed out'));},timeout);
   this.pending.set(id,{resolve,reject,timer});this.writer.write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
  });
 }
 close(){this.closed=true;for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(Error('Browser was closed'));}this.pending.clear();}
}

const CAPTURE=`(() => {
 if(location.origin !== '${ORIGIN}') return null;
 try {
  let raw=localStorage.getItem('userToken');if(!raw)return null;
  let token=raw;try{const value=JSON.parse(raw);token=typeof value==='string'?value:value.value;}catch{}
  if(typeof token!=='string'||!token.trim()||token.length>16384)return null;
  token=token.replace(/^Bearer\\s+/,'').trim();
  let state=window.__clineDswAuthCheck;
  if(state&&state.token===token&&state.verified)return {origin:location.origin,token};
  if(!state||state.token!==token||(!state.pending&&Date.now()-state.time>10000)){
   state={token,verified:false,pending:true,time:Date.now()};window.__clineDswAuthCheck=state;
   fetch('/api/v0/users/current',{credentials:'include',headers:{Authorization:'Bearer '+token,'X-App-Version':'2.0.0','X-Client-Version':'2.0.0','X-Client-Platform':'web'},signal:AbortSignal.timeout(8000)})
    .then(response=>response.ok?response.json():null)
    .then(value=>{state.verified=!!(value&&value.code===0&&value.data&&(value.data.biz_code||0)===0&&value.data.biz_data);})
    .catch(()=>{}).finally(()=>{state.pending=false;});
  }
 }catch{}
 return null;
})()`;

export async function run(options){
 const browser=options.browser,base=options.profile;
 if(!isAbsolute(browser)||!isAbsolute(base)||!['brave.exe','chrome.exe','msedge.exe','vivaldi.exe','opera.exe'].includes(basename(browser).toLowerCase()))throw Error('Unsupported default browser');
 await mkdir(base,{recursive:true,mode:0o700});if((await lstat(base)).isSymbolicLink())throw Error('Browser profile must not be a link');
 const profile=join(base,createHash('sha256').update(browser.toLowerCase()).digest('hex').slice(0,16));await mkdir(profile,{recursive:true,mode:0o700});
 if((await lstat(profile)).isSymbolicLink())throw Error('Browser profile must not be a link');
 const lockPath=join(profile,'.cline-login-lock'),nonce=randomUUID();
 let lock;
 try{lock=await open(lockPath,'wx',0o600);}catch{
  const prior=JSON.parse(await readFile(lockPath,'utf8'));let active=true;try{process.kill(prior.pid,0);}catch(error){if(error.code==='ESRCH')active=false;}
  if(active)throw Error('Browser sign-in is already open');
  await unlink(lockPath);lock=await open(lockPath,'wx',0o600);
 }
 await lock.writeFile(JSON.stringify({pid:process.pid,nonce}));await lock.close();
 const controller=new AbortController();process.stdin.on('data',()=>controller.abort());process.stdin.on('end',()=>controller.abort());
 const child=spawn(browser,['--user-data-dir='+profile,'--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--new-window',options.probe?'about:blank':ORIGIN+'/sign_in'],{
  windowsHide:false,stdio:['ignore','ignore','ignore','pipe','pipe'],shell:false,
 });
 const rpc=new PipeRpc(child.stdio[3],child.stdio[4]);child.on('exit',()=>rpc.close());child.on('error',()=>rpc.close());
 try{
  const version=await rpc.call('Browser.getVersion',{},undefined,30000);
  if(options.probe)return{passed:true,product:version.product,transport:'process-owned pipe',tcp_debugging_listener:false,credential_reads:0};
  const deadline=Date.now()+600000;let sessionId;
  while(Date.now()<deadline){
   if(controller.signal.aborted)throw Error('Browser sign-in was cancelled');
   if(!sessionId){const targets=await rpc.call('Target.getTargets');const target=targets.targetInfos.find(target=>target.type==='page'&&target.url.startsWith(ORIGIN+'/'));if(target)sessionId=(await rpc.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;}
   if(sessionId){
    const response=await rpc.call('Runtime.evaluate',{expression:CAPTURE,returnByValue:true},sessionId);
    const session=response.result?.value;
    if(validSession(session)){
     const result=await rpc.call('Network.getCookies',{urls:[ORIGIN+'/api/v0/users/current',ORIGIN+'/api/v0/chat/completion']},sessionId);
     const cookies=result.cookies.filter(cookie=>['deepseek.com','chat.deepseek.com'].includes(cookie.domain.replace(/^\./,''))).map(cookie=>cookie.name+'='+cookie.value).join('; ');
     if(cookies.length>65536)throw Error('Browser session cookies are too large');
     return {origin:ORIGIN,token:session.token.trim(),cookies};
    }
   }
   await new Promise(resolve=>setTimeout(resolve,750));
  }
  throw Error('Browser sign-in timed out');
 }finally{
  await rpc.call('Browser.close',{},undefined,3000).catch(()=>{});
  rpc.close();if(child.exitCode===null){await new Promise(resolve=>setTimeout(resolve,500));if(child.exitCode===null)child.kill();}
  try{const current=JSON.parse(await readFile(lockPath,'utf8'));if(current.nonce===nonce)await unlink(lockPath);}catch{}
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);const get=name=>args[args.indexOf(name)+1];
 try{
  if(!args.includes('--browser')||!args.includes('--profile'))throw Error('Browser parameters missing');
  const value=await run({browser:get('--browser'),profile:get('--profile'),probe:args.includes('--probe')});
  process.stdout.write(JSON.stringify(value),()=>process.exit(0));
 }catch{process.stderr.write('Default-browser sign-in was not completed\n',()=>process.exit(1));}
}
