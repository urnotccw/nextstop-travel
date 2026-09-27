(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new Map(),positions=new Map();let catalog;
const safeLink=s=>{try{const u=new URL(s,location.origin);return u.protocol==='https:'||u.origin===location.origin?u.href:'#'}catch{return '#'}};
async function load(city,refresh=false){
  const key=JSON.stringify([city.name,city.point]);if(!refresh&&cache.has(key))return cache.get(key);
  const bundled=window.CITY_HIGHLIGHTS?.[city.name.replace(/市$/,'')];if(bundled){cache.set(key,bundled);return bundled}
  catalog??=fetch('assets/city-highlights.json').then(r=>{if(!r.ok)throw Error();return r.json()}).catch(()=>{catalog=null;return {}});
  const local=(await catalog)[city.name.replace(/市$/,'')];if(local){cache.set(key,local);return local}
  const q=new URLSearchParams({name:city.name});if(city.point){q.set('lng',city.point[0]);q.set('lat',city.point[1])}
  const r=await fetch('/api/city-highlights?'+q,{signal:AbortSignal.timeout(19000)});if(!r.ok)throw Error();
  const data=await r.json();if(data.items?.length)cache.set(key,data);return data;
}
async function mount(city,root,refresh=false){
  if(!root)return;
  root.innerHTML='<div class="highlight-heading"><h3>先看一眼，心动再出发</h3></div><div class="highlight-loading" role="status">正在找 '+esc(city.name)+' 的城市照片…</div>';
  const token={};root._highlightToken=token;
  try{
    const data=await load(city,refresh);if(!root.isConnected||root._highlightToken!==token)return;
    const items=(data.items||[]).slice(0,3);
    if(!items.length){empty('还没有匹配到这座城市的实景照片。');return}
    let index=Math.min(positions.get(city.name)||0,items.length-1);
    root.innerHTML='<div class="highlight-heading"><h3>'+(data.headline?esc(data.headline):'先看一眼，心动再出发')+'</h3><div class="highlight-controls"><button type="button" class="highlight-prev" aria-label="上一张照片" '+(items.length===1?'hidden':'')+'>←</button><span class="highlight-count" aria-live="polite"></span><button type="button" class="highlight-next" aria-label="下一张照片" '+(items.length===1?'hidden':'')+'>→</button></div></div><div class="highlight-stage" tabindex="0" aria-label="城市照片，可用左右方向键切换"></div>';
    const stage=root.querySelector('.highlight-stage');
    function render(){
      const item=items[index];root.querySelector('.highlight-count').textContent=(index+1)+' / '+items.length;
      stage.innerHTML='<figure class="highlight-figure"><div class="highlight-image"><img class="'+(item.fit==='contain'?'photo-contain':'')+'" src="'+esc(safeLink(item.src))+'" alt="'+esc(item.title)+'实景" decoding="async" width="960" height="640"><div class="highlight-image-error" hidden><p>这张照片暂时没加载出来</p><button type="button" class="text-button">重新加载图片</button></div></div><figcaption><h4>'+esc(item.title)+'</h4><p>'+esc(item.note)+'</p><a class="highlight-credit" href="'+esc(safeLink(item.source))+'" target="_blank" rel="noopener noreferrer">摄影 / '+esc(item.author)+' · '+esc(item.license)+' ↗</a></figcaption></figure>';
      const img=stage.querySelector('img'),error=stage.querySelector('.highlight-image-error');
      img.addEventListener('error',()=>{img.hidden=true;error.hidden=false});
      error.querySelector('button').onclick=()=>{error.hidden=true;img.hidden=false;img.src=safeLink(item.src)+(item.src.includes('?')?'&':'?')+'retry='+Date.now()};
      root.querySelector('.highlight-prev').disabled=index===0;root.querySelector('.highlight-next').disabled=index===items.length-1;
    }
    const move=n=>{index=Math.max(0,Math.min(items.length-1,n));positions.set(city.name,index);render()};
    root.querySelector('.highlight-prev').onclick=()=>move(index-1);root.querySelector('.highlight-next').onclick=()=>move(index+1);
    stage.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(index+(e.key==='ArrowRight'?1:-1))}};
    let start=null;stage.addEventListener('touchstart',e=>{start=[e.changedTouches[0].clientX,e.changedTouches[0].clientY]},{passive:true});stage.addEventListener('touchend',e=>{if(!start)return;const dx=e.changedTouches[0].clientX-start[0],dy=e.changedTouches[0].clientY-start[1];if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)move(index+(dx<0?1:-1));start=null},{passive:true});
    render();
  }catch{if(root.isConnected&&root._highlightToken===token)empty('城市图片暂时连不上，仍可加入候选或请安安推荐行程。')}
  function empty(message){root.innerHTML='<div class="highlight-unavailable" role="status"><p>'+esc(message)+'</p><button type="button" class="text-button">重新找图片</button></div>';root.querySelector('button').onclick=()=>mount(city,root,true)}
}
window.CityHighlights={mount};
})();
