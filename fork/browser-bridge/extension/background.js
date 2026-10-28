const ORIGIN='https://chat.deepseek.com';
let connecting=false;
async function showState(state){
 const names={connected:'Сессия DeepSeek подключена к Cline',connecting:'Подключение DeepSeek к Cline…',disconnected:'Нет активного подключения DeepSeek к Cline'};
 await chrome.action.setIcon({path:{16:'icons/'+state+'-16.png',32:'icons/'+state+'-32.png'}});
 await chrome.action.setTitle({title:names[state]});
 await chrome.action.setBadgeText({text:state==='connected'?'ON':state==='connecting'?'…':''});
 await chrome.action.setBadgeBackgroundColor({color:state==='connected'?'#168649':'#b87a12'});
}
async function refreshState(){
 if(connecting)return;
 let connected=false;
 try{connected=(await chrome.runtime.sendNativeMessage('cloud.aktalas.cline_dsw',{action:'status'}))?.ok===true;}catch{}
 if(!connecting)await showState(connected?'connected':'disconnected');
 return connected;
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='cline-session-status')void refreshState();});
chrome.runtime.onInstalled.addListener(()=>{void showState('disconnected');void chrome.alarms.create('cline-session-status',{periodInMinutes:1});void refreshState();});
chrome.runtime.onStartup.addListener(()=>{void chrome.alarms.create('cline-session-status',{periodInMinutes:1});void refreshState();});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id)return;
 if(message?.action==='status'){void refreshState().then(ok=>reply({ok:ok===true}));return true;}
 if(message?.action!=='connect')return;
 if(connecting){reply({ok:false,code:'CONNECTING'});return;}
 connecting=true;
 (async()=>{
  await showState('connecting');
  const tabs=await chrome.tabs.query({url:ORIGIN+'/*'});const tab=tabs.find(tab=>tab.active)||tabs[0];
  if(!tab){await chrome.tabs.create({url:ORIGIN+'/sign_in'});return {ok:false,code:'SIGN_IN_REQUIRED'};}
  const values=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   if(location.origin!=='https://chat.deepseek.com')return null;
   let raw=localStorage.getItem('userToken');if(!raw)return null;
   try{const parsed=JSON.parse(raw);raw=typeof parsed==='string'?parsed:parsed.value;}catch{}
   return typeof raw==='string'?{origin:location.origin,token:raw.replace(/^Bearer\s+/,'').trim()}:null;
  }});
  const session=values[0]?.result;if(!session?.token||session.token.length>16384)return {ok:false,code:'SIGN_IN_REQUIRED'};
  const cookies=await chrome.cookies.getAll({url:ORIGIN+'/api/v0/chat/completion'});
  session.cookies=cookies.filter(cookie=>['chat.deepseek.com','deepseek.com'].includes(cookie.domain.replace(/^\./,''))).map(cookie=>cookie.name+'='+cookie.value).join('; ');
  if(session.cookies.length>65536)return {ok:false,code:'SESSION_TOO_LARGE'};
  try{return await chrome.runtime.sendNativeMessage('cloud.aktalas.cline_dsw',{action:'connect',...session});}
  finally{session.token='';session.cookies='';}
 })().then(async value=>{connecting=false;await showState(value?.ok?'connected':'disconnected');reply(value);},async()=>{connecting=false;await showState('disconnected');reply({ok:false,code:'BRIDGE_UNAVAILABLE'});});return true;
});
