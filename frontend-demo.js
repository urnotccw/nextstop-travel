/* Browser-only demo data and interactions. No network, authentication or server. */
(() => {
  'use strict';
  const PREFIX = 'nextstop-frontend-', DB = PREFIX + 'local-rooms';
  const clone = x => JSON.parse(JSON.stringify(x));
  const stamp = () => new Date().toISOString();
  const id = n => Array.from(crypto.getRandomValues(new Uint8Array(n / 2)), x => x.toString(16).padStart(2, '0')).join('');
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { throw Error('浏览器未允许本地保存，或存储空间已满。请释放空间后重试。'); } };
  const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const clock = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const cityInfo = c => ({id:c.id, name:c.name, province:c.province || ''});
  const prefs = () => ({budget:null, days:null, wants:[], dislikes:[]});
  const stop = (name, time, duration = 60) => ({name, time, duration, cost:0, kind:/午餐|晚餐|早饭|午饭/.test(name)?'food':'place', locked:false, note:'本地示例安排，用于体验时间线和编辑功能；具体路线、开放时间及费用请自行核实。'});

  function makePlan(city, options = {}, locked = []) {
    const c = window.TRIP_CITIES.find(x => x.id === city.id || x.name === city.name);
    const days = Math.max(1, Math.min(14, Number(options.days) || 3));
    const arrival = options.arrival || '11:00', departure = options.departure || '18:00';
    const plan = {city:city.id, ...options, arrival, departure, pace:options.pace || 'slow', date:options.date || '', origin:options.origin || '杭州', budget:options.budget ?? null, ai:false, manual:true, demo:true, estimates:{hotel:0, transport:0}, actualExpenses:[], days:[]};
    for (let d = 0; d < days; d++) {
      const start = d === 0 ? Math.min(1435, minutes(arrival) + 60) : 9 * 60 + 30;
      const end = d === days - 1 ? minutes(departure) - 90 : 21 * 60;
      const names = c && d < 3 ? c.places[d] : ['待填写的旅行安排'];
      const fixed = locked.filter(x => x.day === d).map(x => clone(x.stop));
      const stops = [...fixed];
      let cursor = start;
      for (const name of names) {
        while (cursor + 60 <= end && fixed.some(s => cursor < minutes(s.time) + s.duration + 30 && cursor + 60 > minutes(s.time) - 30)) cursor += 30;
        if (cursor + 60 > end) break;
        if (!fixed.some(s => s.name === name)) stops.push(stop(name, clock(cursor)));
        cursor += 120;
      }
      // A late arrival is an arrival/rest card, never a fabricated sightseeing slot.
      if (!stops.length && d === 0 && days > 1) stops.push({...stop('抵达后前往住宿', arrival, Math.min(60, 1440-minutes(arrival))), kind:'rest', note:'示例占位：抵达后办理入住并休息，游览从第二天开始。'});
      stops.sort((a,b) => a.time.localeCompare(b.time));
      plan.days.push({title:c && d < 3 ? c.themes[d] : '留一点时间，自由安排', stops, meals:['breakfast','lunch','dinner'].map(type => ({type, area:'当天所在街区', suggestion:'本地示例：根据自己的口味选择附近餐饮。', note:'用餐时段仅作演示，未查询具体店铺与价格。'}))});
    }
    return plan;
  }

  function lodging() {
    return {areas:[{name:'交通便利的住宿区域（待选择）', reason:'本地示例：按自己的路线寻找合适区域。', transport:'请手动核实车站、步行距离与末班车时间。'}], hotels:[], note:'纯前端版不查询酒店、空房和房价；可手动填写已确认的住宿。'};
  }
  async function itinerary(payload, signal) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    if (payload.mode === 'generate') return {plan:makePlan(payload.city, payload.options, payload.locked)};
    if (payload.mode === 'lodging') return {lodging:lodging()};
    if (payload.mode === 'replace') {
      const old = payload.stops[payload.index], c = window.TRIP_CITIES.find(x => x.id === payload.city.id);
      return {stop:{...old, name:c?.alternatives?.find(x => !payload.stops.some(s => s.name === x)) || '自由活动（可编辑）', note:'本地备选示例，未查询实时路线和开放情况。'}};
    }
    if (payload.mode === 'explore') {
      const mood = payload.preferences?.mood || '', list = window.TRIP_CITIES.filter(c => c.tags.includes(mood)).slice(0,3);
      return {answer:'这是本地示例回复，不会联网检索。\n\n'+(list.length?list:window.TRIP_CITIES.slice(0,3)).map(c => c.name+'：'+c.desc).join('\n\n')+'\n\n可以在地图点选城市、加入候选，再打开可编辑的示例行程。'};
    }
    if (payload.mode === 'chat') {
      const q = payload.question || '';
      const answer = /雨/.test(q) ? '雨天可以把户外安排移到室内，留出交通和休息时间。点击时间线的铅笔可手动修改；本版不会查询天气或替你自动改动计划。' : /住|酒店/.test(q) ? '建议先标出当天重点活动，再手动比较附近的住宿和交通。这个演示没有酒店价格或空房数据，可在住宿卡片填写已确认的住处。' : /预算|费用|钱/.test(q) ? '你可以在「费用明细」手动填写预算和实际花费。个人与本地房间的对应方案可以互相保存；本版不查询实时价格。' : '把一天的安排留出空隙，注意抵达和返程预留时间。你可以编辑站点、减少一站或记录实际花费。这里使用固定示例回复，不会理解任意要求或自动规划真实路线。';
      return {answer:'本地演示回复\n\n'+answer};
    }
    throw Error('纯前端版不提供实时查询，请手动填写。');
  }

  function newRoom(name, title, token) {
    const member = id(16), roomId = id(24);
    return {id:roomId,title,owner:member,revision:1,closed:false,updatedAt:stamp(),members:[{id:member,name,joinedAt:stamp(),availableDates:null,preferences:prefs()}],candidates:[],votes:{},plan:null,planVersion:0,planEpoch:0,planChanges:[],proposals:{},planOpinions:{},confirmations:{},finalPlan:null,checklist:[],tripProgress:null,memberNames:{[member]:name},_tokens:{[token]:member},_invite:id(48),_history:[]};
  }
  function view(r, token) {
    const result = clone(r); result.me = r._tokens[token];
    delete result._tokens; delete result._invite; delete result._history;
    return result;
  }
  function requirePlan(r, proposalId) {
    const item = proposalId ? r.proposals[proposalId] : null;
    const plan = proposalId ? item?.plan : r.plan;
    if (!plan) throw Error('这份本地方案已移除，请重新选择。');
    return {item,plan,version:item?.version || r.planVersion};
  }
  function remember(r, proposalId) {
    const {plan,version} = requirePlan(r,proposalId);
    r._history.unshift({id:id(24),proposalId:proposalId || null,version,at:stamp(),plan:clone(plan)});
    r._history=r._history.slice(0,24);
  }
  function bump(r, proposalId) {
    if (proposalId) { const p=r.proposals[proposalId]; p.version++;p.epoch++;p.opinions={};p.updatedAt=stamp(); }
    else {r.planVersion++;r.planEpoch++;r.planOpinions={};r.confirmations={};}
    if ((r.finalPlan?.proposalId || null) === (proposalId || null)) { r.finalPlan=null;r.tripProgress=null; }
  }
  function vote(r, me, cityId, value) {
    if (!['最想去','可以接受','这次不考虑'].includes(value)) throw Error('请选择一种态度。');
    const c=r.candidates.find(x=>x.id===cityId);if(!c)throw Error('候选城市不存在。');
    (r.votes[cityId]??={})[me]=value;
    const p=r.members.find(m=>m.id===me).preferences;
    p.wants=p.wants.filter(x=>x.id!==cityId);p.dislikes=p.dislikes.filter(x=>x.id!==cityId);
    if(value==='最想去')p.wants.push(cityInfo(c));if(value==='这次不考虑')p.dislikes.push(cityInfo(c));
  }
  async function room(path, body, token) {
    const db=read(DB,{}), parts=path.split('/').filter(Boolean);
    if (!parts.length && body) {
      if(!body.name?.trim()||!body.title?.trim())throw Error('请填写昵称与房间名称。');
      const r=newRoom(body.name.trim(),body.title.trim(),token);db[r.id]=r;write(DB,db);
      return {room:view(r,token),invite:r._invite};
    }
    const r=db[parts[0]];
    if(!r)throw Error('本机没有这个演示房间。纯前端版不支持通过链接跨设备加入。');
    if(parts[1]==='join')throw Error('房间仅用于本地演示，不能通过邀请链接加入。请打开预置房间或新建本地房间。');
    const me=r._tokens[token];if(!me)throw Error('找不到本地房间入口，请从房间列表重新打开。');
    if(parts[1]==='history')return {entries:clone(r._history)};
    if(!body)return {room:view(r,token)};
    const b=body,type=b.type,member=r.members.find(m=>m.id===me);
    if(r.closed&&!['reopen','rename','leave','rotate-invite'].includes(type))throw Error('房间已关闭，请先重新开放。');
    if(['close','reopen','rotate-invite','set-final'].includes(type)&&r.owner!==me)throw Error('此操作仅房间发起人可执行。');
    if(type==='add-city') {if(!r.candidates.some(c=>c.id===b.city.id)){if(r.candidates.length>=30)throw Error('候选已满。');r.candidates.push({...cityInfo(b.city),addedBy:me});}vote(r,me,b.city.id,'最想去');}
    else if(type==='remove-city'){r.candidates=r.candidates.filter(c=>c.id!==b.cityId);delete r.votes[b.cityId];}
    else if(type==='vote')vote(r,me,b.cityId,b.value);
    else if(type==='preferences') {member.preferences=clone(b.preferences);for(const c of b.preferences.wants)if(!r.candidates.some(x=>x.id===c.id)&&r.candidates.length<30)r.candidates.push({...cityInfo(c),addedBy:me});for(const c of r.candidates){const value=b.preferences.wants.some(x=>x.id===c.id)?'最想去':b.preferences.dislikes.some(x=>x.id===c.id)?'这次不考虑':null;if(value)(r.votes[c.id]??={})[me]=value;else if(r.votes[c.id]?.[me]!=='可以接受')delete (r.votes[c.id]||{})[me];}}
    else if(type==='set-availability')member.availableDates=[...new Set(b.dates)].sort();
    else if(type==='rename'){if(!b.name?.trim())throw Error('昵称不能为空。');member.name=b.name.trim();r.memberNames[me]=member.name;}
    else if(type==='close')r.closed=true;
    else if(type==='reopen')r.closed=false;
    else if(type==='rotate-invite')r._invite=id(48);
    else if(type==='leave'){if(r.owner===me)throw Error('发起人请使用关闭房间。');r.members=r.members.filter(m=>m.id!==me);for(const v of Object.values(r.votes))delete v[me];delete r._tokens[token];}
    else if(type==='publish'||type==='propose'){
      const key=type==='propose'?me:null,old=key?r.proposals[key]:r.plan;
      if(old)remember(r,key);
      if(key)r.proposals[key]={plan:clone(b.plan),city:clone(b.city),version:(r.proposals[key]?.version||0)+1,epoch:(r.proposals[key]?.epoch||0)+1,opinions:{},updatedAt:stamp()};
      else {r.plan=clone(b.plan);r.planVersion++;r.planEpoch++;r.planOpinions={};}
      if(b.city&&!r.candidates.some(c=>c.id===b.city.id))r.candidates.push({...cityInfo(b.city),addedBy:me});
      if((r.finalPlan?.proposalId||null)===(key||null)){r.finalPlan=null;r.tripProgress=null;}
    }
    else if(type==='plan-vote'||type==='confirm'){
      const selected=requirePlan(r,b.proposalId);if(Number(b.version)!==selected.version)throw Error('版本已变化，请重新打开方案。');
      if(type==='confirm'){if(b.confirmed)r.confirmations[me]=true;else delete r.confirmations[me];}
      else (selected.item?.opinions||r.planOpinions)[me]=b.value;
    }
    else if(type==='set-final'){
      const x=requirePlan(r,b.proposalId);if(x.version!==Number(b.version))throw Error('方案已变化。');
      r.finalPlan={proposalId:b.proposalId||null,version:x.version,city:x.plan.city,confirmedAt:stamp(),confirmations:{}};r.tripProgress=null;
    }
    else if(type==='confirm-final'){
      if(!r.finalPlan||r.finalPlan.version!==b.version||r.finalPlan.proposalId!==(b.proposalId||null))throw Error('最终方案已变化。');
      if(b.confirmed)r.finalPlan.confirmations[me]=true;else delete r.finalPlan.confirmations[me];
    }
    else if(type==='set-task'){
      r.checklist=r.checklist.filter(x=>x.id!==b.id);
      if(b.value)r.checklist.push({...clone(b.value),id:b.id,updatedBy:me,updatedAt:stamp()});
    }
    else if(type==='set-trip-stop'||type==='set-trip-booking'){
      const p=requirePlan(r,b.proposalId);if(p.version!==b.version)throw Error('方案已变化。');
      if(!r.tripProgress||r.tripProgress.version!==b.version||r.tripProgress.proposalId!==(b.proposalId||null))r.tripProgress={proposalId:b.proposalId||null,version:b.version,done:{},bookings:{}};
      const key=b.day+':'+b.index;
      if(type==='set-trip-stop'){if(b.done)r.tripProgress.done[key]={by:me,at:stamp()};else delete r.tripProgress.done[key];}
      else {if(b.value)r.tripProgress.bookings[key]=clone(b.value);else delete r.tripProgress.bookings[key];}
    }
    else if(type==='delete-plan'){
      if(r.owner!==me&&b.proposalId!==me)throw Error('只能删除自己的方案。');
      requirePlan(r,b.proposalId);remember(r,b.proposalId);
      if(b.proposalId)delete r.proposals[b.proposalId];else {r.plan=null;r.planOpinions={};r.planVersion++;}
      if((r.finalPlan?.proposalId||null)===(b.proposalId||null)){r.finalPlan=null;r.tripProgress=null;}
    }
    else if(['set-expense','set-estimate','set-stay','edit-plan','apply-ai-plan','restore-plan'].includes(type)){
      const selected=requirePlan(r,b.proposalId);let p=selected.plan;
      if(b.baseVersion!==undefined&&Number(b.baseVersion)!==selected.version)throw Error('方案版本已更新，请重新打开后编辑。');
      if(type==='set-expense'){p.actualExpenses=(p.actualExpenses||[]).filter(x=>x.id!==b.id);if(b.value)p.actualExpenses.push(clone(b.value));}
      else if(type==='set-estimate')p.manualEstimate=clone(b.value);
      else {
        remember(r,b.proposalId);
        if(type==='set-stay')p.confirmedStay=clone(b.stay);
        else if(type==='apply-ai-plan')p=clone(b.plan);
        else if(type==='restore-plan'){
          const old=r._history.find(x=>x.id===b.historyId&&x.proposalId===(b.proposalId||null));if(!old)throw Error('历史版本不存在。');
          p={...clone(old.plan),actualExpenses:p.actualExpenses||[],manualEstimate:p.manualEstimate};
        } else {
          const list=b.kind==='areas'||b.kind==='hotels'?(p.lodging??=lodging())[b.kind]:b.kind==='meals'?p.days[b.day]?.meals:p.days[b.day]?.stops;
          if(!list)throw Error('找不到要编辑的卡片。');
          if(b.kind==='add')list.push(clone(b.value));
          else {const index=list.findIndex(x=>JSON.stringify(x)===JSON.stringify(b.before));if(index<0)throw Error('卡片已变化，请重新打开编辑。');if(b.value)list[index]=clone(b.value);else list.splice(index,1);}
          if(['add','stop'].includes(b.kind))list.sort((a,b)=>a.time.localeCompare(b.time));
        }
        if(selected.item)selected.item.plan=p;else r.plan=p;bump(r,b.proposalId);
      }
    } else throw Error('此操作未包含在本地演示中。');
    r.revision++;r.updatedAt=stamp();write(DB,db);return {room:view(r,token),invite:r._invite};
  }

  function seed() {
    if(read(PREFIX+'seed-v1',false))return;
    const cs=window.TRIP_CITIES;
    const saved=read(PREFIX+'demo-v1',null);
    if(!saved){const p=makePlan(cityInfo(cs[0]),{days:3,date:'',origin:'杭州',arrival:'11:00',departure:'18:00',mood:'吃吃逛逛',budget:1500});write(PREFIX+'demo-v1',{schema:1,data:{tab:'map',saved:cs.slice(0,3).map(c=>c.id),active:p.city,plans:{[p.city]:p},savedPlan:true}});}
    const rooms=read(DB,{}), entries=read(PREFIX+'rooms-v1',{}),token=id(48),r=newRoom('我','周末旅行 · 本地示例',token);
    for(const [i,name] of ['小林（示例）','小周（示例）'].entries()){
      const mid=id(16),c=cs[i+1];r.members.push({id:mid,name,joinedAt:stamp(),availableDates:null,preferences:{...prefs(),budget:1800,days:{min:3,max:5},wants:[cityInfo(c)]}});r.memberNames[mid]=name;
      r.proposals[mid]={plan:makePlan(cityInfo(c),{days:3,date:'',origin:'杭州',arrival:'11:00',departure:'18:00'}),city:cityInfo(c),version:1,epoch:1,opinions:{},updatedAt:stamp()};
    }
    r.members[0].preferences={...prefs(),wants:[cityInfo(cs[0])],budget:1500,days:{min:3,max:5}};
    r.candidates=cs.slice(0,3).map(c=>({...cityInfo(c),addedBy:r.owner}));
    for(const [i,c] of cs.slice(0,3).entries())r.votes[c.id]={[r.members[i].id]:'最想去'};
    r.proposals[r.owner]={plan:makePlan(cityInfo(cs[0]),{days:3,date:'',arrival:'11:00',departure:'18:00',origin:'杭州'}),city:cityInfo(cs[0]),version:1,epoch:1,opinions:{},updatedAt:stamp()};
    r.checklist=[{id:id(24),title:'核实车次与出发时间（示例）',done:false,assignee:r.owner,dueDate:null,updatedBy:r.owner,updatedAt:stamp()}];
    rooms[r.id]=r;entries[r.id]={token,title:r.title,invite:r._invite,name:'我'};write(DB,rooms);write(PREFIX+'rooms-v1',entries);write(PREFIX+'seed-v1',true);
  }
  window.FrontendDemo={itinerary,room,makePlan,seed};
  try{seed();}catch(e){console.warn(e.message);}
})();
