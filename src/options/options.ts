import { loadSettings, saveSettings, serializeSettings, parseImportedSettings, DEFAULT_SETTINGS } from '../shared/storage';
import type { ExtensionSettings, ExtensionModules } from '../shared/types';

const moduleMeta: Record<keyof ExtensionModules,{title:string;desc:string;icon:string}> = {
  webrtc:{title:'WebRTC',desc:'Block local IP and STUN leak surfaces',icon:'W'},
  canvas:{title:'Canvas',desc:'Stable pixel noise against canvas fingerprinting',icon:'C'},
  webgl:{title:'WebGL',desc:'Mask GPU and renderer fingerprint values',icon:'G'},
  audio:{title:'AudioContext',desc:'Reduce acoustic fingerprint precision',icon:'A'},
  fonts:{title:'Fonts & DOM',desc:'Reduce font and geometry fingerprinting',icon:'F'},
  navigator:{title:'Navigator',desc:'Normalize browser-exposed device properties',icon:'N'},
  screen:{title:'Screen',desc:'Normalize display fingerprint surfaces',icon:'S'},
  geolocation:{title:'Geolocation',desc:'Control page geolocation access',icon:'L'},
  timezone:{title:'Timezone',desc:'Normalize timezone and Intl surfaces',icon:'T'},
  headers:{title:'HTTP Headers',desc:'Enable hardened request-header rules',icon:'H'},
  permissions:{title:'Permissions',desc:'Control sensitive permission surfaces',icon:'P'},
  network:{title:'Network Surfaces',desc:'Block WebTransport, WebSocket and ping telemetry',icon:'R'},
  trackers:{title:'Tracker Blocking',desc:'Block known tracking requests',icon:'X'},
  ads:{title:'Ad Blocking',desc:'Block advertising requests',icon:'AD'},
  urlCleaner:{title:'URL Cleaner',desc:'Remove common tracking parameters',icon:'U'},
  browserPrivacy:{title:'Browser Privacy',desc:'Privacy API, cookies and browser telemetry',icon:'B'},
};

const master=document.querySelector<HTMLInputElement>('#master')!;
const modulesEl=document.querySelector<HTMLDivElement>('#modules')!;
const moduleCount=document.querySelector<HTMLElement>('#moduleCount')!;
const masterSummary=document.querySelector<HTMLElement>('#masterSummary')!;
const healthBadge=document.querySelector<HTMLElement>('#healthBadge')!;
const search=document.querySelector<HTMLInputElement>('#search')!;
const enableAll=document.querySelector<HTMLButtonElement>('#enableAll')!;
const disableAll=document.querySelector<HTMLButtonElement>('#disableAll')!;
const timezone=document.querySelector<HTMLSelectElement>('#timezone')!;
const geoMode=document.querySelector<HTMLSelectElement>('#geoMode')!;
const coords=document.querySelector<HTMLDivElement>('#coords')!;
const lat=document.querySelector<HTMLInputElement>('#lat')!;
const lng=document.querySelector<HTMLInputElement>('#lng')!;
const accuracy=document.querySelector<HTMLInputElement>('#accuracy')!;
const domains=document.querySelector<HTMLUListElement>('#domains')!;
const exportButton=document.querySelector<HTMLButtonElement>('#export')!;
const importInput=document.querySelector<HTMLInputElement>('#import')!;
const reset=document.querySelector<HTMLButtonElement>('#reset')!;
const message=document.querySelector<HTMLElement>('#message')!;

let settings=await loadSettings();

function buildModuleCards():void{
  modulesEl.innerHTML='';
  (Object.keys(moduleMeta) as Array<keyof ExtensionModules>).forEach((key)=>{
    const meta=moduleMeta[key];
    const article=document.createElement('article');
    article.className='module';
    article.dataset.key=key;
    article.innerHTML=`<div class="module-icon">${meta.icon}</div><div class="module-copy"><div class="module-title">${meta.title}</div><div class="module-desc">${meta.desc}</div></div><label class="switch" aria-label="${meta.title}"><input type="checkbox" data-module="${key}"><span></span></label>`;
    const input=article.querySelector<HTMLInputElement>('input')!;
    input.addEventListener('change',async()=>{
      settings=await saveSettings({modules:{...settings.modules,[key]:input.checked}});
      render(settings);
    });
    modulesEl.append(article);
  });
}

function render(s:ExtensionSettings):void{
  settings=s;
  master.checked=s.enabled;
  const keys=Object.keys(moduleMeta) as Array<keyof ExtensionModules>;
  const active=keys.filter(k=>s.modules[k]).length;
  moduleCount.textContent=`${active}/${keys.length} active`;
  masterSummary.textContent=s.enabled ? `${active} of ${keys.length} protection modules are enabled.` : 'Privacy Shield is disabled.';
  healthBadge.textContent=s.enabled ? 'Protection active' : 'Protection disabled';
  healthBadge.style.color=s.enabled?'var(--accent)':'var(--danger)';
  modulesEl.querySelectorAll<HTMLInputElement>('input[data-module]').forEach((input)=>{
    const key=input.dataset.module as keyof ExtensionModules;
    input.checked=s.modules[key];
    input.disabled=!s.enabled;
  });
  const filter=search.value.trim().toLowerCase();
  modulesEl.querySelectorAll<HTMLElement>('.module').forEach((card)=>{
    const key=card.dataset.key as keyof ExtensionModules;
    const hay=`${moduleMeta[key].title} ${moduleMeta[key].desc}`.toLowerCase();
    card.classList.toggle('hidden',!!filter&&!hay.includes(filter));
  });
  timezone.value=s.timezone||'auto';
  timezone.disabled=!s.enabled||!s.modules.timezone;
  geoMode.value=s.geolocationMode;
  geoMode.disabled=!s.enabled||!s.modules.geolocation;
  coords.hidden=geoMode.value!=='custom'||!s.enabled||!s.modules.geolocation;
  lat.value=String(s.spoofedLocation.latitude);
  lng.value=String(s.spoofedLocation.longitude);
  accuracy.value=String(s.spoofedLocation.accuracy);
  renderDomains(s);
}

function renderDomains(s:ExtensionSettings):void{
  domains.innerHTML='';
  if(!s.excludedDomains.length){
    const li=document.createElement('li'); li.textContent='No saved exclusions.'; domains.append(li); return;
  }
  for(const domain of s.excludedDomains){
    const li=document.createElement('li'); li.textContent=domain;
    const btn=document.createElement('button'); btn.type='button'; btn.textContent='Remove';
    btn.addEventListener('click',async()=>{settings=await saveSettings({excludedDomains:s.excludedDomains.filter(x=>x!==domain)});render(settings);});
    li.append(btn); domains.append(li);
  }
}

master.addEventListener('change',async()=>{settings=await saveSettings({enabled:master.checked});render(settings);});
enableAll.addEventListener('click',async()=>{const modules={...settings.modules};(Object.keys(moduleMeta) as Array<keyof ExtensionModules>).forEach(k=>modules[k]=true);settings=await saveSettings({modules});render(settings);});
disableAll.addEventListener('click',async()=>{const modules={...settings.modules};(Object.keys(moduleMeta) as Array<keyof ExtensionModules>).forEach(k=>modules[k]=false);settings=await saveSettings({modules});render(settings);});
search.addEventListener('input',()=>render(settings));
timezone.addEventListener('change',async()=>{settings=await saveSettings({timezone:timezone.value});render(settings);});
geoMode.addEventListener('change',async()=>{settings=await saveSettings({geolocationMode:geoMode.value as ExtensionSettings['geolocationMode']});render(settings);});
const saveCoords=async()=>{settings=await saveSettings({spoofedLocation:{latitude:Number(lat.value),longitude:Number(lng.value),accuracy:Number(accuracy.value)}});render(settings);};
[lat,lng,accuracy].forEach(input=>input.addEventListener('change',()=>void saveCoords()));

exportButton.addEventListener('click',async()=>{
  const blob=new Blob([serializeSettings(settings)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='privacy-shield-settings.json'; a.click(); URL.revokeObjectURL(url);
  message.textContent='Configuration exported.';
});
importInput.addEventListener('change',async()=>{
  const file=importInput.files?.[0]; if(!file)return;
  try{
    const imported=parseImportedSettings(await file.text());
    settings=await saveSettings(imported);
    render(settings);
    message.textContent='Configuration imported.';
  }
  catch(error){message.textContent=error instanceof Error?error.message:'Import failed.';}
  finally{importInput.value='';}
});
reset.addEventListener('click',async()=>{settings=await saveSettings(DEFAULT_SETTINGS);render(settings);message.textContent='Defaults restored.';});

buildModuleCards();
render(settings);
