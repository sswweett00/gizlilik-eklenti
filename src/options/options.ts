import { loadSettings, saveSettings, serializeSettings, parseImportedSettings } from '../shared/storage';

const mode=document.querySelector<HTMLElement>('#mode')!;
const geo=document.querySelector<HTMLElement>('#geo')!;
const locale=document.querySelector<HTMLElement>('#locale')!;
const network=document.querySelector<HTMLElement>('#network')!;
const domains=document.querySelector<HTMLUListElement>('#domains')!;
const exportButton=document.querySelector<HTMLButtonElement>('#export')!;
const importInput=document.querySelector<HTMLInputElement>('#import')!;
const message=document.querySelector<HTMLElement>('#message')!;

function render(settings:Awaited<ReturnType<typeof loadSettings>>):void{
  mode.textContent=settings.securityMode;
  geo.textContent=settings.geolocationMode;
  locale.textContent='en-US / UTC';
  network.textContent=settings.networkPrivacy.mode;
  domains.innerHTML='';
  if(settings.excludedDomains.length===0){
    const li=document.createElement('li'); li.textContent='No legacy exclusions.'; domains.append(li);
    return;
  }
  for(const item of settings.excludedDomains){
    const li=document.createElement('li');
    const span=document.createElement('span'); span.textContent=item;
    const remove=document.createElement('button'); remove.type='button'; remove.textContent='Remove';
    remove.addEventListener('click',async()=>{
      const next=settings.excludedDomains.filter((x)=>x!==item);
      render(await saveSettings({excludedDomains:next}));
    });
    li.append(span,remove); domains.append(li);
  }
}

exportButton.addEventListener('click',async()=>{
  const blob=new Blob([serializeSettings(await loadSettings())],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download='privacy-shield-settings.json'; a.click(); URL.revokeObjectURL(url);
});
importInput.addEventListener('change',async()=>{
  const file=importInput.files?.[0]; if(!file)return;
  try{const imported=parseImportedSettings(await file.text()); await chrome.storage.local.set({settings:imported}); message.textContent='Imported and normalized.'; render(imported);}
  catch(error){message.textContent=error instanceof Error?error.message:'Import failed.';}
  finally{importInput.value='';}
});
void loadSettings().then(render);
