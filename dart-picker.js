/* Shared selection rules; destination data remains the sourced city directory. */
(()=>{'use strict';
 const normalize=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,'').replace(/市$/,'').toLowerCase();
 function isReleased(city){
  const entry=globalThis.window?.CITY_HIGHLIGHTS?.[String(city.name||'').replace(/市$/,'')];
  return !!entry?.items?.length&&entry.items.every(item=>typeof item.src==='string'&&item.src.startsWith('assets/')&&item.author&&item.source&&item.license);
 }
 function eligible(cities,options={},excludeId=null){
  const excluded=new Set(options.excludedProvinces||[]),preferred=new Set(options.preferredProvinces||[]),saved=new Set(options.saved||[]),dismissed=new Set(options.dismissed||[]),seen=new Set();
  return cities.filter(c=>{
   if(!isReleased(c))return false;
   if(!c.province||!Array.isArray(c.point)||c.point.length!==2||!c.point.every(Number.isFinite)||c.id.startsWith('custom-'))return false;
   if(excluded.has(c.province)||(preferred.size&&!preferred.has(c.province))||saved.has(c.id)||dismissed.has(c.id)||c.id===excludeId||normalize(c.name)===normalize(options.origin))return false;
   const key=c.province+'|'+normalize(c.name);if(seen.has(key))return false;seen.add(key);return true;
  });
 }
 function choose(pool,history=[],random=Math.random){
  if(!pool.length)return {city:null,restarted:false};
  const visited=new Set(history),fresh=pool.filter(c=>!visited.has(c.id));const choices=fresh.length?fresh:pool;
  return {city:choices[Math.min(choices.length-1,Math.floor(Math.max(0,random())*choices.length))],restarted:!fresh.length};
 }
 globalThis.TripDart={eligible,choose,isReleased};
})();
