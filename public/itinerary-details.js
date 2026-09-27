(()=>{'use strict';
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
function cleanTransit(value,required=false){
 if(value==null&&!required)return undefined;
 if(!value||!text(value.advice,300)||!Array.isArray(value.nearby)||value.nearby.length>3||value.nearby.some(s=>!s||!['metro','bus'].includes(s.type)||!text(s.name,60)||(s.lines!==undefined&&(!Array.isArray(s.lines)||s.lines.length>4||s.lines.some(l=>!text(l,30))))))throw Error('交通建议不完整');
 if(value.durationLabel!==undefined&&!text(value.durationLabel,80))throw Error('交通用时不完整');
 return{...(value.durationLabel?{durationLabel:value.durationLabel.trim()}:{}),advice:value.advice.trim(),nearby:value.nearby.map(s=>({type:s.type,name:s.name.trim(),...(s.lines?.length?{lines:[...new Set(s.lines.map(l=>l.trim()))]}:{})}))};
}
function cleanMeals(value,required=false){
 if(value==null&&!required)return undefined;
 const field=(v,max)=>typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);
 const types=['breakfast','lunch','dinner'];
 if(!Array.isArray(value)||value.length!==3||new Set(value.map(m=>m?.type)).size!==3||value.some(m=>!m||!types.includes(m.type)||!field(m.area,80)||!field(m.suggestion,200)||!field(m.note,200)))throw Error('三餐推荐不完整');
 return types.map(type=>{const m=value.find(x=>x.type===type);return{type,area:m.area.trim(),suggestion:m.suggestion.trim(),note:m.note.trim()}});
}

function cleanLodging(value,required=false){
 if(value==null&&!required)return undefined;
 const field=(v,max)=>typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);
 if(!value||!Array.isArray(value.areas)||value.areas.length<1||value.areas.length>3||!Array.isArray(value.hotels)||value.hotels.length>3||!field(value.note,300))throw Error('住宿建议不完整');
 const areas=value.areas.map(a=>{if(!a||!text(a.name,60)||!field(a.reason,250)||!field(a.transport,200))throw Error('住宿地区信息不完整');return{name:a.name.trim(),reason:a.reason.trim(),transport:a.transport.trim()}});
 const hotels=value.hotels.map(h=>{if(!h||!text(h.name,100)||!field(h.area,60)||!field(h.reason,250))throw Error('酒店建议不完整');return{name:h.name.trim(),area:h.area.trim(),reason:h.reason.trim()}});
 return{areas,hotels,note:value.note.trim()};
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function conciseNote(value){return String(value??'').replace(/(?:具体)?(?:店铺|店家|商家|餐厅|门店)(?:的)?营业(?:状态|时间)(?:需|需要|请)(?:在)?(?:现场|出发前|到店前)?(?:核实|确认)[。；;！!]?/g,'').trim()}
const mapURL=(city,keyword)=>'https://uri.amap.com/search?keyword='+encodeURIComponent(keyword)+'&city='+encodeURIComponent(city)+'&view=list&src=nextstop&callnative=0';
const labels={breakfast:'早饭',lunch:'午饭',dinner:'晚饭'};
function stationIcon(type){return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 12h14M9 3v9M8 19l-2 3m10-3 2 3"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>${type==='bus'?'<path d="M2 7v5m20-5v5"/>':''}</svg>`}
function placeHeading(name,city,tag='h4'){return `<div class="place-heading"><${tag}>${esc(name)}</${tag}><a class="place-map-link" href="${esc(mapURL(city,name))}" target="_blank" rel="noopener noreferrer">在地图查看 ↗</a></div>`}
function placePhoto(){return ''}
function briefNote(value){const text=conciseNote(value);if(!text)return '';const first=text.split(/[。！？]/)[0];const short=first.length>60?first.slice(0,60)+'…':first;return `<p class="card-brief">${esc(short)}</p>${text.length>short.length?`<details class="card-more"><summary>展开详情</summary><p>${esc(text)}</p></details>`:''}`}
function transit(s,city){if(!s.transit)return '';let t;try{t=cleanTransit(s.transit)}catch{return ''}return `<div class="stop-transit-guide compact-transit">${t.durationLabel?`<p class="transit-duration">◷ ${esc(t.durationLabel)}</p>`:''}<div class="transit-stations">${t.nearby.map(n=>`<a target="_blank" rel="noopener noreferrer" href="${esc(mapURL(city,n.name))}">${stationIcon(n.type)}${n.type==='metro'?'地铁':'公交'}${n.lines?.length?' '+esc(n.lines.join(' / ')):''} · ${esc(n.name)}</a>`).join('')}</div><details class="card-more"><summary>交通详情</summary><p>${esc(t.advice)}</p></details></div>`}
function route(d){return `<div class="day-route-guide"><h3>当天路线</h3><p>${d.stops.map(s=>esc(s.name)).join(' → ')}</p><small>按时间线顺序游览，实际接驳以地图查询为准。</small></div>`}
function context(type,p,index,at){const minute=t=>Number(t?.slice(0,2))*60+Number(t?.slice(3)),hour=at?minute(at):{breakfast:9,lunch:13,dinner:19}[type]*60;if(index===0&&hour<minute(p.arrival)+60)return '抵达前或途中参考';if(index===p.days.length-1&&hour>minute(p.departure)-90)return '返程或途中参考';return '当天用餐参考'}
function meals(d,p,index,city){let list;try{list=cleanMeals(d.meals)}catch{return ''}if(!list)return '';return `<section class="day-meal-guide"><h3>三餐吃什么</h3><p class="meal-guide-note">按当天路线选的用餐备选；具体用餐以时间线为准，未排入时间线的餐费不计入小计。</p>${list.map(m=>`<article class="meal-guide-item"><div class="meal-guide-title"><h4>${labels[m.type]}</h4><small>${context(m.type,p,index)}</small></div>${placeHeading(m.area,city,'strong')}${placePhoto(m.area,city)}<p>${esc(conciseNote(m.suggestion))}</p><p class="meal-guide-note">${esc(conciseNote(m.note))}</p>${context(m.type,p,index)==='当天用餐参考'?`<a target="_blank" rel="noopener noreferrer" href="${esc(mapURL(city,m.area+' 餐饮'))}">在地图找餐饮</a>`:''}</article>`).join('')}</section>`}
const mealSlots={breakfast:{time:'09:00',label:'早间',range:'07–10 点',min:5*60,max:11*60},lunch:{time:'13:00',label:'午间',range:'11–14 点',min:11*60,max:16*60},dinner:{time:'19:00',label:'晚间',range:'17–20 点',min:17*60,max:24*60}};
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
function timeline(d){
 const entries=d.stops.map((stop,index)=>({kind:'stop',stop,index,time:stop.time}));let list;try{list=cleanMeals(d.meals)}catch{}if(!list)return entries;
 const busy=entries.map(e=>({start:minutes(e.time),end:minutes(e.time)+(Number(e.stop.duration)||60)})),used=new Set();
 const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 for(const m of list){
  const slot=mealSlots[m.type],pattern={breakfast:/早餐|早饭/,lunch:/午餐|午饭/,dinner:/晚餐|晚饭/}[m.type];
  const match=entries.filter(e=>e.kind==='stop'&&!used.has(e.index)&&e.stop.kind==='food'&&minutes(e.time)>=slot.min&&minutes(e.time)<slot.max).sort((a,b)=>Number(pattern.test(b.stop.name))-Number(pattern.test(a.stop.name))||Math.abs(minutes(a.time)-minutes(slot.time))-Math.abs(minutes(b.time)-minutes(slot.time)))[0];
  if(match){used.add(match.index);match.kind='meal';match.meal=m;match.end=clock(minutes(match.time)+(Number(match.stop.duration)||60));continue}
  const duration=45,preferred=minutes(slot.time),candidates=[];
  for(let start=slot.min;start+duration<=slot.max;start+=5)if(!busy.some(b=>start<b.end+15&&start+duration>b.start-15))candidates.push(start);
  candidates.sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred)||a-b);
  const start=candidates[0];
  if(start!==undefined){busy.push({start,end:start+duration});entries.push({kind:'meal',meal:m,time:clock(start),end:clock(start+duration)})}
  else entries.push({kind:'meal',meal:m,time:null,end:null,unscheduled:true});
 }
 return entries.sort((a,b)=>(a.time?minutes(a.time):1500)-(b.time?minutes(b.time):1500));
}
function meal(m,p,index,city,embedded=false,at,controls='',schedule=null){
 const slot=mealSlots[m.type],where=schedule?.unscheduled?'当天时段已满，待调整':context(m.type,p,index,at),suggestion=conciseNote(m.suggestion),first=suggestion.split(/[。！？]/)[0],short=first.length>60?first.slice(0,60)+'…':first;
 const extra=[suggestion.length>short.length?suggestion:'',conciseNote(m.note)].filter(Boolean);
 return `<${embedded?'div':'article'} class="${embedded?'meal-inline':'meal-timeline-row'}">${embedded?'':`<div class="meal-slot">${schedule?.unscheduled?'待安排':esc(at||slot.time)}${schedule?.end?`<small>至 ${esc(schedule.end)}</small>`:''}</div>`}<div class="meal-guide-item"><div class="meal-guide-title"><h4>${labels[m.type]}</h4>${where==='当天用餐参考'?'':`<small>${where}</small>`}</div>${placeHeading(m.area,city,'strong')}${short?`<p class="card-brief">${esc(short)}</p>`:''}${schedule?.stop?transit(schedule.stop,city):''}${extra.length||schedule?.stopControl?`<details class="card-more"><summary>展开详情</summary>${extra.map(t=>`<p>${esc(t)}</p>`).join('')}${schedule?.stopControl||''}</details>`:''}${schedule?.stop?`<small>${schedule.stop.duration} 分钟 · 预计 ¥${schedule.stop.cost} / 人</small>`:''}${controls}</div></${embedded?'div':'article'}>`;
}
function textDay(d){return timeline(d).flatMap(e=>e.kind==='meal'?[(e.time?(e.time+(e.end?'–'+e.end:'')):'待安排')+' · '+labels[e.meal.type]+'推荐：'+e.meal.area+'；'+e.meal.suggestion+'；'+e.meal.note]:[`${e.stop.time} ${e.stop.name}｜${e.stop.duration} 分钟｜¥${e.stop.cost}${e.stop.note?'\n备注：'+e.stop.note:''}${textTransit(e.stop)}`,...(e.meal?[labels[e.meal.type]+'推荐：'+e.meal.area+'；'+e.meal.suggestion+'；'+e.meal.note]:[])]);}
function textTransit(s){if(!s.transit)return '';return '\n交通：'+s.transit.advice+(s.transit.durationLabel?'\n'+s.transit.durationLabel:'')+(s.transit.nearby?.length?'\n附近车站（待核实）：'+s.transit.nearby.map(n=>(n.type==='metro'?'地铁':'公交')+(n.lines?.length?' '+n.lines.join(' / '):'')+' · '+n.name).join('、'):'')}
function textMeals(d){return (d.meals||[]).map(m=>labels[m.type]+'推荐：'+m.area+'；'+m.suggestion+'；'+m.note)}
function staySection(p,city,editable){
 const stay=p.confirmedStay,days=p.days.map((_,i)=>stay?.days?stay.days[i]||null:stay),filled=days.filter(Boolean),same=filled.length===days.length&&filled.every(x=>x.name===filled[0].name&&x.address===filled[0].address);
 return `<section class="confirmed-stay"><div class="lodging-heading"><h3>已确定住宿</h3>${editable&&!filled.length?'<button class="secondary" data-stay-edit>填写住宿</button>':''}</div>${filled.length?`<div class="stay-summary"><div class="stay-identity"><strong>${same?esc(filled[0].name):'每天的住宿'}</strong><p class="lodging-note">${same?`${days.length} 天都住这里${filled[0].address?' · '+esc(filled[0].address):''}`:`已填写 ${filled.length}/${days.length} 天`}</p></div>${editable?'<button class="primary stay-search-button" data-stay-research>✦ 安安查全部交通 <span aria-hidden="true">→</span></button>':''}</div>`:'<p>填好住宿后，让安安帮你查交通。</p>'}<div class="stay-day-options">${days.map((s,i)=>editable?`<button class="stay-day-option" data-stay-edit data-stay-day="${i}" aria-label="${s?'修改':'填写'}第${i+1}天住宿"><span>第 ${i+1} 天</span><strong>${s?esc(s.name):'填写住宿'}</strong><span aria-hidden="true">✎</span></button>`:`<div class="stay-day-option"><span>第 ${i+1} 天</span><strong>${s?esc(s.name):'未填写'}</strong></div>`).join('')}</div></section>`;
}

function lodging(p,city,editable=false,controls=null){return staySection(p,city,editable||!!controls)+lodgingRecommendations(p,city,editable,controls)}
function lodgingRecommendations(p,city,editable=false,controls=null){
 if(p.days.length===1)return '<section class="plan-lodging"><h3>住在哪里</h3><p>这次是当日往返，无需安排过夜住宿。</p></section>';
 let stay;try{stay=cleanLodging(p.lodging)}catch{}
 const button=editable?`<button class="secondary" data-action="lodging">${stay?'更新住宿建议':'请安安补充住宿建议'}</button>`:'';
 if(!stay)return `<section class="plan-lodging"><h3>住在哪里</h3><p>这份行程还没有住宿地区和酒店建议。${editable?'可以单独补充，已安排的路线会保留。':'由方案作者补充并同步后，这里会显示。'}</p>${button}</section>`;
 return `<section class="plan-lodging" aria-label="住宿地区与酒店推荐"><div class="lodging-heading"><h3>住在哪里</h3><span>${p.days.length-1} 晚 · 安安推荐</span></div><p class="lodging-note">按生成时的路线、预算和偏好推荐。酒店营业、位置、实时房价与空房请预订前核实。</p><div class="lodging-grid lodging-cards">${stay.areas.slice(0,2).map((a,i)=>`<article class="lodging-item"><span class="lodging-kind">推荐地区</span><h5>${esc(a.name)}</h5><details><summary>推荐理由与交通</summary><p>${esc(a.reason)}</p><p class="lodging-note">交通：${esc(a.transport)}</p></details><a href="${esc(mapURL(city,a.name+' 酒店'))}" target="_blank" rel="noopener noreferrer">在这一区找酒店</a>${controls?controls('areas',i):editable?`<button class="card-pencil" aria-label="编辑这张卡片" title="编辑" data-action="edit-detail" data-kind="areas" data-index="${i}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 15 16 3a3.5 3.5 0 0 1 5 5L9 20l-6 1z"/></svg></button>`:''}</article>`).join('')}${stay.hotels.slice(0,2).map((h,i)=>`<article class="lodging-item"><span class="lodging-kind">酒店备选</span><h5>${esc(h.name)}</h5><details><summary>推荐理由与位置</summary><p class="lodging-note lodging-location">${esc(h.area)}</p><p>${esc(h.reason)}</p></details><a href="${esc(mapURL(city,h.name))}" target="_blank" rel="noopener noreferrer">查看酒店位置</a>${controls?controls('hotels',i):editable?`<button class="card-pencil" aria-label="编辑这张卡片" title="编辑" data-action="edit-detail" data-kind="hotels" data-index="${i}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 15 16 3a3.5 3.5 0 0 1 5 5L9 20l-6 1z"/></svg></button>`:''}</article>`).join('')||'<p class="lodging-no-hotels">暂没有足够可靠的具体酒店信息，可以按推荐地区查找酒店。</p>'}</div><p class="lodging-note">${esc(stay.note)}</p><p class="lodging-note">酒店为备选，尚未预订；此处不增加费用小计，住宿分摊估算见「费用明细」。</p>${button}</section>`;
}
function textLodging(p){if(p.days.length===1)return ['住宿：当日往返，无需过夜'];let s;try{s=cleanLodging(p.lodging)}catch{}if(!s)return ['住宿：尚未补充建议'];return ['住宿建议 · '+(p.days.length-1)+' 晚',...s.areas.slice(0,2).map(a=>'推荐地区：'+a.name+'；'+a.reason+'；交通：'+a.transport),...s.hotels.slice(0,2).map(h=>'酒店备选：'+h.name+'（'+h.area+'）；'+h.reason),s.note,'酒店营业、位置、实时房价与空房请预订前核实，尚未预订。'];}
function destinationPhoto(city){const item=window.CITY_HIGHLIGHTS?.[String(city).replace(/市$/,'')]?.items?.[0];if(!item||!/^assets\/[a-zA-Z0-9_./-]+$/.test(item.src))return '';return `<figure class="itinerary-destination"><img src="${esc(item.src)}" alt="${esc(item.title)}" loading="lazy" onerror="this.closest('figure').hidden=true"><figcaption>${esc(city)} · ${esc(item.title)} <span>目的地实景参考 · ${esc(item.author||'')}</span>${/^https:\/\//.test(item.source||'')?`<a href="${esc(item.source)}" target="_blank" rel="noopener noreferrer">图片来源</a>`:''}</figcaption></figure>`;}
function cleanPrices(v){
 if(!v||!['reference','unavailable'].includes(v.status)||!Array.isArray(v.items)||v.items.length>40)return undefined;
 const items=v.items.flatMap(x=>{try{const u=new URL(x.sourceUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!['hotel','breakfast','lunch','dinner','ticket'].includes(x.category)||!text(x.name,100)||!text(x.basis,200)||![x.low,x.high].every(n=>Number.isFinite(n)&&n>=0&&n<=10000)||x.high<x.low||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>14)return [];return [{category:x.category,name:x.name,low:x.low,high:x.high,quantity:x.quantity,sourceUrl:u.href,basis:x.basis}]}catch{return []}});
 const unverified=Array.isArray(v.unverified)?v.unverified.slice(0,8).flatMap(x=>{try{const u=new URL(x.sourceUrl);if(u.protocol!=='https:'||u.username||u.password||!['hotel','breakfast','lunch','dinner','ticket'].includes(x.category)||!text(x.name,100)||!['quote-missing','site-restricted','site-unavailable','quote-mismatch','amount-mismatch'].includes(x.reason))return [];return [{category:x.category,name:x.name,sourceUrl:u.href,reason:x.reason}]}catch{return []}}):undefined;
 return {status:items.length?'reference':'unavailable',...(typeof v.reason==='string'&&['model-unavailable','search-unavailable','response-incomplete','no-price','source-unverified','timeout'].includes(v.reason)?{reason:v.reason}:{}),...(unverified?{unverified}:{}),checkedAt:typeof v.checkedAt==='string'?v.checkedAt.slice(0,30):'',date:typeof v.date==='string'?v.date.slice(0,10):'',stayKey:typeof v.stayKey==='string'?v.stayKey.slice(0,6000):'null',nights:Number.isInteger(v.nights)?v.nights:0,days:Number.isInteger(v.days)?v.days:0,places:Array.isArray(v.places)?v.places.filter(x=>text(x,60)).slice(0,112):[],items};
}

function priceStatusMessage(r){
 if(!r)return '尚未查询价格。';
 if(r.items.length)return '公开参考价，预订前请确认。';
 return {'model-unavailable':'安安暂时无法查询价格。','search-unavailable':'联网搜索没有返回可用来源。','response-incomplete':'安安这次没有完整返回价格清单。','no-price':'搜索到了网页，但没有找到明确的人民币单价。','source-unverified':'找到了价格线索，但来源无法核对，暂不计入。','timeout':'查价超时，请稍后重试。'}[r.reason]||'这次没查到可靠价格。';
}
function priceFeedback(r,stale,hasDate){
 if(!r)return '<p class="cost-status">尚未查询价格。</p>';
 const accepted=stale?0:r.items.length,unverified=stale?[]:r.unverified||[];
 const title=stale?'行程有变化，请重新查价':accepted?`已核实 ${accepted} 项价格`:'查价完成，暂无可计入价格';
 const detail=stale?'原来的价格已过期，没有计入这份行程。':priceStatusMessage(r);
 const reasons={'quote-missing':'搜索结果没有可核对的价格原文','site-restricted':'这个网站暂不支持自动核对','site-unavailable':'来源网页无法访问或限制自动访问','quote-mismatch':'搜索摘录与网页当前内容不一致','amount-mismatch':'网页金额与搜索结果不一致'};
 const leads=unverified.length?`<details class="price-leads"><summary>查看 ${unverified.length} 条未核实的价格来源</summary><ul>${unverified.map(x=>`<li><span>${esc(x.name)} · ${esc(reasons[x.reason])}</span><a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a></li>`).join('')}</ul></details>`:'';
 const dateNote=hasDate?'':'未填写出行日期，住宿只能查询公开参考价，无法确认入住当天房价。';
 return `<div class="price-result ${accepted?'has-price':'needs-price'}" role="status" aria-live="polite"><strong>${esc(title)}</strong><p>${esc(detail)}${accepted&&unverified.length?` 另有 ${unverified.length} 条来源未通过核对。`:''}</p>${dateNote?`<p>${esc(dateNote)}</p>`:''}${leads}</div>`;
}

function priceSnapshot(p){
 const r=cleanPrices(p.priceResearch);if(!r?.items?.length)return null;
 const names=[...new Set(p.days.flatMap(d=>d.stops.filter(s=>s.kind==='place').map(s=>s.name)))];
 const stale=r.stayKey!==JSON.stringify(p.confirmedStay||null)||r.date!==(p.date||'')||r.days!==p.days.length||JSON.stringify(r.places)!==JSON.stringify(names);
 if(stale)return null;
 return {low:Math.round(r.items.reduce((n,x)=>n+x.low*x.quantity,0)),high:Math.round(r.items.reduce((n,x)=>n+x.high*x.quantity,0))};
}
function budgetSummary(p,room=false,readonly=false){
 const r=cleanPrices(p.priceResearch),button=readonly?'':'<button class="primary" data-action="query-prices">安安查费用</button>';
 const ledger=window.TripPlanFeatures?.expenseMarkup(p,room,readonly)||'';
 const names=[...new Set(p.days.flatMap(d=>d.stops.filter(s=>s.kind==='place').map(s=>s.name)))];
 const stale=!!r?.items?.length&&(r.stayKey!==JSON.stringify(p.confirmedStay||null)||r.date!==(p.date||'')||r.days!==p.days.length||JSON.stringify(r.places)!==JSON.stringify(names));
 const items=stale?[]:r?.items||[];
 const manual=window.TripPlanFeatures?.manualEstimate(p.manualEstimate)||{};
 const nights=Math.max(0,p.days.length-1),hasManualHotel=nights>0&&manual.hotelNightly!=null;
 const counted=items.filter(x=>!(hasManualHotel&&x.category==='hotel'));
 const range=(lo,hi)=>lo===hi?'¥'+lo:'¥'+lo+'–'+hi;
 const low=counted.reduce((n,x)=>n+x.low*x.quantity,0)+(hasManualHotel?manual.hotelNightly*nights:0)+(manual.localTransportTotal||0)+(manual.roundTripTransportTotal||0);
 const high=counted.reduce((n,x)=>n+x.high*x.quantity,0)+(hasManualHotel?manual.hotelNightly*nights:0)+(manual.localTransportTotal||0)+(manual.roundTripTransportTotal||0);
 const labels={hotel:'住宿',breakfast:'早餐',lunch:'午餐',dinner:'晚餐',ticket:'门票'};
 const missingMeals=['breakfast','lunch','dinner'].reduce((sum,k)=>{const count=Math.min(p.days.length,items.filter(x=>x.category===k).reduce((n,x)=>n+x.quantity,0));return sum+p.days.length-count},0);
 const missingTickets=names.filter(n=>!items.some(x=>x.category==='ticket'&&x.name===n));
 const missing=[...(nights&&!hasManualHotel&&!items.some(x=>x.category==='hotel')?['住宿']:[]),...(missingMeals?[`餐饮 ${missingMeals} 餐`]:[]),...(missingTickets.length?[`门票 ${missingTickets.length} 处`]:[]),...(manual.localTransportTotal==null?['市内交通']:[]),...(manual.roundTripTransportTotal==null?['往返交通']:[])];
 const exclusions=missing.length?`<div class="cost-exclusions"><h4>尚未计入</h4><ul class="cost-exclusion-list">${missing.map(label=>`<li>${esc(label)}</li>`).join('')}</ul>${missingTickets.length?`<details class="cost-ticket-details"><summary>查看未计入的 ${missingTickets.length} 处景点门票</summary><ul>${missingTickets.map(name=>`<li>${esc(name)}</li>`).join('')}</ul></details>`:''}</div>`:'';
 const edit=readonly?'':`<button class="secondary" ${room?'data-room-action':'data-action'}="edit-estimate">${Object.values(manual).some(x=>x!=null)?'修改住宿与交通预估':'填写住宿与交通预估'}</button>`;
 const manualRows=[...(hasManualHotel?[`<p>住宿 ¥${manual.hotelNightly.toLocaleString()} / 晚 × ${nights} 晚 = ¥${(manual.hotelNightly*nights).toLocaleString()} <small>自行填写</small></p>`]:[]),...(manual.localTransportTotal!=null?[`<p>市内交通 ¥${manual.localTransportTotal.toLocaleString()} <small>自行填写 · 全程</small></p>`]:[]),...(manual.roundTripTransportTotal!=null?[`<p>往返交通 ¥${manual.roundTripTransportTotal.toLocaleString()} <small>自行填写 · 全程</small></p>`]:[])].join('');
 const sourceRows=counted.map(x=>`<p><strong>${labels[x.category]} · ${esc(x.name)}</strong><br>${range(x.low,x.high)} / ${x.category==='hotel'?'间 / 晚':x.category==='ticket'?'人':'人 / 餐'} × ${x.quantity}${x.category==='hotel'?' 晚':x.category==='ticket'?' 次':' 餐'}<br><small>${esc(x.basis)}</small> <a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a></p>`).join('');
 const hasCovered=!!(counted.length||hasManualHotel||manual.localTransportTotal!=null||manual.roundTripTransportTotal!=null);
 return `<section class="trip-cost-summary"><div class="budget-summary"><h3>已覆盖费用小计</h3><strong${hasCovered?'':' class="cost-pending-amount"'}>${hasCovered?range(Math.round(low),Math.round(high))+'<small> / 人</small>':'待补充'}</strong></div>${priceFeedback(r,stale,!!p.date)}${manualRows}${sourceRows?`<details><summary>已查价格依据与来源</summary>${sourceRows}<small>查询时间：${esc(r.checkedAt?.slice(0,10)||'')}。价格可能变动，请预订前确认。</small></details>`:''}${exclusions}<p class="cost-caveat">仅统计已查或手填的金额，实际花费另行记录。</p><div class="cost-actions">${button}${edit}</div></section>`+ledger;
}
function comparisonCost(p){
 const r=cleanPrices(p.priceResearch),valid=priceSnapshot(p),items=valid?r.items:[],manual=window.TripPlanFeatures.manualEstimate(p.manualEstimate),nights=Math.max(0,p.days.length-1),hotel=nights>0&&manual.hotelNightly!=null;
 const counted=items.filter(x=>!(hotel&&x.category==='hotel')),base=(hotel?manual.hotelNightly*nights:0)+(manual.localTransportTotal||0)+(manual.roundTripTransportTotal||0),lo=base+counted.reduce((n,x)=>n+x.low*x.quantity,0),hi=base+counted.reduce((n,x)=>n+x.high*x.quantity,0);
 const names=[...new Set(p.days.flatMap(d=>d.stops.filter(s=>s.kind==='place').map(s=>s.name)))],missing=[];
 if(nights&&!hotel&&!items.some(x=>x.category==='hotel'))missing.push('住宿');
 if(['breakfast','lunch','dinner'].some(k=>items.filter(x=>x.category===k).reduce((n,x)=>n+x.quantity,0)<p.days.length))missing.push('餐饮');
 if(names.some(n=>!items.some(x=>x.category==='ticket'&&x.name===n)))missing.push('门票');
 if(manual.localTransportTotal==null)missing.push('市内交通');if(manual.roundTripTransportTotal==null)missing.push('往返交通');
 const has=!!(counted.length||Object.values(manual).some(x=>x!=null));return {label:has?'¥'+Math.round(lo).toLocaleString()+(lo===hi?'':'–'+Math.round(hi).toLocaleString())+'（已覆盖小计）':'待补充',missing};
}
window.TripDetails={comparisonCost,budgetSummary,priceSnapshot,priceStatusMessage,briefNote,conciseNote,placeHeading,placePhoto,destinationPhoto,timeline,meal,textDay,lodging,textLodging,cleanLodging,transit,route,meals,textTransit,textMeals,cleanTransit,cleanMeals};

})();
