async function updateTabBadge(tabId:number):Promise<void>{
  try{
    const matched=await chrome.declarativeNetRequest.getMatchedRules({tabId});
    const count=matched.rules.length;
    await chrome.action.setBadgeText({tabId,text:count>0?(count>999?'999+':String(count)):''});
    await chrome.action.setBadgeBackgroundColor({tabId,color:'#5eead4'});
  }catch{ await chrome.action.setBadgeText({tabId,text:''}); }
}
export function installBadgeManager():void{
  chrome.tabs.onActivated.addListener(({tabId})=>{void updateTabBadge(tabId);});
  chrome.tabs.onUpdated.addListener((tabId,changeInfo)=>{if(changeInfo.status==='complete'||changeInfo.url)void updateTabBadge(tabId);});
}
