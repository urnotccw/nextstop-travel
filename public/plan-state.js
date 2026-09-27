(()=>{'use strict';
 const fingerprint=p=>JSON.stringify(p,(key,value)=>key==='status'?undefined:value);
 function budget(p){
  const nights=Math.max(0,p.days.length-1),activities=p.days.flatMap(d=>d.stops).reduce((n,s)=>n+s.cost,0);
  const hotel=p.manual||!nights?0:p.ai?(p.estimates?.hotel||0):nights*180;
  const transport=p.manual?0:p.ai?(p.estimates?.transport||0):p.days.length*40;
  return {activities,hotel,transport,nights,nightly:nights?Math.round(hotel/nights):0,total:activities+hotel+transport};
 }
 function editedStop(previous,values){
  const next={...previous,...values};
  if(!previous||previous.name.trim()!==values.name.trim())delete next.transit;
  return next;
 }
 function regeneration(plan,city,fallback){
  return {mode:'generate',city:{id:city.id,name:city.name,province:city.province||''},options:{days:plan.days.length,date:plan.date||'',arrival:plan.arrival,departure:plan.departure,pace:plan.pace,origin:plan.origin||fallback.origin,budget:plan.budget??null,mood:plan.mood||fallback.mood,preferences:plan.preferences||''},locked:plan.days.flatMap((d,day)=>d.stops.filter(s=>s.locked).map(stop=>({day,stop}))),previousStops:[...new Set(plan.days.flatMap(d=>d.stops.filter(s=>!s.locked).map(s=>s.name)))]};
 }
 const lockedDaysAfter=(plan,count)=>plan.days.slice(count).flatMap((d,i)=>d.stops.some(s=>s.locked)?[count+i+1]:[]);
 function timeConflicts(plan){
  const minutes=value=>/^\d{2}:\d{2}$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
  const problems=[],last=plan.days.length-1;
  for(const index of [...new Set([0,last])])for(const stop of plan.days[index]?.stops||[]){
   const start=minutes(stop.time);if(start===null)continue;
   if(index===0&&start<minutes(plan.arrival)+60)problems.push(`第 1 天「${stop.name}」早于抵达后的接驳时间`);
   if(index===last&&start+Number(stop.duration||0)>minutes(plan.departure)-90)problems.push(`第 ${last+1} 天「${stop.name}」挤占返程预留时间`);
  }
  return problems;
 }
 window.TripPlanState={budget,regeneration,fingerprint,editedStop,lockedDaysAfter,timeConflicts,needsDraftChoice:(local,shared)=>!!local&&fingerprint(local)!==fingerprint(shared)};
})();
