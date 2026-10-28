import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {crypt} from './privacy.mjs';
console.log=console.info=console.debug=console.error=()=>{};
const base=join(process.env.LOCALAPPDATA,'cloud.aktalas.cline.desktop.avx1.ru','browser-bridge');let input=Buffer.alloc(0),busy=false;
function reply(value){const data=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(4);header.writeUInt32LE(data.length);process.stdout.write(Buffer.concat([header,data]));}
async function handle(value){
 if(value.action==='status'){value={action:'status'};}
 else if(value.action!=='connect'||value.origin!=='https://chat.deepseek.com'||typeof value.token!=='string'||!value.token.trim()||value.token.length>16384||/[\r\n]/.test(value.token)||typeof value.cookies!=='string'||value.cookies.length>65536||/[\r\n]/.test(value.cookies))return{ok:false,code:'INVALID_SESSION'};
 const inbox=join(base,'inbox');await mkdir(inbox,{recursive:true});const id=randomUUID(),path=join(inbox,id+'.enc'),response=join(inbox,id+'.result');
 await writeFile(path+'.tmp',await crypt(Buffer.from(JSON.stringify(value)),true),{flag:'wx'});await rename(path+'.tmp',path);value.token='';value.cookies='';
 try{const deadline=Date.now()+45000;while(Date.now()<deadline){try{return JSON.parse(await readFile(response,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,500));}return{ok:false,code:'CLINE_NOT_READY'};}finally{await unlink(response).catch(()=>{});}
}
process.stdin.on('data',chunk=>{input=Buffer.concat([input,chunk]);if(input.length>131076){process.exit(1);return;}if(input.length<4)return;const size=input.readUInt32LE(0);if(size>131072){process.exit(1);return;}if(input.length<4+size||busy)return;busy=true;let value;try{value=JSON.parse(input.subarray(4,4+size));}catch{reply({ok:false,code:'INVALID_MESSAGE'});return;}void handle(value).then(reply,()=>reply({ok:false,code:'BRIDGE_FAILED'}));});
