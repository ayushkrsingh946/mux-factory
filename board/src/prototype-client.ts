// THROWAWAY #30. All state is in memory. No fetch, persistence, updates or real starts.
import { renderPrototype, fixtureNow } from './prototype-ui.ts';
import type { DemoState, Variant } from './prototype-ui.ts';
import { revisedItemDetails } from './prototype-revision.ts';
import { esc, renderAddItemForm } from './render.ts';
import { validateDraft } from './add-item.ts';
import type { BoardData, Item } from './model.ts';
const original=JSON.parse(document.getElementById('board-data')!.textContent!) as BoardData;
let data=structuredClone(original);
const app=document.getElementById('app')!, dialogs=document.getElementById('dialogs')!;
function variant(): Variant { const v=new URL(location.href).searchParams.get('variant')?.toUpperCase(); return v==='A'||v==='B'||v==='C'||v==='E'?v:'D'; }
const initial=():DemoState=>({boardArea:new URL(location.href).searchParams.get('area')==='list'?'list':'work',variant:variant(),view:location.hash==='#flow'?'flow':'board',selected:'PVTI_sample09',toggled:{},warning:false,updating:false,refreshes:0,added:0,removed:'',notices:[]});
let state=initial(), serial=0, latest='';
interface Position {x:number;y:number;anchors:{key:string;top:number}[];focus:string|null}
function focusKey(el:HTMLElement):string|null {
  const attr=[...el.attributes].find(a=>a.name.startsWith('data-'));
  return attr?`[${attr.name}="${CSS.escape(attr.value)}"]`:el.id?`#${CSS.escape(el.id)}`:null;
}
function capture():Position {
  const anchors=[...app.querySelectorAll<HTMLElement>('[data-anchor]')].filter(el=>el.getClientRects().length).map(el=>({key:el.dataset.anchor!,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
  const visible=anchors.filter(a=>a.bottom>12&&a.top<innerHeight);
  // Prefer the actual child being read over its large concept container.
  const reading=visible.find(a=>!visible.some(b=>a!==b&&app.querySelector(`[data-anchor="${CSS.escape(a.key)}"]`)?.contains(app.querySelector(`[data-anchor="${CSS.escape(b.key)}"]`))));
  anchors.sort((a,b)=>Math.abs(a.top-(reading?.top??0))-Math.abs(b.top-(reading?.top??0)));
  return {x:scrollX,y:scrollY,anchors,focus:document.activeElement instanceof HTMLElement?focusKey(document.activeElement):null};
}
function restore(p:Position):void {
  const survivor=p.anchors.map(a=>({a,el:app.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(a.key)}"]`)})).find(s=>s.el?.getClientRects().length);
  scrollTo({left:p.x,top:survivor?scrollY+survivor.el!.getBoundingClientRect().top-survivor.a.top:p.y,behavior:'instant'});
  if(p.focus)app.querySelector<HTMLElement>(p.focus)?.focus({preventScroll:true});
}
function decorateOriginal():void {
  app.querySelectorAll<HTMLElement>('.attention-board article.card,.attention-board li.row-item').forEach(el=>{
    const link=el.querySelector<HTMLAnchorElement>(':scope > a.title,:scope > a.row-title');
    const action=el.querySelector<HTMLElement>('[data-queue],[data-start],[data-abandon]');
    const item=link?data.items.find(i=>i.url===link.getAttribute('href')):data.items.find(i=>i.id===(action?.dataset.queue??action?.dataset.start??action?.dataset.abandon))??data.items.find(i=>i.title===el.querySelector('.title,.row-title')?.textContent?.replace('draft','').trim());
    if(!item)return;
    el.dataset.item=item.id;el.dataset.anchor=`board-${item.id}${el.closest('.sub-groups')?'-sub':''}`;el.tabIndex=-1;
    const b=document.createElement('button');b.className='copy inspect-original';b.dataset.inspect=item.id;b.textContent='Details';el.append(b);
  });
}
function render(p=capture()):void {
  const open=app.querySelector<HTMLDetailsElement>('.demo-console')?.open;
  app.innerHTML=renderPrototype(data,state);decorateOriginal();
  if(open)app.querySelector<HTMLDetailsElement>('.demo-console')!.open=true;
  app.querySelectorAll('.dismiss').forEach(b=>b.setAttribute('aria-label','Dismiss notification'));
  restore(p);
}
function change(fn:()=>void):void {const p=capture();fn();render(p);}
function notify(text:string,tone:'success'|'failure'='success',item?:string):void {
  const id=++serial;state.notices.push({id,tone,text,item});
  if(tone==='success')setTimeout(()=>change(()=>{state.notices=state.notices.filter(n=>n.id!==id);}),5000);
}
function cycle(delta:number):void {change(()=>{const keys:Variant[]=['D','E'];const at=keys.includes(state.variant)?keys.indexOf(state.variant):0;state.variant=keys[(at+delta+2)%2]!;const url=new URL(location.href);url.searchParams.set('variant',state.variant);history.replaceState(null,'',url);});}
function showItem(id:string):void {
  state.view='board';state.toggled['done-list']=true;
  const target=data.items.find(i=>i.id===id);state.boardArea=target?.status==='List'?'list':'work';state.toggled['compact-list']=true;state.toggled.concepts=true;
  for(const p of ['server','apple','draft'])state.toggled[`list-${p}`]=true;
  const url=new URL(location.href);url.hash='';if(state.boardArea==='list')url.searchParams.set('area','list');else url.searchParams.delete('area');history.replaceState(null,'',url);render();
  const el=app.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`);el?.scrollIntoView({block:'center',behavior:'instant'});el?.focus({preventScroll:true});
}
function createDemo(title='Keep reading position when the dashboard refreshes',repo=data.repos[0]!.repo,labels=['improvement']):Item {
  state.added++;
  const item:Item={...structuredClone(original.items[0]!),id:`demo-${state.added}`,number:900+state.added,title,repo,labels,status:'List',url:null,parent:null,subIssues:{total:0,completed:0},blockedBy:0,linkedPrs:[],updatedAt:new Date(fixtureNow).toISOString()};
  data.items.unshift(item);latest=item.id;notify(`Added “${title}” to List.`,'success',item.id);return item;
}
function demo(action:string):void {
  if(action==='view'){if(latest)showItem(latest);else change(()=>notify('Add an item first.','failure'));return;}
  change(()=>{
    if(action==='success')notify('Action completed. Your reading position is preserved.');
    if(action==='failure')notify('Could not complete the action. Retry or dismiss this failure.','failure');
    if(action==='completed')notify('Board updated successfully (demo).');
    if(action==='warning')state.warning=!state.warning;
    if(action==='add')createDemo();
    if(action==='insert'){createDemo('Refresh fixture: a new question arrived above').status='Needs you';state.refreshes++;}
    if(action==='remove'){
      const first=capture().anchors[0];const el=first?app.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(first.key)}"]`):null;
      if(el?.dataset.item){const id=el.dataset.item;data.items=data.items.filter(i=>i.id!==id);state.removed=id;notify('Reading item removed. Nearest surviving item stays in place.');}
    }
    if(action==='reset'){data=structuredClone(original);state={...initial(),variant:state.variant,view:state.view};latest='';}
  });
}
app.addEventListener('toggle',event=>{const el=event.target;if(el instanceof HTMLDetailsElement&&el.id)state.toggled[el.id]=el.open;},true);
app.addEventListener('click',event=>{
  const el=(event.target as HTMLElement).closest<HTMLElement>('button,[data-section]');if(!el)return;
  if(el.hasAttribute('data-cycle'))cycle(Number(el.dataset.cycle));
  else if(el.hasAttribute('data-demo'))demo(el.dataset.demo!);
  else if(el.hasAttribute('data-area'))change(()=>{state.boardArea=el.dataset.area as DemoState['boardArea'];const url=new URL(location.href);if(state.boardArea==='list')url.searchParams.set('area','list');else url.searchParams.delete('area');history.replaceState(null,'',url);});
  else if(el.hasAttribute('data-view'))change(()=>{state.view=el.dataset.view as DemoState['view'];const url=new URL(location.href);url.hash=state.view==='flow'?'flow':'';history.replaceState(null,'',url);});
  else if(el.hasAttribute('data-dismiss'))change(()=>{state.notices=state.notices.filter(n=>n.id!==Number(el.dataset.dismiss));});
  else if(el.hasAttribute('data-view-item'))showItem(el.dataset.viewItem!);
  else if(el.hasAttribute('data-inspect')){
    change(()=>{state.selected=el.dataset.inspect!;});
    if(innerWidth<=1150||state.variant==='D'||state.variant==='E'){
      const reading=capture();
      dialogs.innerHTML=`<dialog id="prototype-inspector" aria-label="Item details"><button class="copy" data-close-inspector>Close details</button>${state.variant==='D'||state.variant==='E'?revisedItemDetails(data,state.selected):app.querySelector('.inspector')!.innerHTML}</dialog>`;
      const dialog=dialogs.querySelector<HTMLDialogElement>('dialog')!;
      dialog.querySelector('[data-copy]')?.addEventListener('click',()=>{const b=dialog.querySelector<HTMLElement>('[data-copy]')!;void navigator.clipboard.writeText(b.dataset.copy!).then(()=>{b.textContent='Copied';}).catch(()=>{b.textContent='Select command to copy';});});
      dialog.querySelector('[data-close-inspector]')!.addEventListener('click',()=>dialog.close());
      dialog.addEventListener('close',()=>restore(reading));dialog.showModal();
    }
  }
  else if(el.hasAttribute('data-refresh'))change(()=>{state.refreshes++;notify('Fixture refreshed.');});
  else if(el.hasAttribute('data-update')){if(state.updating)return;change(()=>{state.updating=true;});setTimeout(()=>change(()=>{state.updating=false;notify('Board updated successfully (demo).');}),1800);}
  else if(el.hasAttribute('data-queue'))change(()=>{const i=data.items.find(i=>i.id===el.dataset.queue);if(i){i.status='Queued';notify(`Moved “${i.title}” to Queued.`,'success',i.id);}});
  else if(el.hasAttribute('data-start'))change(()=>{const id=el.dataset.start!;if(!data.started?.[id]){data.started={...data.started,[id]:{threadId:`demo-${id}`,title:'Simulated thread'}};notify('Thread started (demo). No thread was created.','success',id);}});
  else if(el.hasAttribute('data-abandon'))openAbandon(el.dataset.abandon!);
  else if(el.hasAttribute('data-add-item'))openAdd();
  else if(el.hasAttribute('data-copy'))void navigator.clipboard.writeText(el.dataset.copy!).then(()=>change(()=>notify('Command copied.'))).catch(()=>change(()=>notify('Clipboard unavailable. Select the command to copy it.','failure')));
  else if(el.hasAttribute('data-section')){event.preventDefault();if(state.view==='flow')change(()=>{state.view='board';const url=new URL(location.href);url.hash='';history.replaceState(null,'',url);});document.getElementById(el.dataset.section!)?.scrollIntoView({block:'start'});}
});
function openAdd():void {
  const reading=capture();dialogs.innerHTML=renderAddItemForm(data);
  const dialog=dialogs.querySelector<HTMLDialogElement>('dialog')!,form=dialogs.querySelector<HTMLFormElement>('form')!;
  const repo=form.elements.namedItem('repo') as HTMLSelectElement;
  form.querySelector('.form-hint')!.textContent='Demo only. Creates an in-memory fixture in List; keeps your reading position.';form.noValidate=false;
  dialog.querySelector('[data-close-item]')!.addEventListener('click',()=>dialog.close());
  repo.addEventListener('change',()=>form.querySelectorAll<HTMLElement>('[data-applicability]').forEach(group=>{group.hidden=group.dataset.applicability!==repo.value;group.querySelectorAll<HTMLInputElement>('input').forEach(input=>{input.checked=false;input.disabled=Boolean(group.hidden);});}));
  form.addEventListener('submit',event=>{
    event.preventDefault();const values=new FormData(form);
    try {const draft=validateDraft({repo:values.get('repo'),kind:values.get('kind'),title:values.get('title'),description:values.get('description'),labels:values.getAll('labels')},data.repos);dialog.close();createDemo(draft.title,draft.repo,[draft.kind,...draft.labels]);render(reading);}
    catch(err){form.querySelector('#item-result')!.textContent=(err as Error).message;}
  });
  dialog.addEventListener('close',()=>restore(reading));dialog.showModal();
}
function openAbandon(id:string):void {
  const item=data.items.find(i=>i.id===id)!,reading=capture();
  dialogs.innerHTML=`<dialog id="abandon-dialog" aria-labelledby="abandon-title"><h2 id="abandon-title">Abandon ${esc(item.title)}?</h2><p>Demo only. Removes this fixture from memory.</p><div class="form-actions"><button class="copy" data-cancel>Cancel</button><button class="copy abandon" data-confirm>Abandon item</button></div></dialog>`;
  const dialog=dialogs.querySelector<HTMLDialogElement>('dialog')!;
  dialog.querySelector('[data-cancel]')!.addEventListener('click',()=>dialog.close());
  dialog.querySelector('[data-confirm]')!.addEventListener('click',()=>{dialog.close();data.items=data.items.filter(i=>i.id!==id);notify('Item abandoned (demo).');render(reading);});
  dialog.addEventListener('close',()=>restore(reading));dialog.showModal();
}
document.addEventListener('keydown',event=>{if((event.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();cycle(event.key==='ArrowLeft'?-1:1);}});
window.addEventListener('hashchange',()=>change(()=>{state.view=location.hash==='#flow'?'flow':'board';}));
window.addEventListener('popstate',()=>change(()=>{state.variant=variant();state.boardArea=new URL(location.href).searchParams.get('area')==='list'?'list':'work';state.view=location.hash==='#flow'?'flow':'board';}));
// Exercise the known 15 s refresh/focus regression without a network request.
setInterval(()=>change(()=>{state.refreshes++;}),15000);
render();
