const ORIGIN='https://chat.deepseek.com';
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message?.action!=='connect'||sender.id!==chrome.runtime.id)return;
 (async()=>{
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
 })().then(reply,()=>reply({ok:false,code:'BRIDGE_UNAVAILABLE'}));return true;
});
