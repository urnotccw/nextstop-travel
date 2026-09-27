(()=>{'use strict';
 const categories={hotel:'住宿',food:'餐饮',activity:'门票与活动',localTransport:'市内交通',longTransport:'往返交通',other:'其他'};
 const esc=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const validMoney=(n,max=100000)=>Number.isFinite(n)&&n>0&&n<=max&&Math.abs(n*100-Math.round(n*100))<1e-6;
 const money=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
 const receiptMoney=n=>Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
 function expenses(plan){return Array.isArray(plan?.actualExpenses)?plan.actualExpenses.filter(x=>x&&categories[x.category]&&validMoney(x.amount)):[]}
 function total(plan){return Math.round(expenses(plan).reduce((sum,x)=>sum+x.amount,0)*100)/100}
 function splitAmount(totalAmount,splitCount){if(!validMoney(totalAmount,1000000)||!Number.isInteger(splitCount)||splitCount<1||splitCount>50)return null;const amount=Math.round(totalAmount/splitCount*100)/100;return validMoney(amount)?amount:null}
 function expenseForm(x,dayCount,peopleCount=1,room=false,roomName=''){
  const count=x?.splitCount??(x?1:Math.max(1,Math.min(50,peopleCount))),totalAmount=x?.totalAmount??x?.amount??'',amount=splitAmount(Number(totalAmount),count),id=room?'room-expense-form':'expense-form',category=x?.category||'hotel',day=x?.day||0;
  const totalLabel=validMoney(Number(totalAmount),1000000)?'¥'+receiptMoney(totalAmount):'—';
  return `<form id="${id}" class="expense-form">
   <div class="expense-form-intro"><p>记下总额，分摊给同行的人。</p><div class="expense-room-chip"><i data-lucide="users-round" aria-hidden="true"></i><span><strong>${esc(room?roomName||'旅行房间':'个人行程')}</strong><small>${room?peopleCount+' 位同行者':'仅自己'}</small></span></div></div>
   <div class="expense-form-layout"><div class="expense-flow">
    <section class="expense-step"><span class="expense-step-number" aria-hidden="true">1</span><div class="expense-step-content"><h3>这笔钱花在哪里？</h3><label class="expense-field"><span>花费项目</span><input name="name" required maxlength="60" placeholder="如酒店订金、午餐" value="${esc(x?.name||'')}"></label><fieldset class="expense-category"><legend>花费类别</legend><div class="expense-category-choices">${Object.entries(categories).map(([key,label])=>`<label class="expense-category-choice"><input type="radio" name="category" value="${key}" ${category===key?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset></div></section>
    <section class="expense-step"><span class="expense-step-number" aria-hidden="true">2</span><div class="expense-step-content"><h3>总共花了多少？ <small>填整笔费用</small></h3><label class="expense-field"><span>总金额 · 元</span><span class="expense-amount-input"><b aria-hidden="true">¥</b><input name="totalAmount" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" required placeholder="0.00" value="${esc(totalAmount)}"></span></label></div></section>
    <section class="expense-step"><span class="expense-step-number" aria-hidden="true">3</span><div class="expense-step-content"><h3>怎么分摊？</h3><div class="expense-split-fields"><div class="expense-field"><label for="${id}-count">分摊人数</label><div class="expense-stepper"><button type="button" data-expense-step="-1" aria-label="减少分摊人数">−</button><input id="${id}-count" name="splitCount" type="number" inputmode="numeric" min="1" max="50" step="1" required value="${esc(count)}" aria-label="分摊人数"><span>人</span><button type="button" data-expense-step="1" aria-label="增加分摊人数">＋</button></div></div><label class="expense-field"><span>记在哪一天</span><select name="day"><option value="0">全程</option>${Array.from({length:dayCount},(_,i)=>`<option value="${i+1}" ${day===i+1?'selected':''}>第 ${i+1} 天</option>`).join('')}</select></label></div><p class="expense-help">${room?'默认按房间同行人数分摊，可以调整。':'按填写的人数平均分摊。'}</p></div></section>
   </div><aside class="expense-ticket" aria-label="花费分摊预览"><img class="expense-mascot" src="assets/anan-siamese-travel.png" alt=""><div class="expense-ticket-head">安安的分摊单</div><div class="expense-ticket-body"><span class="expense-per-label">每人分摊</span><output data-expense-preview role="status" aria-live="polite">${amount===null?'—':'¥'+receiptMoney(amount)}</output><small>这笔花费，人均要付这么多</small><div class="expense-ticket-route"><div><span>总金额</span><strong data-expense-total>${totalLabel}</strong></div><span aria-hidden="true">→</span><div><span>分摊给</span><strong data-expense-count>${count} 人</strong></div></div><div class="expense-ticket-meta"><span>项目</span><strong data-expense-name>${esc(x?.name||'待填写')}</strong><span>类别 · 日期</span><strong><span data-expense-category>${categories[category]}</span> · <span data-expense-day>${day?'第 '+day+' 天':'全程'}</span></strong></div></div><div class="expense-ticket-bottom">自动计算分摊；除不尽时，人均四舍五入，总额仍按原值保存。</div></aside></div>
   <p id="${room?'room-error':'expense-error'}" class="form-error" role="alert"></p></form>`;
 }
 function updateExpensePreview(form){const output=form?.querySelector('[data-expense-preview]');if(!output)return;const total=Number(form.elements.totalAmount.value),count=Number(form.elements.splitCount.value),amount=splitAmount(total,count),category=form.querySelector('input[name="category"]:checked')?.value||'hotel',day=Number(form.elements.day?.value||0);output.textContent=amount===null?'—':'¥'+receiptMoney(amount);const set=(selector,value)=>{const element=form.querySelector(selector);if(element)element.textContent=value};set('[data-expense-total]',validMoney(total,1000000)?'¥'+receiptMoney(total):'—');set('[data-expense-count]',Number.isInteger(count)&&count>=1&&count<=50?count+' 人':'—');set('[data-expense-name]',form.elements.name?.value.trim()||'待填写');set('[data-expense-category]',categories[category]||categories.hotel);set('[data-expense-day]',day?'第 '+day+' 天':'全程')}
 function readExpense(form,id){const d=new FormData(form),totalAmount=Number(d.get('totalAmount')),splitCount=Number(d.get('splitCount')),amount=splitAmount(totalAmount,splitCount),name=String(d.get('name')||'').trim();if(!name||amount===null)throw Error('请填写项目、总金额（最多两位小数）和 1–50 位分摊人数。');return{id:id||crypto.randomUUID(),name,category:String(d.get('category')),totalAmount,splitCount,amount,day:Number(d.get('day'))}}
 const estimateFields=['hotelNightly','localTransportTotal','roundTripTransportTotal'];
 function manualEstimate(value){const result={};for(const key of estimateFields){const n=value?.[key];result[key]=Number.isInteger(n)&&n>=1&&n<=100000?n:null}return result}
 function estimateForm(value){const x=manualEstimate(value);return `<form id="estimate-form"><label class="field"><span>每人每晚住宿 · 元（选填）</span><input name="hotelNightly" type="number" min="1" max="100000" step="1" placeholder="例如 350" value="${x.hotelNightly??''}"></label><div class="fields-two"><label class="field"><span>市内交通全程 · 元（选填）</span><input name="localTransportTotal" type="number" min="1" max="100000" step="1" placeholder="例如 120" value="${x.localTransportTotal??''}"></label><label class="field"><span>往返交通全程 · 元（选填）</span><input name="roundTripTransportTotal" type="number" min="1" max="100000" step="1" placeholder="例如 800" value="${x.roundTripTransportTotal??''}"></label></div><p class="small-note">填写每人承担的预估金额。空白项不计入小计；住宿按行程晚数计算。这些不是已付款记录。</p><p id="estimate-error" class="form-error" role="alert"></p></form>`}
 function readEstimate(form){const d=new FormData(form),out={};for(const key of estimateFields){const raw=String(d.get(key)??'').trim();if(raw===''){out[key]=null;continue}const n=Number(raw);if(!Number.isInteger(n)||n<1||n>100000)throw Error('请填写 1–100000 元的整数金额，未确定的项目可留空。');out[key]=n}return out}
 function expenseMarkup(plan,room=false,readonly=false){
  const items=expenses(plan),spent=total(plan),budget=Number.isFinite(plan.budget)&&plan.budget>0?plan.budget:null;
  const rows=items.map(x=>`<li><span><strong>${esc(x.name)}</strong><small>${categories[x.category]} · ${x.day?'第 '+x.day+' 天':'全程'}${x.totalAmount!=null&&x.splitCount?` · 总共 ¥${money(x.totalAmount)} / ${x.splitCount} 人`:''}</small></span><span>¥${money(x.amount)} / 人</span>${readonly?'':`<button class="text-button" ${room?'data-room-action="edit-expense"':'data-action="edit-expense"'} data-id="${esc(x.id)}" aria-label="编辑${esc(x.name)}花费">编辑</button>`}</li>`).join('');
  return `<section class="expense-ledger" aria-label="实际花费"><div class="expense-heading"><h3>实际花费</h3><strong>¥${money(spent)}<small> / 人</small></strong></div><p>${budget?`人均预算 ¥${money(budget)} · ${spent>budget?'已超出 ¥'+money(Math.round((spent-budget)*100)/100):'剩余 ¥'+money(Math.round((budget-spent)*100)/100)}`:'未设置预算，可先记录真实支出'}</p>${items.length?`<ul class="expense-list">${rows}</ul>`:'<p class="small-note">还没有记录实际支出。参考价不会自动算作已付款。</p>'}${readonly?'':`<button class="secondary" ${room?'data-room-action="add-expense"':'data-action="add-expense"'}>＋ 记一笔花费</button>`}<small>记录以人均金额汇总；每笔总金额和分摊人数可在明细中查看。</small></section>`;
 }
 function diff(current,old){
  const changes=[];
  if(current.days.length!==old.days.length)changes.push(`天数：${current.days.length} → ${old.days.length} 天`);
  if(current.date!==old.date)changes.push(`出发日期：${current.date||'待定'} → ${old.date||'待定'}`);
  if(current.arrival!==old.arrival||current.departure!==old.departure)changes.push(`到达 / 离开：${current.arrival} / ${current.departure} → ${old.arrival} / ${old.departure}`);
  const count=Math.max(current.days.length,old.days.length);
  for(let i=0;i<count;i++){
   const a=current.days[i]?.stops||[],b=old.days[i]?.stops||[];
   if(JSON.stringify(a)!==JSON.stringify(b))changes.push(`第 ${i+1} 天：${a.map(s=>s.name).join('、')||'无安排'} → ${b.map(s=>s.name).join('、')||'无安排'}`);
   if(JSON.stringify(current.days[i]?.meals||null)!==JSON.stringify(old.days[i]?.meals||null))changes.push(`第 ${i+1} 天：用餐建议有变化`);
  }
  if(JSON.stringify(current.confirmedStay||null)!==JSON.stringify(old.confirmedStay||null))changes.push('已确定住宿有变化');
  if(JSON.stringify(current.lodging||null)!==JSON.stringify(old.lodging||null))changes.push('住宿推荐有变化');
  return changes.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('')||'<li>路线相同，其他行程内容有变化</li>';
 }
 if(typeof document!=='undefined'){
  const refresh=event=>{const form=event.target?.closest?.('#expense-form,#room-expense-form');if(form)updateExpensePreview(form)};
  document.addEventListener('input',refresh);
  document.addEventListener('change',refresh);
  document.addEventListener('click',event=>{const button=event.target?.closest?.('[data-expense-step]'),form=button?.closest?.('#expense-form,#room-expense-form');if(!form)return;const input=form.elements.splitCount,current=Number(input.value)||1;input.value=String(Math.max(1,Math.min(50,current+Number(button.dataset.expenseStep))));updateExpensePreview(form)});
 }
 window.TripPlanFeatures={categories,expenses,total,expenseForm,readExpense,splitAmount,updateExpensePreview,expenseMarkup,manualEstimate,estimateForm,readEstimate,diff};
})();
