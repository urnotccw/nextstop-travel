import {cleanTransit,cleanMeals,cleanLodging,cleanStay,cleanPrices} from './itinerary-details.mjs';
// Durable room state, guarded by unguessable per-member tokens and CAS revisions.
class RoomError extends Error { constructor(status,message){super(message);this.status=status} }
const reject=(status,message)=>{throw new RoomError(status,message)};
const text=(v,max,min=1)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const expenseCategories=['hotel','food','activity','localTransport','longTransport','other'];
const expenseMoney=(value,max)=>Number.isFinite(value)&&value>0&&value<=max&&Math.abs(value*100-Math.round(value*100))<1e-6;
function safeExpense(x){
 if(!x||typeof x.id!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(x.id)||!expenseCategories.includes(x.category)||!text(x.name,60)||!expenseMoney(x.amount,100000)||!Number.isInteger(x.day)||x.day<0||x.day>14)reject(400,'请检查花费项目、金额和日期。');
 const hasSplit=x.totalAmount!=null||x.splitCount!=null;
 if(hasSplit&&(!expenseMoney(x.totalAmount,1000000)||!Number.isInteger(x.splitCount)||x.splitCount<1||x.splitCount>50||Math.round(x.totalAmount/x.splitCount*100)/100!==x.amount))reject(400,'总金额、分摊人数与人均金额不一致，请重新计算。');
 const shared=x.payerId!=null||x.participantIds!=null;
 if(shared&&(!hasSplit||typeof x.payerId!=='string'||!/^[a-f0-9]{16}$/.test(x.payerId)||!Array.isArray(x.participantIds)||x.participantIds.length!==x.splitCount||x.participantIds.length>12||new Set(x.participantIds).size!==x.participantIds.length||x.participantIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{16}$/.test(id))))reject(400,'请选择付款人和参与分摊的伙伴。');
 return{...(shared?{payerId:x.payerId,participantIds:[...x.participantIds].sort()} : {}),id:x.id,category:x.category,name:x.name.trim(),amount:x.amount,day:x.day,...(hasSplit?{totalAmount:x.totalAmount,splitCount:x.splitCount}:{})};
}
function safeExpenses(value,dayCount){
 if(value==null)return [];
 if(!Array.isArray(value)||value.length>60)reject(400,'花费记录最多 60 条。');
 const out=value.map(safeExpense);
 if(new Set(out.map(x=>x.id)).size!==out.length||out.some(x=>x.day>dayCount))reject(400,'花费记录有重复或超出行程天数。');
 return out;
}
function safeManualEstimate(value){
 const out={};
 for(const key of ['hotelNightly','localTransportTotal','roundTripTransportTotal']){
  const amount=value?.[key];
  if(amount!=null&&(!Number.isInteger(amount)||amount<1||amount>100000))reject(400,'预估金额需为 1–100000 元的整数，未确定可留空。');
  out[key]=amount??null;
 }
 return out;
}
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const creationBursts=new Map(); // Per-isolate network burst protection, not an account requirement.
const tokenOf=req=>req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1];
function dbFor(env){if(!env.DB?.prepare)reject(503,'共享房间暂时不可用，请稍后重试。你的个人草稿仍保留。');return env.DB.withSession?env.DB.withSession('first-primary'):env.DB}
async function body(req){const reader=req.body?.getReader();if(!reader)reject(400,'请填写房间信息。');let total=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>500000){await reader.cancel();reject(413,'行程内容过长，请减少备注后重试。')}parts.push(value)}const bytes=new Uint8Array(total);let p=0;for(const b of parts){bytes.set(b,p);p+=b.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{reject(400,'提交内容不完整。')}}
function safeCity(c){const letters=/^[\p{L}\p{N}\s·•.（）()\-]*$/u;if(!c||!text(c.id,80)||!/^[a-z0-9-]+$/.test(c.id)||!text(c.name,30,2)||!letters.test(c.name)||!text(c.province||'',40,0)||!letters.test(c.province||''))reject(400,'请重新选择城市。');return{id:c.id,name:c.name.trim(),province:c.province||''}}
function memberPreferences(r,m){return m.preferences||{budget:null,days:null,wants:r.candidates.filter(c=>r.votes[c.id]?.[m.id]==='最想去').map(({id,name,province})=>({id,name,province})),dislikes:r.candidates.filter(c=>r.votes[c.id]?.[m.id]==='这次不考虑').map(({id,name,province})=>({id,name,province}))}}
function safePreferences(p){
 if(!p||typeof p!=='object')reject(400,'请填写你的旅行偏好。');
 if(p.budget!==null&&(!Number.isInteger(p.budget)||p.budget<1||p.budget>100000))reject(400,'人均预算上限需为 1–100000 元，未确定可以留空。');
 if(p.days!==null&&(!p.days||!Number.isInteger(p.days.min)||!Number.isInteger(p.days.max)||p.days.min<1||p.days.max>14||p.days.min>p.days.max))reject(400,'出行范围需为 1–14 天，最少天数不能大于最多天数。');
 const list=value=>{if(!Array.isArray(value)||value.length>30)reject(400,'每类最多选择 30 座城市。');const cities=value.map(safeCity);if(new Set(cities.map(c=>c.id)).size!==cities.length)reject(400,'请勿重复选择城市。');return cities};
 const wants=list(p.wants),dislikes=list(p.dislikes);if(wants.some(c=>dislikes.some(d=>d.id===c.id||d.name.replace(/市$/,'')===c.name.replace(/市$/,''))))reject(400,'同一城市不能同时想去和不想去。');
 return{budget:p.budget,days:p.days?{min:p.days.min,max:p.days.max}:null,wants,dislikes};
}
function setCityOpinion(r,m,c,value){const p=memberPreferences(r,m);p.wants=p.wants.filter(x=>x.id!==c.id);p.dislikes=p.dislikes.filter(x=>x.id!==c.id);if(value==='最想去')p.wants.push(safeCity(c));if(value==='这次不考虑')p.dislikes.push(safeCity(c));if(p.wants.length>30||p.dislikes.length>30)reject(400,'每类最多选择 30 座城市，请先调整我的偏好。');m.preferences=p;r.votes[c.id]??={};r.votes[c.id][m.id]=value}
function safePlan(p,allowUndated=false){
 if(!p||!text(p.city,80)||!Array.isArray(p.days)||p.days.length<1||p.days.length>14||!(allowUndated&&!p.date)&&!/^\d{4}-\d{2}-\d{2}$/.test(p.date||''))reject(400,'同步前请设置出发日期，天数需为 1–14 天。');
 const time=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t||'');
 if(!time(p.arrival)||!time(p.departure)||!['slow','full'].includes(p.pace))reject(400,'请补全抵达和离开时间。');
 const days=p.days.map(d=>{if(!text(d.title,60)||!Array.isArray(d.stops)||d.stops.length<1||d.stops.length>8)reject(400,'每一天都需要至少一个安排，空白日补齐后再同步。');let meals;try{meals=cleanMeals(d.meals)}catch{reject(400,'三餐推荐格式不完整，请重新生成。')}return{title:d.title,...(meals?{meals}:{}),stops:d.stops.map(s=>{if(!s||!text(s.name,60)||!text(s.note||'',400,0)||!time(s.time)||!Number.isInteger(s.duration)||s.duration<(s.kind==='rest'?0:15)||s.duration>720||!Number.isFinite(s.cost)||s.cost<0||s.cost>10000||!['place','food','rest'].includes(s.kind))reject(400,'请检查行程站点的名称、时间和费用。');let transit;try{transit=cleanTransit(s.transit)}catch{reject(400,'交通建议格式不完整，请重新生成。')}return{...(transit?{transit}:{}),name:s.name,time:s.time,duration:s.duration,cost:s.cost,kind:s.kind,note:s.note||'',locked:!!s.locked}})}});
 let lodging;try{lodging=p.days.length===1?undefined:cleanLodging(p.lodging)}catch{reject(400,'住宿推荐不完整，请重新生成。')}
 const money=v=>Number.isFinite(v)&&v>=0&&v<=100000?v:0;
 let confirmedStay;try{confirmedStay=cleanStay(p.confirmedStay)}catch{reject(400,'住宿信息不完整。')}
 return{...(cleanPrices(p.priceResearch)?{priceResearch:cleanPrices(p.priceResearch)}:{}),...(confirmedStay?{confirmedStay}:{}),...(lodging?{lodging}:{}),actualExpenses:safeExpenses(p.actualExpenses,p.days.length),manualEstimate:safeManualEstimate(p.manualEstimate),city:p.city,date:p.date,arrival:p.arrival,departure:p.departure,pace:p.pace,days,summary:typeof p.summary==='string'?p.summary.slice(0,500):'',estimates:{hotel:p.days.length===1?0:money(p.estimates?.hotel),transport:money(p.estimates?.transport)},budget:p.budget==null?null:money(p.budget),origin:typeof p.origin==='string'?p.origin.slice(0,30):'',mood:typeof p.mood==='string'?p.mood.slice(0,80):'',preferences:typeof p.preferences==='string'?p.preferences.slice(0,500):'',ai:p.ai?{provider:'DeepSeek',model:String(p.ai.model||'').slice(0,80)}:null,manual:!!p.manual,estimatesStale:!!p.estimatesStale};
}
// Card-level optimistic edits: merge independent cards, reject changed targets.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const itineraryFingerprint=p=>JSON.stringify(p,(key,value)=>['actualExpenses','manualEstimate','priceResearch','status'].includes(key)?undefined:value);
function editSharedPlan(r,b,me){
 if(!r.plan)reject(409,'还没有共享行程，请先选择一个方案。');
 if(b.epoch!==(r.planEpoch||0))reject(409,'共享方案已被整体替换，请关闭编辑框后重新打开。你的输入仍保留。');
 if(!Number.isInteger(b.baseVersion)||b.baseVersion<1||b.baseVersion>r.planVersion)reject(400,'编辑版本无效，请刷新房间。');
 if(!text(b.operationId,64)||!/^[a-zA-Z0-9-]+$/.test(b.operationId))reject(400,'编辑请求不完整。');
 const previous=(r.planOperations||[]).find(x=>x.id===b.operationId&&x.member===me.id);if(previous)return previous.result;
 const p=structuredClone(r.plan),day=p.days[b.day];let list,index,kind=b.kind;
 if(!['stop','add','meals','areas','hotels'].includes(kind))reject(400,'请选择要修改的卡片。');
 if(['stop','add','meals'].includes(kind)&&(!Number.isInteger(b.day)||!day))reject(400,'这一天已经不存在，请重新打开行程。');
 if(kind==='add'){
  if(day.stops.length>=8)reject(400,'一天最多安排 8 站，请先精简安排。');
  list=day.stops;index=list.length;list.push(b.value);
 }else{
  list=kind==='stop'?day.stops:kind==='meals'?day.meals:p.lodging?.[kind];
  if(!Array.isArray(list))reject(409,'这张卡片已经不存在，请刷新房间。');
  // Locate unchanged content rather than trusting an index shifted by another edit.
  const matches=list.flatMap((v,i)=>same(v,b.before)?[i]:[]);
  if(matches.length!==1)reject(409,'伙伴刚刚修改或删除了这张卡片。你的输入已保留，请查看最新内容后再决定。');
  index=matches[0];
  if(b.value===null){if(kind!=='stop')reject(400,'这里只能删除行程站点。');if(list[index].locked)reject(409,'请先取消保留，再删除这一站。');if(list.length<=1)reject(400,'当天至少保留一个安排，请先添加新站点。');list.splice(index,1)}
  else{if(kind==='meals'&&b.value?.type!==list[index].type)reject(400,'请勿更改餐次。');list[index]=b.value}
 }
 // Apply the same validation as publication; no member can inject arbitrary plan fields.
 const clean=safePlan(p,true);
 if(kind==='stop'||kind==='add'){
  const stops=clean.days[b.day].stops;
  const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  if(b.value!==null){const value=stops[index],start=minute(value.time),end=start+value.duration;
   if(end>1440||stops.some((v,i)=>i!==index&&start<minute(v.time)+v.duration&&end>minute(v.time)))reject(409,'这段时间与其他安排重叠或跨天了，请调整时间后保存。');
  }
  stops.sort((a,b)=>a.time.localeCompare(b.time));
 }
 if(same(clean,r.plan))return {version:r.planVersion};
 r.plan=clean;r.planVersion++;r.confirmations={};
 const at=new Date().toISOString(),label={stop:b.value===null?'删除了一个安排':'修改了一个安排',add:'添加了一个安排',meals:'修改了三餐推荐',areas:'修改了住宿地区',hotels:'修改了酒店推荐'}[kind];
 r.planChanges=[{member:me.id,name:me.name,label,version:r.planVersion,at},...(r.planChanges||[])].slice(0,20);
 const result={version:r.planVersion};r.planOperations=[{id:b.operationId,member:me.id,result},...(r.planOperations||[])].slice(0,100);return result;
}
const publicRoom=(r,me)=>({id:r.id,title:r.title,revision:r.revision,owner:r.owner,me,closed:r.closed,updatedAt:r.updatedAt,members:r.members.map(m=>({id:m.id,name:m.name,joinedAt:m.joinedAt,availableDates:m.availableDates??null,preferences:memberPreferences(r,m)})),candidates:r.candidates,votes:r.votes,plan:r.plan,planVersion:r.planVersion,proposals:r.proposals||{},planOpinions:r.planOpinions||{},planEpoch:r.planEpoch||0,planChanges:r.planChanges||[],planHistory:(r.planHistory||[]).map(({id,proposalId,version,at,plan})=>({id,proposalId,version,at,city:plan.city,days:plan.days.length})),confirmations:r.confirmations,finalPlan:r.finalPlan||null,checklist:r.checklist||[],tripProgress:r.tripProgress||null,memberNames:r.memberNames||{}});
async function read(db,id){const row=await db.prepare('SELECT payload, revision FROM trip_rooms WHERE id = ?').bind(id).first();if(!row)reject(404,'这个房间不存在，或链接不完整。');return{...JSON.parse(row.payload),revision:row.revision}}
async function change(db,id,fn){for(let attempt=0;attempt<6;attempt++){const r=await read(db,id),revision=r.revision;
 const previous=[...(r.plan?[{proposalId:null,plan:structuredClone(r.plan),version:r.planVersion}]:[]),...Object.entries(r.proposals||{}).map(([proposalId,item])=>({proposalId,plan:structuredClone(item.plan),version:item.version}))];
 const result=await fn(r);
 for(const old of previous){const now=old.proposalId?r.proposals?.[old.proposalId]?.plan:r.plan;if(!now||itineraryFingerprint(old.plan)===itineraryFingerprint(now))continue;
  r.planHistory=[{id:random().slice(0,16),proposalId:old.proposalId,version:old.version,at:new Date().toISOString(),plan:old.plan},...(r.planHistory||[])].slice(0,8);
 }
 while(r.planHistory?.length>1&&new TextEncoder().encode(JSON.stringify(r)).length>1400000)r.planHistory.pop();
 r.revision++;r.updatedAt=new Date().toISOString();const out=await db.prepare('UPDATE trip_rooms SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(r),r.revision,r.updatedAt,id,revision).run();if(out.meta.changes===1)return {r,result}}reject(409,'大家正在一起操作，请稍后再试。')}
export async function handleRooms(req,env){
 try{
  const url=new URL(req.url),db=dbFor(env),path=url.pathname.split('/').filter(Boolean),id=path[2],action=path[3];
  if(req.method!=='GET'&&(![url.origin,'https://urnotccw.github.io'].includes(req.headers.get('origin'))||!req.headers.get('content-type')?.startsWith('application/json')))reject(403,'请从本站发起操作。');
  const token=tokenOf(req);if(!token)reject(401,'请重新打开房间链接，填写昵称加入。');const digest=await hash(token);
  if(req.method==='POST'&&!id){
   const b=await body(req);if(!text(b.name,20)||!text(b.title,40))reject(400,'请填写 1–20 字的昵称和 1–40 字的房间名称。');
   // An anonymous browser can own a room; member tokens still protect every room action.
   const user=req.headers.get('oai-authenticated-user-id'),visitor=req.headers.get('x-trip-creator')||'';
   const ownerHash=await hash(user||'browser:'+(/^[a-f0-9]{48}$/.test(visitor)?visitor:digest));
   const network=await hash(req.headers.get('cf-connecting-ip')||'unknown-network'),nowMs=Date.now();
   for(const [key,bucket] of creationBursts)if(nowMs-bucket.start>=60000)creationBursts.delete(key);
   const burst=creationBursts.get(network)||{start:nowMs,count:0};
   if(burst.count>=5)reject(429,'创建房间有点频繁，请一分钟后再试。已有房间可以继续使用。');
   if(creationBursts.size>=1000&&!creationBursts.has(network))reject(503,'当前创建人数较多，请稍后再试。');
   burst.count++;creationBursts.set(network,burst);
   const count=await db.prepare('SELECT COUNT(*) AS count FROM trip_rooms WHERE creator_hash = ?').bind(ownerHash).first();if(count.count>=30)reject(429,'已达到 30 个房间上限，请继续使用已有房间。');
   const rid=random().slice(0,24),invite=random(),mid=random().slice(0,16),now=new Date().toISOString();
   const r={id:rid,title:b.title.trim(),owner:mid,closed:false,revision:1,updatedAt:now,inviteHash:await hash(invite),members:[{id:mid,name:b.name.trim(),tokenHash:digest,joinedAt:now}],candidates:[],votes:{},plan:null,planVersion:0,confirmations:{}};
   await db.prepare('INSERT INTO trip_rooms (id, creator_hash, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?)').bind(rid,ownerHash,JSON.stringify(r),1,now).run();return json({room:publicRoom(r,mid),invite},201);
  }
  if(!/^[a-f0-9]{24}$/.test(id||''))reject(404,'房间链接不完整。');
  if(req.method==='POST'&&action==='join'){
   const b=await body(req);if(!text(b.name,20)||!/^[a-f0-9]{48}$/.test(b.invite||''))reject(400,'请填写昵称，并使用完整邀请链接。');const inviteHash=await hash(b.invite);
   const {r,result}=await change(db,id,r=>{if(r.closed||r.inviteHash!==inviteHash)reject(403,'邀请链接已失效，请让发起人重新邀请。');const existing=r.members.find(m=>m.tokenHash===digest);if(existing)return existing.id;if(r.members.length>=12)reject(409,'房间已满，最多 12 位成员。');const mid=random().slice(0,16);r.members.push({id:mid,name:b.name.trim(),tokenHash:digest,joinedAt:new Date().toISOString()});return mid});return json({room:publicRoom(r,result)});
  }
  const authenticate=r=>{const m=r.members.find(m=>m.tokenHash===digest);if(!m)reject(403,'你尚未加入这个房间，或已退出。请使用邀请链接重新加入。');return m};
  if(req.method==='GET'&&!action){const r=await read(db,id),me=authenticate(r);return json({room:publicRoom(r,me.id)})}
  if(req.method==='GET'&&action==='history'){const r=await read(db,id);authenticate(r);return json({entries:r.planHistory||[]})}
  if(req.method!=='POST'||action!=='actions')reject(404,'房间操作不存在。');
  const b=await body(req);let invite;
  const {r,result}=await change(db,id,async r=>{
   const me=authenticate(r),owner=me.id===r.owner;const onlyOwner=()=>{if(!owner)reject(403,'这个操作由房间发起人完成。')};
   if(r.closed&&b.type!=='reopen')reject(409,'房间已关闭，仅可查看。');
   if(b.type==='add-city'){const city=safeCity(b.city);if(!r.candidates.some(c=>c.id===city.id)){if(r.candidates.length>=30)reject(400,'先从当前候选中选一选吧，最多 30 座城市。');r.candidates.push({...city,addedBy:me.id})}setCityOpinion(r,me,city,'最想去')}
   else if(b.type==='remove-city'){const c=r.candidates.find(c=>c.id===b.cityId);if(!c)reject(404,'城市已经移出候选。');if(!owner&&c.addedBy!==me.id)reject(403,'只能移除自己推荐的城市。');if(r.plan?.city===c.id)reject(409,'这座城市已有共享行程，请先发布另一座城市的行程再移除。');r.candidates=r.candidates.filter(x=>x.id!==c.id);delete r.votes[c.id]}
   else if(b.type==='vote'){if(!r.candidates.some(c=>c.id===b.cityId)||!['最想去','可以接受','这次不考虑'].includes(b.value))reject(400,'请选择候选城市和你的意见。');setCityOpinion(r,me,r.candidates.find(c=>c.id===b.cityId),b.value)}
   else if(b.type==='preferences'){
    const p=safePreferences(b.preferences),added=p.wants.filter(c=>!r.candidates.some(x=>x.id===c.id));
    if(r.candidates.length+added.length>30)reject(400,'共享候选最多 30 城，请先移除部分候选再保存。');
    // Authenticate the editor; a submitted memberId can never edit someone else's card.
    for(const votes of Object.values(r.votes)){if(['最想去','这次不考虑'].includes(votes[me.id]))delete votes[me.id]}
    r.candidates.push(...added.map(c=>({...c,addedBy:me.id})));me.preferences=p;
    for(const c of r.candidates){const value=p.wants.some(x=>x.id===c.id)?'最想去':p.dislikes.some(x=>x.id===c.id)?'这次不考虑':null;if(value){r.votes[c.id]??={};r.votes[c.id][me.id]=value}}
   }
   else if(b.type==='set-availability'){
    if(!same(me.availableDates??null,b.before??null))reject(409,'你的空闲日期已在其他窗口更新，请重新打开日历。');
    if(!Array.isArray(b.dates)||b.dates.length>90||b.dates.some(d=>typeof d!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)||new Set(b.dates).size!==b.dates.length)reject(400,'请选择有效日期，最多 90 天。');
    me.availableDates=[...b.dates].sort();
   }
   else if(b.type==='set-final'){
    onlyOwner();
    if(!same(r.finalPlan||null,b.before||null))reject(409,'最终方案已有更新，请刷新后再确认。');
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,plan=b.proposalId?item?.plan:r.plan,version=item?item.version:r.planVersion;
    if(!plan||version!==b.version)reject(409,'方案已经变化，请查看最新版本再确定。');
    const unchanged=r.finalPlan?.proposalId===(b.proposalId||null)&&r.finalPlan?.version===version;
    r.finalPlan={proposalId:b.proposalId||null,version,city:plan.city,confirmedAt:new Date().toISOString(),confirmations:unchanged?{...r.finalPlan.confirmations,[me.id]:true}:{[me.id]:true}};
    if(!unchanged)r.tripProgress=null;
   }
   else if(b.type==='confirm-final'){
    const final=r.finalPlan,item=final?.proposalId?r.proposals?.[final.proposalId]:null,plan=final?.proposalId?item?.plan:r.plan,version=item?item.version:r.planVersion;
    if(!final||!plan||version!==final.version||b.version!==version||(b.proposalId||null)!==final.proposalId)reject(409,'最终方案已变化，请由发起人重新确定。');
    final.confirmations??={};if(b.confirmed===false)delete final.confirmations[me.id];else final.confirmations[me.id]=true;
   }
   else if(b.type==='set-task'){
    if(typeof b.id!=='string'||!/^[-a-zA-Z0-9]{8,64}$/.test(b.id))reject(400,'请重新创建准备事项。');
    const tasks=r.checklist??=[],i=tasks.findIndex(x=>x.id===b.id),old=i<0?null:tasks[i];
    if(!same(old,b.before??null))reject(409,'这个事项已被伙伴更新，请重新打开清单。');
    if(b.value===null){if(i<0)reject(404,'事项已删除。');tasks.splice(i,1)}
    else{const v=b.value;if(!text(v.title,100)||typeof v.done!=='boolean'||v.assignee!==null&&!r.members.some(m=>m.id===v.assignee))reject(400,'请填写事项并选择房间内的负责人。');
     const dueDate=v.dueDate===undefined?(old?.dueDate??null):v.dueDate===''?null:v.dueDate;
     if(dueDate!==null&&(typeof dueDate!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate+'T00:00:00Z'))||new Date(dueDate+'T00:00:00Z').toISOString().slice(0,10)!==dueDate))reject(400,'请选择有效的计划完成日期，或留空。');
     const value={id:b.id,title:v.title.trim(),assignee:v.assignee,dueDate,done:v.done,updatedBy:me.id,updatedAt:new Date().toISOString()};
     if(i<0){if(tasks.length>=60)reject(400,'准备事项最多 60 条。');tasks.push(value)}else tasks[i]=value;
    }r.checklist=tasks;
   }
   else if(b.type==='set-trip-stop'||b.type==='set-trip-booking'){
    const final=r.finalPlan,item=final?.proposalId?r.proposals?.[final.proposalId]:null,plan=final?.proposalId?item?.plan:r.plan,version=item?item.version:r.planVersion;
    if(!final||!plan||final.version!==version||b.version!==version||(b.proposalId||null)!==final.proposalId)reject(409,'行程有变化，请由发起人重新确定最终方案后记录进度。');
    if(!Number.isInteger(b.day)||!Number.isInteger(b.index)||!plan.days[b.day]?.stops[b.index])reject(400,'请选择有效的行程安排。');
    if(!r.tripProgress||r.tripProgress.version!==version||r.tripProgress.proposalId!==final.proposalId)r.tripProgress={version,proposalId:final.proposalId,done:{}};
    const key=b.day+':'+b.index;
    if(b.type==='set-trip-booking'){
     const bookings=r.tripProgress.bookings??={};if(!same(bookings[key]||null,b.before||null))reject(409,'预约信息已被更新，请重新打开。');
     if(b.value===null)delete bookings[key];else{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.value.time)||!text(b.value.note||'',120,0))reject(400,'请填写有效预约时间，备注最多 120 字。');bookings[key]={time:b.value.time,note:(b.value.note||'').trim()};}
    }else{
     if(typeof b.done!=='boolean')reject(400,'请选择完成状态。');
     if(Boolean(r.tripProgress.done[key])!==b.before)reject(409,'伙伴已经更新这一站，请刷新查看。');
     if(b.done)r.tripProgress.done[key]={by:me.id,at:new Date().toISOString()};else delete r.tripProgress.done[key];
    }
   }
   else if(b.type==='publish'){onlyOwner();if(b.baseVersion!==r.planVersion)reject(409,'房间行程已有新版本，请先打开最新共享行程再编辑。你的本地草稿仍保留。');const p=safePlan(b.plan);if(!r.candidates.some(c=>c.id===p.city)){if(!b.city)reject(400,'请先将这座城市加入房间候选。');const city=safeCity(b.city);if(city.id!==p.city)reject(400,'城市与行程不匹配，请重新选择。');if(r.candidates.length>=30)reject(400,'房间已有 30 个候选，请先移除一个再同步新城市。');r.candidates.push({...city,addedBy:me.id})}r.plan=p;r.planOpinions={};r.planVersion++;r.planEpoch=r.planVersion;r.planOperations=[];r.planChanges=[{member:me.id,name:me.name,label:'发布了共享方案',version:r.planVersion,at:new Date().toISOString()}];r.confirmations={}}
   else if(b.type==='delete-plan'){
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,p=b.proposalId?item?.plan:r.plan,version=b.proposalId?item?.version:r.planVersion;
    if(!owner&&(!b.proposalId||b.proposalId!==me.id))reject(403,'只能删除自己提出的方案；房间发起人可以管理全部方案。');
    if(!p||b.baseVersion!==version)reject(409,'方案已更新或被删除，请刷新后再操作。');
    if(item){r.removedProposalVersions??={};r.removedProposalVersions[b.proposalId]=Math.max(item.version,item.epoch||0);delete r.proposals[b.proposalId];r.planHistory=(r.planHistory||[]).filter(x=>x.proposalId!==b.proposalId);}
    else{r.plan=null;r.planVersion++;r.planEpoch=(r.planEpoch||0)+1;r.planOpinions={};r.confirmations={};r.planOperations=[];r.planChanges=[];r.planHistory=(r.planHistory||[]).filter(x=>x.proposalId!==null);}
   }
   else if(b.type==='set-stay'){
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,plan=b.proposalId?item?.plan:r.plan,version=item?item.version:r.planVersion;
    if(!plan||b.baseVersion!==version)reject(409,'方案已有更新，请重新打开住宿设置。');
    let stay;try{stay=cleanStay(b.stay)}catch{reject(400,'请填写有效的酒店名称和地址。')}if(!stay)reject(400,'请填写住宿。');plan.confirmedStay=stay;
    if(item){item.version++;item.epoch=(item.epoch||1)+1;item.opinions={};item.updatedAt=new Date().toISOString();}else{r.planVersion++;r.planEpoch=(r.planEpoch||0)+1;r.planOpinions={};r.confirmations={};}
   }
   else if(b.type==='apply-ai-plan'){
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,old=b.proposalId?item?.plan:r.plan,version=item?item.version:r.planVersion;
    if(!old||b.baseVersion!==version)reject(409,'伙伴已更新方案，请基于最新行程重新调整。');
    const next=safePlan(b.plan,true);if(next.city!==old.city||next.days.length!==old.days.length)reject(400,'请保持原方案城市和天数。');
    next.manualEstimate=safeManualEstimate(old.manualEstimate);
    next.actualExpenses=safeExpenses((old.actualExpenses||[]).map(x=>({...x,day:Math.min(x.day,next.days.length)})),next.days.length);
    for(let i=0;i<next.days.length;i++){let end=0;for(const s of next.days[i].stops){const start=Number(s.time.slice(0,2))*60+Number(s.time.slice(3));if(start<end||start+s.duration>1440)reject(400,'安排时间重叠，请重新调整。');end=start+s.duration;}for(const locked of old.days[i].stops.filter(s=>s.locked))if(!next.days[i].stops.some(s=>same(s,locked)))reject(409,'不能修改已保留的安排。');}
    const changes=[{member:me.id,name:me.name,label:'采纳了安安的调整',version:version+1,at:new Date().toISOString()}];
    if(item)Object.assign(item,{plan:next,version:version+1,epoch:(item.epoch||1)+1,opinions:{},operations:[],changes,updatedAt:new Date().toISOString()});else Object.assign(r,{plan:next,planVersion:version+1,planEpoch:(r.planEpoch||0)+1,planOpinions:{},confirmations:{},planOperations:[],planChanges:changes});
   }
   else if(b.type==='restore-plan'){
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,currentPlan=b.proposalId?item?.plan:r.plan,version=item?item.version:r.planVersion;
    if(!currentPlan||b.baseVersion!==version)reject(409,'方案已有新修改，请查看最新版本后再恢复。');
    const entry=(r.planHistory||[]).find(x=>x.id===b.historyId&&x.proposalId===(b.proposalId||null));
    if(!entry)reject(404,'这个历史版本已不在保留范围内。');
    const restored=safePlan(entry.plan,true);
    restored.actualExpenses=safeExpenses((currentPlan.actualExpenses||[]).map(x=>({...x,day:Math.min(x.day,restored.days.length)})),restored.days.length);
    restored.manualEstimate=safeManualEstimate(currentPlan.manualEstimate);
    if(item)Object.assign(item,{plan:restored,version:version+1,epoch:(item.epoch||1)+1,opinions:{},operations:[],changes:[{member:me.id,name:me.name,label:`恢复了第 ${entry.version} 版`,version:version+1,at:new Date().toISOString()}],updatedAt:new Date().toISOString()});
    else Object.assign(r,{plan:restored,planVersion:version+1,planEpoch:(r.planEpoch||0)+1,planOpinions:{},confirmations:{},planOperations:[],planChanges:[{member:me.id,name:me.name,label:`恢复了第 ${entry.version} 版`,version:version+1,at:new Date().toISOString()}]});
   }
   else if(b.type==='set-expense'){
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,plan=b.proposalId?item?.plan:r.plan;
    if(!plan)reject(404,'方案已经不存在。');
    const expenses=plan.actualExpenses??=[],position=expenses.findIndex(x=>x.id===b.id);
    if(b.value===null){if(position<0)reject(409,'这笔花费已经删除，请刷新费用明细。');if(!same(expenses[position],b.before))reject(409,'这笔花费已被伙伴修改，请刷新后再编辑。');expenses.splice(position,1)}
    else{const value=safeExpense(b.value);if(value.id!==b.id)reject(400,'花费编号不一致，请重新打开。');
    if(position>=0&&expenses[position].payerId&&!value.payerId)reject(409,'这笔花费已按伙伴分摊，请在房间的账单结算中修改，保留付款人和分摊人。');
    if(value.payerId){const old=position>=0?expenses[position]:null,known=new Set([...r.members.map(m=>m.id),...(old?.participantIds||[]),...(old?.payerId?[old.payerId]:[])]);if(!known.has(value.payerId)||value.participantIds.some(id=>!known.has(id)))reject(400,'付款人和分摊人必须是房间伙伴。');r.memberNames??={};for(const m of r.members)r.memberNames[m.id]=m.name;}
    if(position<0&&b.before)reject(409,'这笔花费已经删除，请重新打开。');if(value.day>plan.days.length)reject(400,'花费日期超出行程天数。');if(position>=0){if(!same(expenses[position],b.before))reject(409,'这笔花费已被伙伴修改，请刷新后再编辑。');expenses[position]=value}else{if(expenses.length>=60)reject(400,'花费记录最多 60 条。');expenses.push(value)}}
    plan.actualExpenses=expenses;if(item)item.updatedAt=new Date().toISOString();
   }
   else if(b.type==='set-estimate'){
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,plan=b.proposalId?item?.plan:r.plan;
    if(!plan)reject(404,'方案已经不存在。');
    if(!same(safeManualEstimate(plan.manualEstimate),safeManualEstimate(b.before)))reject(409,'预算预估已被伙伴修改，请刷新后再编辑。');
    plan.manualEstimate=safeManualEstimate(b.value);
    if(item)item.updatedAt=new Date().toISOString();
   }
   else if(b.type==='edit-plan'){
    if(b.proposalId){const item=r.proposals?.[b.proposalId];if(!item)reject(404,'方案已经不存在。');const draft={plan:item.plan,planVersion:item.version,planEpoch:item.epoch||1,planOperations:item.operations||[],planChanges:item.changes||[]};editSharedPlan(draft,b,me);if(draft.planVersion!==item.version){item.opinions={};}Object.assign(item,{plan:draft.plan,version:draft.planVersion,operations:draft.planOperations,changes:draft.planChanges,updatedAt:new Date().toISOString()});}
    else{const old=r.planVersion;editSharedPlan(r,b,me);if(old!==r.planVersion)r.planOpinions={};}
   }
   else if(b.type==='plan-vote'){
    const item=b.proposalId?r.proposals?.[b.proposalId]:null,p=b.proposalId?item?.plan:r.plan,version=b.proposalId?item?.version:r.planVersion;
    if(!p||b.version!==version)reject(409,'方案已更新，请查看最新内容再投票。');
    if(!['agree','later'].includes(b.value))reject(400,'请选择同意或再看看。');
    if(item){item.opinions??={};item.opinions[me.id]=b.value;}else{r.planOpinions??={};r.planOpinions[me.id]=b.value;}
   }
   else if(b.type==='propose'){
    const previous=r.proposals?.[me.id];if(b.baseVersion!==(previous?.version||0))reject(409,'你的推荐方案已有新版本，请重新打开同步入口。');
    const p=safePlan(b.plan,true),city=safeCity(b.city);if(city.id!==p.city)reject(400,'城市与行程不匹配，请重新选择。');
    r.proposals??={};r.proposals[me.id]={plan:p,city,version:(previous?.version||r.removedProposalVersions?.[me.id]||0)+1,epoch:(previous?.epoch||r.removedProposalVersions?.[me.id]||1)+1,opinions:{},updatedAt:new Date().toISOString()};
    if(new TextEncoder().encode(JSON.stringify(r)).length>1500000)reject(400,'房间行程内容较多，请精简备注后再分享。');
   }
   else if(b.type==='confirm'){if(!r.plan||b.version!==r.planVersion)reject(409,'行程已更新，请查看新版本后再确认。');if(b.confirmed===false)delete r.confirmations[me.id];else r.confirmations[me.id]=r.planVersion}
   else if(b.type==='rename'){if(!text(b.name,20))reject(400,'昵称请填写 1–20 个字。');me.name=b.name.trim()}
   else if(b.type==='rotate-invite'){onlyOwner();invite=random();r.inviteHash=await hash(invite)}
   else if(b.type==='close'){onlyOwner();r.closed=true;r.inviteHash=''}
   else if(b.type==='reopen'){onlyOwner();r.closed=false;invite=random();r.inviteHash=await hash(invite)}
   else if(b.type==='leave'){if(owner)reject(400,'发起人不能退出，请关闭房间或切回个人旅行。');r.memberNames??={};r.memberNames[me.id]=me.name;r.members=r.members.filter(x=>x.id!==me.id);delete r.confirmations[me.id];if(r.planOpinions)delete r.planOpinions[me.id];for(const item of Object.values(r.proposals||{}))if(item.opinions)delete item.opinions[me.id];if(r.proposals)delete r.proposals[me.id];r.planHistory=(r.planHistory||[]).filter(x=>x.proposalId!==me.id);for(const votes of Object.values(r.votes))delete votes[me.id]}
   else reject(400,'不支持这个房间操作。');
   for(const c of r.candidates)for(const m of r.members){if(!m.preferences)continue;const value=m.preferences.wants.some(x=>x.id===c.id)?'最想去':m.preferences.dislikes.some(x=>x.id===c.id)?'这次不考虑':null;if(value){r.votes[c.id]??={};r.votes[c.id][m.id]=value}}
   return me.id;
  });return json({room:publicRoom(r,result),...(invite?{invite}:{})});
 }catch(e){if(e instanceof RoomError)return json({message:e.message},e.status);console.error('Room storage operation failed',e?.name);return json({message:'共享房间连接失败，操作尚未确认。请刷新查看最新状态后重试。'},503)}
}
