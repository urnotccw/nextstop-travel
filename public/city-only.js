(()=>{'use strict';
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cleanName=value=>String(value??'').replace(/市$/,'').trim();
const normalized=value=>cleanName(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const highlights=window.CITY_HIGHLIGHTS||{};
const curated=new Map((window.TRIP_CITIES||[]).map(city=>[normalized(city.name),city]));
const cities=(window.CITY_DIRECTORY||[]).filter(item=>Array.isArray(item.point)).map(item=>{
  const name=cleanName(item.name),base=curated.get(normalized(name)),highlight=highlights[name];
  return {id:String(item.code),name,province:item.province||'',point:item.point,photo:highlight?.items?.[0]?.src||base?.photo||'',headline:highlight?.headline||base?.headline||'',description:base?.desc||'',tags:base?.tags||[],ideas:base?.experiences||[],source:highlight?.items?.[0]?.source||''};
});
for(const item of window.TRIP_CITIES||[]){if(cities.some(city=>normalized(city.name)===normalized(item.name)))continue;const highlight=highlights[item.name];cities.push({id:item.id,name:item.name,province:'',point:item.point,photo:highlight?.items?.[0]?.src||item.photo||'',headline:highlight?.headline||item.headline,description:item.desc,tags:item.tags||[],ideas:item.experiences||[],source:highlight?.items?.[0]?.source||''})}
const byId=new Map(cities.map(city=>[city.id,city]));
const pictured=cities.filter(city=>city.photo&&highlights[city.name]);
const featured=['长沙','成都','上海','北京','杭州','丽江'].map(name=>cities.find(city=>city.name===name)).filter(Boolean);
const state={saved:new Set(),selected:null,province:'',query:''};
try{const saved=JSON.parse(localStorage.getItem('nextstop-city-only-v1')||'[]');if(Array.isArray(saved))for(const id of saved)if(byId.has(String(id)))state.saved.add(String(id))}catch{}
let toastTimer,mapSvg,mapZoom,mapGroup,markerLayer,mapData;
const persist=()=>{try{localStorage.setItem('nextstop-city-only-v1',JSON.stringify([...state.saved]))}catch{showToast('当前浏览器未允许保存收藏')}};
function showToast(message){const node=$('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2600)}
function cityLabel(city){return `${city.name}${city.province?' · '+city.province:''}`}
function renderResults(){
  const query=normalized(state.query),province=state.province;
  const matches=(query||province?cities:featured).filter(city=>(!province||city.province===province)&&(!query||normalized(city.name).includes(query)||normalized(city.province).includes(query))).slice(0,36);
  $('#result-title').textContent=query?'搜索结果':province?'这个省份的城市':'先认识这几座城';
  $('#result-count').textContent=matches.length+(query||province?' 个结果':' 个推荐');
  $('#city-results').innerHTML=matches.length?matches.map(city=>`<button class="city-result" type="button" data-city-id="${escapeHtml(city.id)}"><span><strong>${escapeHtml(city.name)}</strong><br><small>${escapeHtml(city.province||'城市目的地')}${state.saved.has(city.id)?' · 已收藏':''}</small></span><span class="arrow" aria-hidden="true">↗</span></button>`).join(''):'<p class="city-empty">还没找到这座城市，试试只输入城市名。</p>';
  updateMapMarkers();
}
function renderSaved(){
  $('#saved-count').textContent=state.saved.size;
  const items=[...state.saved].map(id=>byId.get(id)).filter(Boolean);
  $('#saved-cities').innerHTML=items.length?items.map(city=>`<article class="saved-card"><button type="button" data-city-id="${escapeHtml(city.id)}" aria-label="查看${escapeHtml(city.name)}">${city.photo?`<img src="${escapeHtml(city.photo)}" alt="${escapeHtml(city.name)}风景" loading="lazy">`:`<span class="photo-fallback">${escapeHtml(city.name)}</span>`}<span class="saved-card-meta"><strong>${escapeHtml(city.name)}</strong><small>${escapeHtml(city.province||'自选城市')}</small></span></button><button class="remove-saved" type="button" data-remove-id="${escapeHtml(city.id)}" aria-label="从心动城市移除${escapeHtml(city.name)}">×</button></article>`).join(''):'<div class="saved-empty">还没有收藏。点开一座城市，把心动的地方留在这里。</div>';
  updateMapMarkers();
}
function updateMapMarkers(){if(!markerLayer)return;markerLayer.selectAll('.map-marker').classed('saved',d=>state.saved.has(d.id)).classed('selected',d=>state.selected===d.id).style('opacity',d=>state.province&&d.province!==state.province?0.32:1)}
function openCity(id){
  const city=byId.get(String(id));if(!city)return;state.selected=city.id;updateMapMarkers();
  const ideas=city.ideas.length?city.ideas:(highlights[city.name]?.items||[]).slice(0,2).map(item=>item.note).filter(Boolean);
  $('#dialog-content').innerHTML=`${city.photo?`<img class="dialog-photo" src="${escapeHtml(city.photo)}" alt="${escapeHtml(city.name)}风景">`:`<div class="dialog-photo-fallback">${escapeHtml(city.name)}</div>`}<div class="dialog-body"><p class="eyebrow">NEXT STOP / CITY CARD</p><h2 id="dialog-title">${escapeHtml(city.name)}</h2><p>${escapeHtml(city.province||'自选目的地')} · ${escapeHtml(city.headline||'把这座城市，放进下一段旅程。')}</p>${city.description?`<p>${escapeHtml(city.description)}</p>`:''}${city.tags.length?`<div class="dialog-tags">${city.tags.map(tag=>`<span>${escapeHtml(tag)}</span>`).join('')}</div>`:''}${ideas.length?`<div class="dialog-ideas"><strong>到了这里，可以试试</strong><ul>${ideas.slice(0,3).map(idea=>`<li>${escapeHtml(idea)}</li>`).join('')}</ul></div>`:''}<div class="dialog-actions"><button class="primary" type="button" id="dialog-save">${state.saved.has(city.id)?'已加入心动城市 ✓':'♡ 加入心动城市'}</button><button type="button" id="dialog-next">再抽一座</button></div>${city.source?`<a class="dialog-source" href="${escapeHtml(city.source)}" target="_blank" rel="noreferrer">图片来源 ↗</a>`:''}</div>`;
  const dialog=$('#city-dialog');if(!dialog.open)dialog.showModal();
  $('#dialog-save').addEventListener('click',()=>{if(state.saved.has(city.id)){state.saved.delete(city.id);showToast('已从心动城市移除')}else{state.saved.add(city.id);showToast('已加入心动城市')}persist();renderSaved();renderResults();$('#dialog-save').textContent=state.saved.has(city.id)?'已加入心动城市 ✓':'♡ 加入心动城市'});
  $('#dialog-next').addEventListener('click',()=>randomCity());
}
function randomCity(){
  const province=state.province;
  let options=pictured.filter(city=>(!province||city.province===province)&&!state.saved.has(city.id)&&city.id!==state.selected);
  if(!options.length)options=pictured.filter(city=>(!province||city.province===province)&&city.id!==state.selected);
  if(!options.length)options=pictured.filter(city=>!province||city.province===province);
  if(!options.length){showToast('这个省份暂无配图城市，试试搜索');return}
  const random=new Uint32Array(1);crypto.getRandomValues(random);openCity(options[random[0]%options.length].id);
}
async function drawMap(){
  try{const response=await fetch('assets/china.json');if(!response.ok)throw Error('地图资源未加载');mapData=await response.json()}catch{$('#map-stage').insertAdjacentHTML('beforeend','<p class="map-error">地图暂时无法显示，右侧仍可搜索城市。</p>');return}
  const stage=$('#map-stage'),w=stage.clientWidth,h=stage.clientHeight;
  mapSvg=d3.select('#china-map').attr('viewBox',`0 0 ${w} ${h}`);
  const projection=d3.geoMercator().fitExtent([[18,24],[w-20,h-28]],mapData);
  const path=d3.geoPath(projection),colors=['#f2e8bb','#e6ead6','#f7efcd','#e3ead9','#eee7c7'];
  mapGroup=mapSvg.append('g');mapGroup.selectAll('.province-shape').data(mapData.features).join('path').attr('class','province-shape').attr('d',path).attr('fill',(_,i)=>colors[i%colors.length]);
  markerLayer=mapGroup.append('g');
  markerLayer.selectAll('.map-marker').data(pictured).join('g').attr('class','map-marker').attr('tabindex',0).attr('role','button').attr('aria-label',d=>`查看${cityLabel(d)}`).attr('transform',d=>`translate(${projection(d.point).join(',')})`).each(function(d){const marker=d3.select(this);marker.append('rect').attr('x',-10).attr('y',-12).attr('width',24+d.name.length*12).attr('height',25).attr('fill','transparent');marker.append('circle').attr('r',featured.some(item=>item.id===d.id)?5.5:3.5);marker.append('text').attr('x',8).attr('y',4).text(d.name).style('display',featured.some(item=>item.id===d.id)?null:'none')}).on('click',(_,d)=>openCity(d.id)).on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openCity(d.id)}});
  mapZoom=d3.zoom().scaleExtent([1,7]).on('zoom',event=>{mapGroup.attr('transform',event.transform);markerLayer.selectAll('.map-marker text').style('display',d=>event.transform.k>=2||featured.some(item=>item.id===d.id)?null:'none')});mapSvg.call(mapZoom).on('dblclick.zoom',null);updateMapMarkers();
}
const provinces=[...new Set(cities.map(city=>city.province).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));$('#province-filter').insertAdjacentHTML('beforeend',provinces.map(province=>`<option value="${escapeHtml(province)}">${escapeHtml(province)}</option>`).join(''));
$('#city-search').addEventListener('input',event=>{state.query=event.target.value;renderResults()});
$('#province-filter').addEventListener('change',event=>{state.province=event.target.value;renderResults()});
$('#city-results').addEventListener('click',event=>{const button=event.target.closest('[data-city-id]');if(button)openCity(button.dataset.cityId)});
$('#saved-cities').addEventListener('click',event=>{const remove=event.target.closest('[data-remove-id]');if(remove){state.saved.delete(remove.dataset.removeId);persist();renderSaved();renderResults();showToast('已从心动城市移除');return}const button=event.target.closest('[data-city-id]');if(button)openCity(button.dataset.cityId)});
$('#throw-button').addEventListener('click',randomCity);
$('#dialog-close').addEventListener('click',()=>$('#city-dialog').close());
$('#city-dialog').addEventListener('click',event=>{if(event.target===$('#city-dialog'))$('#city-dialog').close()});
$('#zoom-in').addEventListener('click',()=>mapSvg&&mapSvg.transition().duration(240).call(mapZoom.scaleBy,1.5));
$('#zoom-out').addEventListener('click',()=>mapSvg&&mapSvg.transition().duration(240).call(mapZoom.scaleBy,1/1.5));
$('#zoom-reset').addEventListener('click',()=>mapSvg&&mapSvg.transition().duration(240).call(mapZoom.transform,d3.zoomIdentity));
renderResults();renderSaved();drawMap();
const hash=location.hash.match(/^#city=([\w-]+)$/);if(hash&&byId.has(hash[1]))openCity(hash[1]);
})();
