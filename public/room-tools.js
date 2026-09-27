/* Room collaboration tools. Monetary balances use integer cents, never rounded averages. */
window.TripRoomMath = (() => {
 const date = d => new Date(d+'T00:00:00Z');
 const addDays=(d,n)=>{const x=date(d);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
 function availability(members){
  const submitted=members.filter(m=>Array.isArray(m.availableDates)),counts=new Map();
  for(const m of submitted)for(const d of new Set(m.availableDates))counts.set(d,(counts.get(d)||0)+1);
  const ranked=[...counts].map(([date,count])=>({date,count})).sort((a,b)=>b.count-a.count||a.date.localeCompare(b.date));
  const common=submitted.length===members.length?ranked.filter(x=>x.count===members.length).map(x=>x.date).sort():[];
  const runs=[];for(const d of common){const last=runs.at(-1);if(last&&addDays(last.end,1)===d){last.end=d;last.days++}else runs.push({start:d,end:d,days:1})}
  return {submitted:submitted.length,ranked,common,runs};
 }
 function settlement(expenses){
  const balances={},paid={},owed={};let incomplete=0,total=0;
  for(const x of expenses||[]){const ids=[...new Set(x.participantIds||[])].sort(),cents=Math.round(Number(x.totalAmount)*100);
   if(!x.payerId||!ids.length||ids.length!==x.splitCount||!Number.isSafeInteger(cents)||cents<1){incomplete++;continue}
   total+=cents;paid[x.payerId]=(paid[x.payerId]||0)+cents;balances[x.payerId]=(balances[x.payerId]||0)+cents;
   ids.forEach((id,i)=>{const share=Math.floor(cents/ids.length)+(i<cents%ids.length?1:0);owed[id]=(owed[id]||0)+share;balances[id]=(balances[id]||0)-share});
  }
  const debtors=Object.entries(balances).filter(([,n])=>n<0).map(([id,n])=>({id,n:-n})),creditors=Object.entries(balances).filter(([,n])=>n>0).map(([id,n])=>({id,n})),transfers=[];
  let i=0,j=0;while(i<debtors.length&&j<creditors.length){const a=debtors[i],b=creditors[j],cents=Math.min(a.n,b.n);transfers.push({from:a.id,to:b.id,cents});a.n-=cents;b.n-=cents;if(!a.n)i++;if(!b.n)j++}
  return {balances,paid,owed,total,incomplete,transfers};
 }
 return {addDays,availability,settlement};
})();

window.createRoomTools=function(ui){
 'use strict';
 const esc=ui.esc,$=s=>document.querySelector(s),math=TripRoomMath;
 const money=n=>'¥'+(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const key=x=>x.id||'shared',selected=(id)=>ui.entries().find(x=>key(x)===id);
 const name=id=>ui.room().members.find(m=>m.id===id)?.name||ui.room().memberNames?.[id]||'已退出的伙伴';
 const button=(action,label,attrs='',primary=false)=>`<button class="${primary?'primary':'secondary'}" data-room-tool="${action}" ${attrs}>${label}</button>`;
 const err='<p id="room-error" class="form-error" role="alert"></p>';
 let compareIds=[],calendarDraft=null,calendarBefore=null,calendarMonth='',calendarFocus='',taskBefore=null,ledgerId='',todayDay=0,todaySnapshot=null,finalBefore=null,taskSnapshot=[],bookingSnapshot=null,locked=false;
 const clone=x=>JSON.parse(JSON.stringify(x));
 function panel(title,body,footer=''){ui.sheet(title,`<div class="room-tool-panel">${body}${err}</div>`,footer);$('#sheet').classList.add('room-tool-sheet')}
 function finalEntry(){const r=ui.room(),f=r.finalPlan;return f?ui.entries().find(x=>(x.id||null)===f.proposalId):null}
 function finalValid(){const f=ui.room().finalPlan,x=finalEntry();return !!(x&&f&&x.version===f.version)}
 function overview(r){
  const f=r.finalPlan,x=finalEntry(),valid=finalValid(),a=math.availability(r.members),tasks=r.checklist||[],confirmed=valid?r.members.filter(m=>f.confirmations?.[m.id]).length:0;
  return `<section class="room-tools-hub" aria-label="一起准备出发"><div class="room-final-banner"><div><h2>${f?(valid?'最终方案已确定':'最终方案需要重新确认'):'把这次旅行定下来'}</h2><p>${x?`${esc(x.city.name)} · ${x.plan.days.length} 天 · ${esc(x.plan.date||'日期待定')} · ${valid?confirmed+'/'+r.members.length+' 人已确认':'方案已修改，请查看最新内容'}`:f?'原方案已撤回，请重新选择':'比较路线和大家的时间，再确定最终方案。'}</p></div><div class="tool-actions">${x?button('view-final','查看行程'):''}${!r.closed&&(r.me===r.owner)?button('final-picker',f?'重新确定':'确定最终方案','',true):''}${valid&&!r.closed&&r.me!==r.owner?button('confirm-final',f.confirmations?.[r.me]?'取消我的确认':'我确认这份方案','',!f.confirmations?.[r.me]):''}</div></div><div class="room-tool-links">${button('compare',ui.icon('columns-3')+'方案对比')}${button('calendar',ui.icon('calendar-days')+`共同日历 <small>${a.submitted}/${r.members.length} 已填</small>`)}${button('checklist',ui.icon('list-checks')+`出发清单 <small>${tasks.filter(x=>x.done).length}/${tasks.length}</small>`)}${button('ledger',ui.icon('wallet')+'账单结算')}${button('today',ui.icon('navigation')+'旅行当天')}</div></section>`;
 }
 function cost(p){
  return window.TripDetails?.comparisonCost?.(p)||{label:'待补充',missing:['费用尚未填写']};
 }
 // Travel objects carry the real controls: boarding-pass comparisons, a shared planner, and a wallet ledger.
 const memberSymbols=['sun','coffee','camera','compass','leaf','mountain','waves','sailboat','tent','bike','flower-2','star'];
 function memberStamp(id,extra=''){
  const index=Math.max(0,ui.room().members.findIndex(m=>m.id===id)),label=name(id);
  return `<span class="member-stamp stamp-${index%4} ${extra}" title="${esc(label)}" aria-label="${esc(label)}">${ui.icon(memberSymbols[index%memberSymbols.length])}</span>`;
 }
 function compare(open=false){
  const entries=ui.entries();compareIds=compareIds.filter(id=>selected(id));if(open&&!compareIds.length)compareIds=entries.slice(0,2).map(key);
  const chosen=entries.filter(x=>compareIds.includes(key(x))),room=ui.room();
  const note=chosen.length>=2?`${chosen.length} 份方案 · ${new Set(chosen.map(x=>x.plan.date||'')).size>1?'出发日期不同，记得核对大家的时间。':'按日期、节奏和费用，选出大家期待的一程。'}`:'选择 2–3 份方案，放在一起比较。';
  const ticketMascots=['boarding-pass','suitcase','camera'];
  const tickets=chosen.map((x,ticketIndex)=>{
   const p=x.plan,c=cost(p),votes=x.id?room.proposals[x.id]?.opinions:room.planOpinions,places=[...new Set(p.days.flatMap(d=>d.stops.filter(s=>s.kind==='place').map(s=>s.name)))].slice(0,8);
   return `<article class="compare-ticket" aria-label="${esc(x.city.name)}旅行方案"><header class="ticket-owner">${memberStamp(x.id||room.owner)}<strong>${esc(name(x.id||room.owner))} 的方案</strong><small>第 ${x.version} 版</small></header><div class="ticket-route"><div><span class="ticket-destination-label">${ui.icon('plane')}目的地</span><h3>${esc(x.city.name)}</h3></div><img class="ticket-mascot" src="assets/anan-${ticketMascots[ticketIndex]}.png" alt="安安" width="80" height="88"></div><dl class="ticket-facts"><div><dt>出发日期</dt><dd>${esc(p.date||'日期待定')}</dd></div><div><dt>返程日期</dt><dd>${esc(p.date?math.addDays(p.date,p.days.length-1):'日期待定')}</dd></div><div><dt>首日到达</dt><dd>${esc(p.arrival||'待定')}</dd></div><div><dt>末日离开</dt><dd>${esc(p.departure||'待定')}</dd></div><div><dt>旅行天数</dt><dd>${p.days.length} 天</dd></div><div><dt>旅行节奏</dt><dd>${p.pace==='slow'?'松弛一点':'充实一点'}</dd></div></dl><section class="ticket-cost"><div><span>已覆盖费用 / 人</span><strong>${esc(c.label.replace('（已覆盖小计）',''))}</strong></div><p>预算上限 ${p.budget?'¥'+Number(p.budget).toLocaleString():'未设置'}</p><small>${c.missing.length?'尚缺：'+esc(c.missing.join('、')):'参考价及手填预估，非实际支出'}</small></section><section class="ticket-places"><h4>这一路想去</h4><div>${places.map(n=>`<span>${esc(n)}</span>`).join('')||'<span>主要安排待补充</span>'}</div></section><footer class="ticket-stub"><span><strong>${Object.values(votes||{}).filter(v=>v==='agree').length}</strong> 人确认 <small>· ${Object.values(votes||{}).filter(v=>v==='later').length} 人再看看</small></span><span class="ticket-barcode" aria-hidden="true"><svg viewBox="0 0 96 30" focusable="false"><rect x="0" width="2" height="30"/><rect x="4" width="1" height="30"/><rect x="7" width="3" height="30"/><rect x="12" width="1" height="30"/><rect x="15" width="2" height="30"/><rect x="20" width="4" height="30"/><rect x="27" width="1" height="30"/><rect x="30" width="2" height="30"/><rect x="35" width="1" height="30"/><rect x="39" width="4" height="30"/><rect x="46" width="2" height="30"/><rect x="51" width="1" height="30"/><rect x="55" width="3" height="30"/><rect x="60" width="1" height="30"/><rect x="64" width="2" height="30"/><rect x="69" width="4" height="30"/><rect x="76" width="1" height="30"/><rect x="80" width="2" height="30"/><rect x="85" width="3" height="30"/><rect x="91" width="1" height="30"/><rect x="94" width="2" height="30"/></svg></span>${button('compare-view','查看行程 '+ui.icon('arrow-up-right'),`data-id="${esc(key(x))}"`)}</footer></article>`;
  }).join('');
  panel('方案对比',`<div class="compare-intro"><p>${esc(note)}</p><span>最多 3 份</span></div><div class="compare-choices">${entries.map(x=>`<label><input type="checkbox" data-tool-compare="${esc(key(x))}" ${compareIds.includes(key(x))?'checked':''}><span>${esc(x.city.name)} · ${esc(name(x.id||room.owner))}</span></label>`).join('')||'<p>还没有分享的行程，先生成或同步一份方案。</p>'}</div><div class="compare-ticket-grid" style="--ticket-count:${Math.max(1,chosen.length)}">${tickets||'<p class="tool-empty-note">勾选上方方案，开始比较这次旅行。</p>'}</div>`,button('calendar','核对共同日期')+(room.me===room.owner&&!room.closed?button('final-picker','确定最终方案','',true):''));
 }
 function calendar(open=false){
  const r=ui.room(),me=r.members.find(m=>m.id===r.me),a=math.availability(r.members);
  if(open){calendarBefore=clone(me.availableDates??null);calendarDraft=new Set(me.availableDates||[]);calendarFocus=me.availableDates?.[0]||finalEntry()?.plan.date||localDate();calendarMonth=calendarFocus.slice(0,7)}
  const [y,m]=calendarMonth.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(y,m,0)).getUTCDate();
  const available=d=>r.members.filter(x=>(x.id===r.me?[...calendarDraft]:x.availableDates||[]).includes(d));
  const tiles=Array.from({length:days},(_,i)=>{
   const d=calendarMonth+'-'+String(i+1).padStart(2,'0'),people=available(d),all=people.length===r.members.length,pressed=calendarDraft.has(d);
   return `<button data-room-tool="toggle-date" data-id="${d}" class="calendar-date ${pressed?'is-selected':''} ${all?'all-available':''} ${d===localDate()?'is-today':''}" aria-pressed="${pressed}" aria-label="${d}，${people.length} 人有空${people.length?'：'+esc(people.map(x=>x.name).join('、')):''}。${pressed?'取消':'添加'}我的空闲日期" ${r.closed?'disabled':''}><span class="calendar-day-top"><strong>${i+1}</strong>${pressed?ui.icon('check'):''}</span><span class="date-companions" aria-hidden="true">${people.slice(0,3).map((x,j)=>memberStamp(x.id,j===2?'third-stamp':'')).join('')}${people.length>3?`<span class="stamp-more desktop-more">+${people.length-3}</span>`:''}${people.length>2?`<span class="stamp-more mobile-more">+${people.length-2}</span>`:''}</span>${all?'<span class="calendar-day-note">全员</span>':'<span class="calendar-day-note"></span>'}</button>`;
  }).join('');
  const common=a.runs.length?a.runs.map(x=>`<li><strong>${x.start} ${x.days>1?'至 '+x.end:''}</strong><span>连续 ${x.days} 天</span></li>`).join(''):'',focused=available(calendarFocus),dirty=JSON.stringify([...calendarDraft].sort())!==JSON.stringify(calendarBefore||[]);
  panel('共同出行日历',`<div class="planner-layout"><section class="calendar-planner"><header class="planner-month"><div class="planner-month-title"><strong>${String(m).padStart(2,'0')}</strong><div><h3>${y} 年 ${m} 月</h3><span>把大家的空闲，放在同一本日历里</span></div></div><div class="planner-month-controls">${button('month-prev',ui.icon('chevron-left'),'aria-label="上个月"')}${button('month-next',ui.icon('chevron-right'),'aria-label="下个月"')}</div></header><div class="planner-paper"><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(x=>`<span class="weekday">${x}</span>`).join('')}${Array.from({length:offset},()=>'<span class="calendar-blank"></span>').join('')}${tiles}</div><div class="calendar-legend"><span><i class="legend-selected"></i>我的空闲</span><span><i class="legend-common"></i>所有人有空</span><span>小图案代表旅伴</span></div><div class="planner-selection"><p role="status">已选 <strong>${calendarDraft.size}</strong> 天${dirty?' · 尚未保存':''}</p>${!r.closed?button('clear-dates','清空选择'):''}</div></div></section><aside class="calendar-summary planner-sidebar"><section class="planner-members"><h3>这次和谁一起</h3><p>${a.submitted}/${r.members.length} 位已填写 · 点日期选择自己的空闲</p>${r.members.map(x=>`<div class="planner-person">${memberStamp(x.id)}<div><strong>${esc(x.name)}${x.id===r.me?' · 我':''}</strong><small>${Array.isArray(x.availableDates)?(x.availableDates.length?x.availableDates.length+' 天有空':'暂时没有空闲'):'尚未填写'}</small></div></div>`).join('')}</section><section class="planner-focus" aria-live="polite"><h4>${esc(calendarFocus.slice(5).replace('-',' 月 '))} 日 · 谁有空</h4><div>${focused.map(x=>`<span>${memberStamp(x.id)}${esc(x.name)}</span>`).join('')||'<p>这一天还没有伙伴选择。</p>'}</div>${dirty?'<small>你的选择保存后才会同步给伙伴。</small>':''}</section><section class="planner-common"><h3>${ui.icon('calendar-check')}共同日期</h3>${common?`<ul class="date-runs">${common}</ul>`:`<p>${a.submitted<r.members.length?'等大家填写后，再确认共同日期。':'暂时还没有所有人都能出行的日期。'}</p>`}${!common&&a.ranked.length?`<h4>最多人有空</h4><ul class="date-runs">${a.ranked.slice(0,3).map(x=>`<li><strong>${x.date}</strong><span>${x.count}/${r.members.length} 人</span></li>`).join('')}</ul>`:''}<small>共同日期按已保存的选择统计。</small></section></aside></div>`,r.closed?'':button('save-dates','保存我的日期','',true));
 }
 function finalPicker(){
  const r=ui.room();finalBefore=clone(r.finalPlan||null);
  panel('确定最终方案',`<p>确定后会置顶到房间，伙伴可确认这份行程。之后路线有修改，需要重新确定；出发清单会保留，请一并复核。</p><div class="final-options">${ui.entries().map(x=>`<article><div><h3>${esc(x.city.name)} · ${x.plan.days.length} 天</h3><p>${esc(x.plan.date||'日期待定')} · ${esc(name(x.id||r.owner))} · 第 ${x.version} 版</p></div>${button('pick-final','确定这份',`data-id="${esc(key(x))}" data-version="${x.version}"`,true)}</article>`).join('')||'<p>先分享一份旅行方案到房间。</p>'}</div>`);
 }
 function checklist(){
  const r=ui.room(),tasks=r.checklist||[];taskSnapshot=clone(tasks);const done=tasks.filter(x=>x.done).length;
  const body=tasks.length?`<div class="tool-summary"><h3>${done} / ${tasks.length} 项已完成</h3><p>${finalValid()?'按最终行程一起分工准备。':r.finalPlan?'行程已变化，请重新核对清单中的预订和时间。':'可先准备，最终方案确定后再核对。'}</p></div><div class="checklist-rows">${tasks.map(t=>`<article><button class="task-toggle ${t.done?'done':''}" data-room-tool="toggle-task" data-id="${esc(t.id)}" aria-label="${t.done?'标记未完成':'标记完成'}：${esc(t.title)}" aria-pressed="${t.done}" ${r.closed?'disabled':''}>${ui.icon(t.done?'circle-check':'circle')}</button><div><strong class="${t.done?'task-complete':''}">${esc(t.title)}</strong><small>${t.assignee?esc(name(t.assignee))+' 负责':'尚未分工'}</small>${t.dueDate?`<span class="task-due-date">${ui.icon('calendar-days')}计划完成 <time datetime="${esc(t.dueDate)}">${esc(t.dueDate)}</time></span>`:''}</div>${!r.closed?button('edit-task','编辑',`data-id="${esc(t.id)}"`):''}</article>`).join('')}</div>`:`<section class="travel-empty checklist-empty" aria-labelledby="checklist-empty-title"><div class="travel-empty-copy"><span class="travel-empty-kicker">出发前 · 准备便签</span><h3 id="checklist-empty-title">从第一件小事开始</h3><p>${r.closed?'这个房间还没有记录准备事项。':'把要准备的事记下来，可以再分给同行伙伴。'}</p><div class="checklist-suggestions"><span>可以先记</span><span>订住宿</span><span>买车票</span><span>预约景点</span></div></div><div class="checklist-paper" aria-hidden="true"><span>PACKING NOTES</span><i></i><i></i><i></i><img src="assets/anan-suitcase.png" alt="" width="126" height="126"></div></section>`;
  panel('出发清单',body,r.closed?'':button('new-task','添加准备事项','',true));
 }
 function taskEditor(id){
  const r=ui.room();taskBefore=clone((r.checklist||[]).find(t=>t.id===id)||null);
  panel(taskBefore?'编辑准备事项':'添加准备事项',`<form id="room-task-form" class="task-note"><div class="task-note-context"><div><strong>${esc(r.title)}</strong><span>${r.members.length} 位同行伙伴</span></div><img src="assets/anan-suitcase.png" alt="安安" width="72" height="76"></div><label class="field task-title-field"><span>准备什么</span><input name="title" maxlength="100" required placeholder="例如：预约博物馆门票" value="${esc(taskBefore?.title||'')}"></label><div class="task-note-fields"><label class="field"><span>${ui.icon('user-round')}谁来负责</span><select name="assignee"><option value="">暂不分配</option>${r.members.map(m=>`<option value="${esc(m.id)}" ${taskBefore?.assignee===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><div class="field"><label for="task-due-date">${ui.icon('calendar-days')}计划完成日期 <small>选填</small></label><input id="task-due-date" name="dueDate" type="date" min="2000-01-01" max="2099-12-31" value="${esc(taskBefore?.dueDate||'')}" aria-describedby="task-date-hint"><div class="task-date-help"><small id="task-date-hint">还没确定，可以先不选。</small><button type="button" class="text-button" data-room-tool="clear-task-date">清除</button></div></div></div><p class="task-note-sync">${ui.icon('users-round')}保存后，房间里的伙伴都能看到。</p></form>`,button('checklist','返回清单')+button('save-task','保存事项','',true)+(taskBefore?button('delete-task','删除事项'):''));
 }
 function ledger(id){
  const entries=ui.entries();ledgerId=id||ledgerId||key(finalEntry()||entries[0]||{id:''});let x=selected(ledgerId);if(!x){x=entries[0];ledgerId=x?key(x):''}
  const r=ui.room(),s=math.settlement(x?.plan.actualExpenses),ids=[...new Set([...r.members.map(m=>m.id),...Object.keys(s.balances)])],myBalance=s.balances[r.me]||0,expenses=x?.plan.actualExpenses||[];
  const receipts=ids.map(id=>`<article class="member-receipt"><header>${memberStamp(id)}<strong>${esc(name(id))}${id===r.me?' · 我':''}</strong><span class="receipt-state">${s.balances[id]>0?'应收':s.balances[id]<0?'应付':'已平衡'}</span></header><dl><div><dt>已垫付</dt><dd>${money(s.paid[id]||0)}</dd></div><div><dt>应承担</dt><dd>${money(s.owed[id]||0)}</dd></div></dl><footer><span>${s.balances[id]>0?'还应收回':s.balances[id]<0?'还需支付':'当前差额'}</span><strong>${money(Math.abs(s.balances[id]||0))}</strong></footer></article>`).join('');
  panel('共享账单与结算',`${x?`<div class="wallet-plan-picker"><label for="room-ledger-plan">这次旅行的钱包</label><select id="room-ledger-plan">${entries.map(e=>`<option value="${esc(key(e))}" ${key(e)===ledgerId?'selected':''}>${esc(e.city.name)} · ${esc(name(e.id||r.owner))} 的方案</option>`).join('')}</select></div><div class="wallet-layout"><aside class="wallet-column"><section class="travel-wallet" aria-label="旅行钱包"><div class="wallet-insert"><span>已纳入结算的总支出</span><strong class="tool-total">${money(s.total)}</strong><div><span>${expenses.length-s.incomplete} 笔已计入</span><span>${ids.length} 位伙伴</span></div></div><div class="wallet-pocket"><div class="wallet-pocket-heading">${ui.icon('wallet')}<h3>${esc(x.city.name)}的旅行钱包</h3></div><p>${esc(r.title)}</p><div class="wallet-personal"><span>${myBalance>0?'我还应收回':myBalance<0?'我还需支付':'我的待结算差额'}</span><strong>${money(Math.abs(myBalance))}</strong></div><span class="wallet-clasp" aria-hidden="true"></span></div></section>${s.incomplete?`<p class="wallet-missing">${ui.icon('circle-alert')}<span>${s.incomplete} 笔旧记录待补全付款人或分摊伙伴，暂未计入。</span></p>`:''}<section class="wallet-settlement"><h3>这样结算就好</h3>${s.transfers.length?`<ul class="settlement-transfers">${s.transfers.map(t=>`<li><span>${esc(name(t.from))} ${ui.icon('arrow-right')} ${esc(name(t.to))}</span><strong>${money(t.cents)}</strong></li>`).join('')}</ul>`:`<div class="wallet-balanced">${ui.icon(s.total?'circle-check':'receipt-text')}<p>${s.total?'当前已纳入的账目已平衡。':'记下第一笔花费，再一起算清楚。'}</p></div>`}<small>仅计算应收应付，不会发起转账。</small></section></aside><div class="wallet-details"><header class="wallet-section-heading"><h3>每个人的分摊单</h3><span>${ids.length} 位伙伴</span></header><div class="member-receipts">${receipts}</div><section class="wallet-records"><header class="wallet-section-heading"><h3>收好每一笔花费</h3><span>${expenses.length} 笔记录</span></header>${expenses.map(e=>`<div class="tool-expense-row"><span class="expense-record-icon" aria-hidden="true">${ui.icon(({hotel:'bed-double',food:'utensils',activity:'ticket',localTransport:'bus',longTransport:'train-front'})[e.category]||'receipt-text')}</span><div><strong>${esc(e.name)}</strong><small>${e.payerId?esc(name(e.payerId))+' 垫付 · '+e.participantIds.length+' 人分摊':'待补全付款人和参与者'}</small></div><strong>${money(Math.round((e.totalAmount??e.amount)*100))}${e.totalAmount==null?'<small>原人均记录</small>':''}</strong>${!r.closed?button('ledger-edit','编辑',`data-id="${esc(e.id)}"`):''}</div>`).join('')||'<p class="wallet-empty">还没有收据。酒店、车票或一顿好吃的，都可以记在这里。</p>'}</section><p class="wallet-footnote">每份方案单独记账。分摊精确到分，余数按成员编号依次分配。</p></div></div>`:'<p>先分享旅行方案，即可记账和结算。</p>'}`,x&&!r.closed?button('ledger-add',ui.icon('plus')+'记一笔花费','',true):'');
  const settlementSection=$('.wallet-settlement');
  if(settlementSection){
   if(!s.transfers.length)settlementSection.remove();
   else{
    const details=document.createElement('details'),summary=document.createElement('summary');
    details.className='wallet-disclosure';summary.textContent=`查看结算明细 · ${s.transfers.length} 笔`;
    details.append(summary,settlementSection.querySelector('.settlement-transfers'));
    settlementSection.replaceWith(details);
   }
  }
  const recordSection=$('.wallet-records');
  if(recordSection){
   if(!expenses.length)recordSection.remove();
   else{
    const details=document.createElement('details'),summary=document.createElement('summary');
    details.className='wallet-disclosure wallet-records';summary.textContent=`查看花费记录 · ${expenses.length} 笔`;
    details.append(summary,...recordSection.querySelectorAll('.tool-expense-row'));
    recordSection.replaceWith(details);
   }
  }
  $('.wallet-footnote')?.remove();
 }
 function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
 function today(open=false){
  const r=ui.room(),x=finalEntry();if(!x||!finalValid()){
   const stale=Boolean(r.finalPlan),owner=r.me===r.owner&&!r.closed;
   panel('旅行当天',`<section class="travel-empty today-empty" aria-labelledby="today-empty-title"><div class="travel-empty-copy"><span class="travel-empty-kicker">DAY BY DAY · 旅行当天</span><h3 id="today-empty-title">${stale?'方案有更新，路线待确认':'路线卡，还差最后一步'}</h3><p>${stale?'请房间发起人重新确定最新方案，路线才会同步更新。':owner?'确定最终方案后，每天的路线与预约会出现在这里。':'等房间发起人确定方案后，每天的路线与预约会出现在这里。'}</p><div class="today-empty-steps" aria-label="当前进度"><span class="is-current">01 确定方案</span><span class="today-empty-arrow" aria-hidden="true">→</span><span>02 查看当天路线</span></div></div><div class="today-empty-ticket" aria-hidden="true"><div class="today-empty-ticket-head"><span>下一站 · 路线卡</span><span>待启程</span></div><div class="today-empty-route"><span class="today-empty-dot"></span><i></i><span class="today-empty-dot"></span></div><div class="today-empty-ticket-foot"><span>最终方案待确定</span></div><img src="assets/anan-boarding-pass.png" alt="" width="134" height="134"></div></section>`,owner?button('final-picker',stale?'重新确定方案':'去确定方案','',true):'');return}
  if(open){const delta=x.plan.date?Math.floor((Date.parse(localDate()+'T00:00:00Z')-Date.parse(x.plan.date+'T00:00:00Z'))/86400000):0;todayDay=Math.max(0,Math.min(x.plan.days.length-1,delta))}
  todayDay=Math.max(0,Math.min(todayDay,x.plan.days.length-1));todaySnapshot={id:key(x),version:x.version,day:todayDay};
  const progress=r.tripProgress?.version===x.version&&r.tripProgress?.proposalId===(x.id||null)?r.tripProgress.done:{},stops=x.plan.days[todayDay].stops,remaining=stops.map((s,i)=>({...s,index:i})).filter(s=>!progress?.[todayDay+':'+s.index]),next=remaining[0],date=x.plan.date?math.addDays(x.plan.date,todayDay):'';
  panel(x.city.name+' · 旅行当天',`<div class="today-day-picker"><label>查看日期<select id="room-today-day">${x.plan.days.map((d,i)=>`<option value="${i}" ${todayDay===i?'selected':''}>第 ${i+1} 天${x.plan.date?' · '+math.addDays(x.plan.date,i):''}</option>`).join('')}</select></label><span>${date===localDate()?'今天':date?'行程预览':'日期待定'} · 按北京时间</span></div><div class="today-next"><span>${next?'下一站 · 按未完成顺序':'这一天已完成'}</span><h3>${next?esc(next.name):'好好休息，期待下一站'}</h3>${next?`<p>${esc(next.time)} · 预计 ${next.duration} 分钟</p><a class="primary" href="https://uri.amap.com/search?keyword=${encodeURIComponent(next.name)}&city=${encodeURIComponent(x.city.name)}" target="_blank" rel="noopener noreferrer">在高德地图导航</a>`:''}<small>剩余 ${remaining.length} 站 · 已完成 ${stops.length-remaining.length}/${stops.length}</small></div><div class="today-stops">${stops.map((s,i)=>{const done=Boolean(progress?.[todayDay+':'+i]),booking=r.tripProgress?.bookings?.[todayDay+':'+i];return `<article class="${done?'is-done':''}"><time>${esc(s.time)}</time><div><strong>${esc(s.name)}</strong><small>${s.duration} 分钟${s.locked?' · 已保留安排':''}</small>${booking?`<p class="today-booking">预约 ${esc(booking.time)}${booking.note?' · '+esc(booking.note):''}</p>`:''}${s.note?`<p>${esc(s.note)}</p>`:''}${!r.closed?button('booking',booking?'修改预约':'记录预约',`data-index="${i}"`):''}</div>${button('trip-stop',done?'撤销完成':'完成',`data-index="${i}" data-before="${done}" ${r.closed?'disabled':''}`)}</article>`}).join('')}</div><p class="small-note">预约时间由伙伴手动填写，请以门票或订单为准。</p>`,button('today-plan','查看完整行程')+(!r.closed?button('today-adjust','下雨或延误？问问安安','',true):''));
 }
 function booking(index){
  const r=ui.room(),x=selected(todaySnapshot.id),before=r.tripProgress?.bookings?.[todaySnapshot.day+':'+index]||null;
  if(!x||!finalValid())throw Error('行程已变化，请重新打开旅行当天。');
  bookingSnapshot={...todaySnapshot,index,before:clone(before)};
  panel('记录预约 · '+x.plan.days[todaySnapshot.day].stops[index].name,`<form id="room-booking-form"><label class="field"><span>预约时间</span><input name="time" type="time" required value="${esc(before?.time||'')}"></label><label class="field"><span>预约备注 · 选填</span><input name="note" maxlength="120" placeholder="例如：提前 15 分钟到南门集合" value="${esc(before?.note||'')}"></label></form>`,button('today-return','返回当天')+button('save-booking','保存预约','',true)+(before?button('delete-booking','清除预约'):''));
 }
 async function save(body,after,message){const result=await ui.mutate(body);if(result){after?.();ui.toast(message||'已保存并同步给伙伴')}return result}
 async function action(b){
  const a=b.dataset.roomTool,id=b.dataset.id,r=ui.room();if(!r||locked)return;
  locked=true;const connected=b.isConnected;b.disabled=true;
  try{
   if(a==='compare')compare(true);else if(a==='calendar')calendar(true);else if(a==='final-picker')finalPicker();else if(a==='checklist')checklist();else if(a==='ledger')ledger();else if(a==='today')today(true);
   else if(a==='compare-view'){const x=selected(id);if(x)ui.view(x.id,0)}
   else if(a==='view-final'){const x=finalEntry();if(x)ui.view(x.id,0)}
   else if(a==='toggle-date'){calendarFocus=id;if(calendarDraft.has(id))calendarDraft.delete(id);else{if(calendarDraft.size>=90)throw Error('最多选择 90 天。');calendarDraft.add(id)}calendar();document.querySelector('[data-room-tool="toggle-date"][data-id="'+id+'"]')?.focus({preventScroll:true})}
   else if(a==='clear-dates'){calendarDraft.clear();calendar()}
   else if(a==='month-prev'||a==='month-next'){const d=new Date(calendarMonth+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+(a==='month-prev'?-1:1));if(d.getUTCFullYear()<2000||d.getUTCFullYear()>2099)return;calendarMonth=d.toISOString().slice(0,7);calendarFocus=calendarMonth+'-01';calendar()}
   else if(a==='save-dates')await save({type:'set-availability',dates:[...calendarDraft].sort(),before:calendarBefore},()=>calendar(true),'空闲日期已同步，大家的共同日期已更新');
   else if(a==='pick-final')await save({type:'set-final',proposalId:id==='shared'?null:id,version:Number(b.dataset.version),before:finalBefore},null,'最终方案已置顶，请伙伴确认');
   else if(a==='confirm-final')await save({type:'confirm-final',proposalId:r.finalPlan.proposalId,version:r.finalPlan.version,confirmed:!r.finalPlan.confirmations?.[r.me]},null,'你的确认状态已同步');
   else if(a==='new-task'||a==='edit-task')taskEditor(id);
   else if(a==='clear-task-date'){const input=$('#task-due-date');if(input){input.value='';input.focus()}}
   else if(a==='save-task'){const f=$('#room-task-form');if(!f.reportValidity())return;await save({type:'set-task',id:taskBefore?.id||crypto.randomUUID(),before:taskBefore,value:{title:f.elements.title.value,assignee:f.elements.assignee.value||null,dueDate:f.elements.dueDate.value||null,done:taskBefore?.done||false}},checklist)}
   else if(a==='delete-task')await save({type:'set-task',id:taskBefore.id,before:taskBefore,value:null},checklist,'准备事项已删除');
   else if(a==='toggle-task'){const t=taskSnapshot.find(t=>t.id===id);if(t)await save({type:'set-task',id,before:t,value:{...t,done:!t.done}},checklist)}
   else if(a==='ledger-add'||a==='ledger-edit'){const x=selected(ledgerId);if(x)ui.expense(x.id,a==='ledger-edit'?id:'')}
   else if(a==='booking')booking(Number(b.dataset.index));
   else if(a==='today-return')today();
   else if(a==='save-booking'||a==='delete-booking'){const f=$('#room-booking-form');if(a==='save-booking'&&!f.reportValidity())return;const t=bookingSnapshot;await save({type:'set-trip-booking',proposalId:t.id==='shared'?null:t.id,version:t.version,day:t.day,index:t.index,before:t.before,value:a==='delete-booking'?null:{time:f.elements.time.value,note:f.elements.note.value}},()=>today(),'预约信息已同步')}
   else if(a==='trip-stop')await save({type:'set-trip-stop',proposalId:todaySnapshot.id==='shared'?null:todaySnapshot.id,version:todaySnapshot.version,day:todaySnapshot.day,index:Number(b.dataset.index),before:b.dataset.before==='true',done:b.dataset.before!=='true'},()=>today(),'行程进度已同步');
   else if(a==='today-plan'||a==='today-adjust'){const x=selected(todaySnapshot.id);if(x)ui.view(x.id,todayDay,a==='today-adjust'?`请根据这份行程的第 ${todayDay+1} 天帮我处理下雨或交通延误。先问清楚当前地点、已经完成的安排及实际延误情况，再给出可采纳的调整，保留已预约的项目。`:null)}
  }catch(e){const el=$('#room-error');if(el)el.textContent=e.message;ui.toast(e.message)}finally{locked=false;if(connected&&b.isConnected)b.disabled=false}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-room-tool]');if(b){e.preventDefault();action(b)}});
 document.addEventListener('change',e=>{if(e.target.matches('[data-tool-compare]')){const id=e.target.dataset.toolCompare;if(e.target.checked){if(compareIds.length>=3){e.target.checked=false;ui.toast('最多同时比较 3 份方案');return}compareIds.push(id)}else compareIds=compareIds.filter(x=>x!==id);compare()}else if(e.target.id==='room-ledger-plan')ledger(e.target.value);else if(e.target.id==='room-today-day'){todayDay=Number(e.target.value);today()}});
 return {overview,ledger};
};
