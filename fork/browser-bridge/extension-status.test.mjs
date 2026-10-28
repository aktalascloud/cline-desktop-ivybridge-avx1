import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('./extension/background.js',import.meta.url),'utf8');
function fixture(){
 const hooks={},states=[],native=[];let connected=true,fail=false;
 const event=name=>({addListener:fn=>{hooks[name]=fn;}});
 const chrome={action:{setIcon:async value=>states.push(value.path[16]),setTitle:async()=>{},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},alarms:{onAlarm:event('alarm'),create:async()=>{}},runtime:{id:'fixture',onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup'),sendNativeMessage:async(host,message)=>{native.push(message);if(fail)throw Error('offline');return {ok:connected};}},tabs:{query:async()=>[{id:1,active:true}]},scripting:{executeScript:async()=>[{result:{origin:'https://chat.deepseek.com',token:'synthetic-fixture'}}]},cookies:{getAll:async()=>[]}};
 vm.runInNewContext(code,{chrome});
 const message=(action,id='fixture')=>new Promise(resolve=>{const result=hooks.message({action},{id},resolve);if(!result)resolve(undefined);});
 return {hooks,states,native,message,setConnected:value=>{connected=value;},setFail:value=>{fail=value;}};
}
test('green requires live status; offline and unconfigured clear it',async()=>{const f=fixture();assert.equal((await f.message('status')).ok,true);assert.match(f.states.at(-1),/connected-16/);assert.deepEqual(JSON.parse(JSON.stringify(f.native)),[{action:'status'}]);f.setConnected(false);await f.message('status');assert.match(f.states.at(-1),/disconnected-16/);f.setFail(true);await f.message('status');assert.match(f.states.at(-1),/disconnected-16/);});
test('connect shows amber then green only on success',async()=>{const f=fixture();assert.equal((await f.message('connect')).ok,true);assert.match(f.states[0],/connecting/);assert.match(f.states.at(-1),/\/connected-/);f.setConnected(false);await f.message('connect');assert.match(f.states.at(-1),/disconnected/);});
test('foreign sender cannot read status or connect',async()=>{const f=fixture();assert.equal(await f.message('connect','foreign'),undefined);assert.equal(await f.message('status','foreign'),undefined);assert.equal(f.native.length,0);});
test('startup and timer check status without scraping browser session',async()=>{const f=fixture();f.hooks.startup();f.hooks.alarm({name:'cline-session-status'});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.native.length,2);assert(f.native.every(value=>value.action==='status'&&!('token' in value)));});
