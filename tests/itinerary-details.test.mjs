import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../public/itinerary-details.js',import.meta.url),'utf8'),context);const details=context.window.TripDetails;
test('lodging has safe map links, honest empty states, day-trip handling and text sharing',()=>{
 const p={days:[{},{}],lodging:{areas:[{name:'市中心',reason:'<script>bad</script>',transport:'靠近路线'}],hotels:[{name:'测试酒店',area:'市中心',reason:'适合慢游'}],note:'房价待查询'}};
 const html=details.lodging(p,'成都',true);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes(encodeURIComponent('测试酒店')));assert(html.includes('更新住宿建议'));assert(html.includes('尚未预订'));assert(details.textLodging(p).join('\n').includes('测试酒店'));
 assert(details.lodging({days:[{},{}]},'成都',true).includes('请安安补充住宿建议'));
 assert(!details.lodging({days:[{}],lodging:p.lodging},'成都',true).includes('测试酒店'));
 assert(!details.lodging(p,'成都',false).includes('data-action="lodging"'));
 assert.throws(()=>details.cleanLodging({...p.lodging,hotels:[{name:'不完整'}]}),/酒店/);
});
test('details render safely, exported text includes meals/transit, and transit meals have no wrong-city map link',()=>{
 const s={name:'测试地点',transit:{advice:'<script>bad</script>',nearby:[{type:'bus',name:'公交站'}]}};
 const html=details.transit(s,'测试城市');assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('uri.amap.com/search?keyword='));assert(details.textTransit(s).includes('公交站'));
 const d={stops:[s],meals:['breakfast','lunch','dinner'].map(type=>({type,area:'附近街区',suggestion:'本地小吃',note:'营业待核实'}))};
 const p={arrival:'11:00',departure:'18:00',days:[d]};const meals=details.meals(d,p,0,'测试城市');assert(meals.includes('抵达前或途中参考'));assert(meals.includes('返程或途中参考'));assert.equal((meals.match(/在地图找餐饮/g)||[]).length,1);assert.equal(details.textMeals(d).length,3);assert(details.textMeals(d)[0].startsWith('早饭推荐'));
 assert.equal(details.meals({stops:[]},p,0,'测试城市'),'');assert.equal(details.transit({name:'旧站点'},'测试城市'),'');
});

test('meals merge existing food stops without duplicated times or changed source data',()=>{
 const d={stops:[{name:'上午景点',time:'10:00',kind:'place',cost:50},{name:'午餐小馆',time:'12:00',kind:'food',cost:30},{name:'下午景点',time:'15:00',kind:'place',cost:20}],meals:['breakfast','lunch','dinner'].map(type=>({type,area:'街区',suggestion:'本地小吃',note:'待核实'}))};
 const before=JSON.stringify(d),rows=details.timeline(d);
 assert.deepEqual(Array.from(rows,e=>e.time),['09:00','10:00','12:00','15:00','19:00']);
 assert.equal(rows[2].meal.type,'lunch');assert.equal(rows[2].kind,'meal');assert.equal(rows[2].index,1);assert.equal(rows[3].meal,undefined);assert.equal(rows.filter(e=>e.meal?.type==='lunch').length,1);
 assert.equal(JSON.stringify(d),before);assert.equal(rows.filter(e=>e.stop).reduce((a,e)=>a+e.stop.cost,0),100);
 const text=details.textDay(d).join('\n');assert(text.indexOf('早饭推荐')<text.indexOf('上午景点'));assert(text.indexOf('午饭推荐')<text.indexOf('下午景点'));assert(text.indexOf('晚饭推荐')>text.indexOf('下午景点'));
 const p={days:[d],arrival:'11:00',departure:'18:00'};assert(!details.meal(d.meals[2],p,0,'成都').includes('在地图找餐饮'));
 assert.equal(details.timeline({stops:d.stops}).length,3);
});

test('meal slots avoid activity duration and flag a full day instead of overlapping',()=>{
 const meals=['breakfast','lunch','dinner'].map(type=>({type,area:'街区',suggestion:'小吃',note:''}));
 const rows=details.timeline({stops:[{name:'博物馆',time:'12:10',duration:90,kind:'place'}],meals});
 const lunch=rows.find(e=>e.meal?.type==='lunch');assert.equal(lunch.time,'13:55');assert.equal(lunch.end,'14:40');
 const full=details.timeline({stops:[{name:'全天安排',time:'00:00',duration:1440,kind:'place'}],meals});assert(full.filter(e=>e.kind==='meal').every(e=>e.unscheduled&&e.time===null));
});
