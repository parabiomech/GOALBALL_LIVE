'use strict';
const $ = id => document.getElementById(id);
const STORAGE = 'goalball-live-v4';
const EVENT = {normal:'결과 없음', goal:'골', foulL:'파울 L', foulH:'파울 H', foul:'파울(이전 기록)'};
const HALF={first:'전반',second:'후반'}, TYPE={normal:'일반투구',penalty:'페널티투구'};
const fresh = () => ({schemaVersion:4,half:'first',id:crypto.randomUUID(),registered:false,name:'새 경기',date:new Date().toLocaleDateString('sv-SE'),teams:{A:{name:'왼쪽 팀',players:[]},B:{name:'오른쪽 팀',players:[]}},records:[],demo:false});
let match=fresh(),player=null,start=null,release=null,target=null,editing=null,history=[],noticeTimer,throwType='normal',lastThrowId=null,substitutionMode=false;
const html = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(text){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,4000);}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(match));$('storageStatus').textContent='✓ 자동 저장';}catch{$('storageStatus').textContent='자동 저장 실패';notice('기록 파일을 저장해 주세요. 기기 내 저장에 실패했습니다.');}}
function checkpoint(){history.push(JSON.stringify(match));if(history.length>30)history.shift();}
// Coordinates after clockwise rotation: x=0..180 left to right, y=0..90 top to bench.
function lane(y){return Math.min(5,Math.floor(y/15));}
function rotatePoint(p){return p?{x:Math.round((180-p.y)*10)/10,y:p.x}:null;}
function canvasPoint(clientX,clientY,rect){const x=((clientX-rect.left)/rect.width*860-70)/4,y=((clientY-rect.top)/rect.height*500-60)/4;return x>=0&&x<=180&&y>=0&&y<=90?{x:Math.round(x*10)/10,y:Math.round(y*10)/10}:null;}
function zoneStats(records){const counts=[0,0,0,0,0,0];for(const r of records)counts[lane(r.target.y)]++;return {counts,percent:counts.map(n=>records.length?n/records.length*100:0)};}
function sideOf(team,half){return (team==='A')===(half==='first')?'left':'right';}
function normalizeThrow(r){if(r.normalizedLegacy||sideOf(r.team,r.half)==='left')return {...r};const flip=p=>p?{x:180-p.x,y:p.y}:null;return {...r,start:flip(r.start),release:flip(r.release),target:flip(r.target)};}
function validateRoster(players,registered){
  if(!Array.isArray(players)||players.length>6||(registered&&!players.length))throw Error('선수는 팀별 최대 6명입니다.');
  const nums=new Set(),positions=new Set();let active=0;
  for(const p of players){if(!p||typeof p.number!=='string'||!/^\d{1,2}$/.test(p.number)||nums.has(Number(p.number))||typeof p.name!=='string'||p.name.length>40||(registered&&!p.name.trim())||!['','L','C','R'].includes(p.position)||typeof p.active!=='boolean')throw Error('선수 번호·이름·포지션을 확인하세요. 번호는 중복될 수 없습니다.');nums.add(Number(p.number));if(p.active){active++;if(!p.position||positions.has(p.position))throw Error('출전 선수의 L·C·R 포지션을 각각 선택하세요.');positions.add(p.position);}}
  if(active>3||(registered&&!active))throw Error('각 팀에 출전 선수를 1~3명 체크하세요.');
}
function validate(m){
  if(!m||m.schemaVersion!==4||!Object.hasOwn(HALF,m.half)||typeof m.registered!=='boolean'||typeof m.name!=='string'||m.name.length>80||typeof m.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Array.isArray(m.records)||m.records.length>10000)throw Error('골볼 경기 기록 JSON 파일이 아닙니다.');
  for(const t of ['A','B']){const team=m.teams?.[t];if(typeof team?.name!=='string'||!team.name.trim()||team.name.length>40)throw Error('팀 정보가 올바르지 않습니다.');validateRoster(team.players,m.registered);}
  const ids=new Set();let throws=0;
  for(const r of m.records){if(!r||typeof r.id!=='string'||ids.has(r.id)||!['A','B'].includes(r.team)||!Object.hasOwn(HALF,r.half)||typeof r.recordedAt!=='string')throw Error('기록 정보가 올바르지 않습니다.');ids.add(r.id);
    if(r.kind==='substitution'){if(!Number.isInteger(r.afterThrow)||r.afterThrow!==throws)throw Error('선수교체 투구 순번을 확인하세요.');validateRoster(r.before,true);validateRoster(r.after,true);continue;}
    if(r.kind!=='throw'||typeof r.player!=='string'||!/^\d{1,2}$/.test(r.player)||!Object.hasOwn(TYPE,r.throwType)||!Object.hasOwn(EVENT,r.result))throw Error('투구 정보가 올바르지 않습니다.');throws++;
    for(const [k,p] of Object.entries({start:r.start,release:r.release,target:r.target})){if(k==='start'&&p===null&&r.legacy===true)continue;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>180||p.y<0||p.y>90)throw Error('출발·릴리스·도착 좌표는 180 × 90 코트 안에 있어야 합니다.');}
  }return m;
}
function migrate(m){
  if(m.schemaVersion===4)return validate(m);
  if(![1,2,3].includes(m.schemaVersion)||!Array.isArray(m.records))throw Error('지원하지 않는 파일 형식입니다.');
  if(m.records.some(r=>!r.release||!r.target))throw Error('위치 미확인 기록이 포함되어 있습니다. 원본 파일을 유지해 주세요.');
  const oldPoint=p=>m.schemaVersion===1?{x:p.x*10,y:180-p.y*10}:p;
  const teams={};for(const t of ['A','B']){if(!m.teams?.[t]||!Array.isArray(m.teams[t].players))throw Error('팀 정보가 올바르지 않습니다.');teams[t]={name:m.teams[t].name,players:m.teams[t].players.map(p=>({number:m.schemaVersion===3?p.number:String(p),name:m.schemaVersion===3?p.name:'',position:'',active:false}))};}
  return validate({...m,schemaVersion:4,half:'first',registered:false,teams,records:m.records.map(r=>({...r,kind:'throw',half:'first',throwType:'normal',player:String(r.player),start:m.schemaVersion===3?r.start:null,release:m.schemaVersion===3?r.release:rotatePoint(oldPoint(r.release)),target:m.schemaVersion===3?r.target:rotatePoint(oldPoint(r.target)),legacy:m.schemaVersion<3||r.legacy===true,normalizedLegacy:m.schemaVersion<3||r.legacy===true}))});
}
try{const saved=localStorage.getItem(STORAGE)||localStorage.getItem('goalball-live-v3')||localStorage.getItem('goalball-live-v2');if(saved)match=migrate(JSON.parse(saved));}catch{setTimeout(()=>notice('이전 저장을 읽지 못했습니다. 백업 파일을 불러와 주세요.'),100);}
function athlete(team,number){return match.teams[team].players.find(p=>p.number===number)||{number,name:'미등록 선수'};}
function athleteLabel(r){const p=athlete(r.team,r.player);return `${match.teams[r.team].name} ${p.number}번${p.name?' '+p.name:''}`;}
function reset(keepPlayer=true){if(!keepPlayer)player=null;start=null;release=null;target=null;editing=null;$('cancelEdit').hidden=true;renderDraft();}
function renderPlayers(){
  const parent=$('players');parent.replaceChildren();
  for(const team of (match.half==='first'?['A','B']:['B','A'])){
    const row=document.createElement('div');row.className='team-row';const label=document.createElement('div');label.className='team-row-label';label.textContent=`${sideOf(team,match.half)==='left'?'왼쪽':'오른쪽'} · ${match.teams[team].name}`;row.append(label);
    const buttons=document.createElement('div');buttons.className='player-row';const roster=match.teams[team].players.filter(p=>p.active);
    if(editing&&player?.team===team&&!roster.some(p=>p.number===player.player))roster.push(athlete(team,player.player));
    for(const p of roster){const b=document.createElement('button');b.innerHTML=`<span>${html(p.number)}</span><small>${html(p.name)}${p.position?' · '+p.position:''}</small>`;b.className='player-button';b.dataset.team=team;b.dataset.player=p.number;b.setAttribute('aria-label',`${match.teams[team].name} ${p.number}번 ${p.name}`);b.disabled=!match.registered;b.onclick=()=>{player={team,player:p.number};lastThrowId=null;renderDraft();};buttons.append(b);}
    if(!roster.length){const empty=document.createElement('p');empty.className='recent-empty';empty.textContent='출전 선수를 등록해 주세요.';row.append(empty);}row.append(buttons);parent.append(row);
  }renderDraft();
}
function renderDraft(){
  document.querySelectorAll('.player-button').forEach(b=>{const active=b.dataset.team===player?.team&&b.dataset.player===player?.player;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active);});
  document.querySelectorAll('[data-throw]').forEach(b=>{b.classList.toggle('selected',b.dataset.throw===throwType);b.setAttribute('aria-pressed',b.dataset.throw===throwType);b.disabled=!match.registered;});
  $('substitutionButton').disabled=!match.registered;
  $('clickHint').textContent=!match.registered?'경기를 등록해 주세요':!start?'① 출발 위치를 클릭하세요':!release?'② 릴리스 위치를 클릭하세요':!target?'③ 도착 위치를 클릭하세요':'세 점을 확인하고 투구 기록을 누르세요';
  $('clearPoints').disabled=!(start||release||target);
  $('coordinateLabel').textContent=[['출발',start],['릴리스',release],['도착',target]].map(([label,p])=>`${label} ${p?`${p.x}, ${p.y}`:'—'}`).join(' / ');
  $('draftStatus').textContent=editing?'수정 중 · 위치를 확인하고 투구 기록을 누르세요.':player?`${athleteLabel(player)} · ${TYPE[throwType]}${target?' · 도착 '+(lane(target.y)+1)+'구역':''}`:'출전 선수를 고르고 코트에 세 점을 찍으세요.';
  $('saveThrow').disabled=!(match.registered&&player&&start&&release&&target);
  const latest=match.records.find(r=>r.id===lastThrowId&&r.kind==='throw'),canResult=latest&&!start&&!release&&!target&&!editing;
  document.querySelectorAll('[data-result]').forEach(b=>{b.disabled=!canResult;b.classList.toggle('selected',!!canResult&&latest.result===b.dataset.result);b.setAttribute('aria-pressed',!!canResult&&latest.result===b.dataset.result);});
  $('resultStatus').textContent=canResult?`${athleteLabel(latest)} · ${latest.result==='normal'?'결과 선택 (선택사항)':EVENT[latest.result]} · 같은 버튼을 다시 누르면 해제`:'투구 기록 후 결과를 누르세요.';
  drawCourt($('court'),{kind:'input',start,release,target});
}
$('court').addEventListener('pointerdown',e=>{if(e.button!==0)return;if(!match.registered){openMenu();return;}const p=canvasPoint(e.clientX,e.clientY,$('court').getBoundingClientRect());if(!p)return;lastThrowId=null;if(!start)start=p;else if(!release)release=p;else if(!target)target=p;else{start=p;release=null;target=null;}renderDraft();});
function record(){
  if(!match.registered||!player||!start||!release||!target)return;
  if(!editing&&!athlete(player.team,player.player).active)return;
  checkpoint();const old=match.records.find(r=>r.id===editing),r={id:editing||crypto.randomUUID(),kind:'throw',half:old?.half||match.half,throwType,recordedAt:old?.recordedAt||new Date().toISOString(),...player,start:{...start},release:{...release},target:{...target},result:old?.result||'normal'};
  if(old?.normalizedLegacy)r.normalizedLegacy=true;
  if(editing)match.records[match.records.findIndex(r=>r.id===editing)]=r;else match.records.push(r);
  lastThrowId=r.id;save();reset();render();notice(`${HALF[r.half]} · ${athleteLabel(r)} · ${TYPE[r.throwType]} 기록`);
}
function recordResult(result){const r=match.records.find(r=>r.id===lastThrowId&&r.kind==='throw');if(!r||start||release||target||editing)return;checkpoint();r.result=r.result===result?'normal':result;save();renderDraft();render();notice(`${athleteLabel(r)} · ${EVENT[r.result]}`);}
function lineup(players){return players.filter(p=>p.active).map(p=>`${p.number}번 ${p.name}(${p.position})`).join(', ');}
function substitutionText(r){return `${HALF[r.half]} · ${match.teams[r.team].name} · 전체 ${r.afterThrow}회 투구 후 교체: ${lineup(r.before)} → ${lineup(r.after)}`;}
function render(){
  $('matchTitle').textContent=`${match.demo?'[예시] ':''}${match.date} · ${match.name}`;
  $('halfSelect').value=match.half;const left=match.half==='first'?'A':'B',right=left==='A'?'B':'A';$('sideLabel').textContent=`왼쪽 ${match.teams[left].name} — 오른쪽 ${match.teams[right].name}`;
  $('totalRecords').textContent=match.records.filter(r=>r.kind==='throw').length+' 투구';$('undoButton').disabled=!history.length;renderRecent();if(!$('reportView').hidden)renderReport();
}
function renderRecent(){
  const parent=$('recentRecords');parent.replaceChildren();if(!match.records.length){parent.innerHTML='<div class="recent-empty">첫 투구를 기록해 주세요.</div>';return;}
  const ordinals=new Map();let n=0;for(const r of match.records)if(r.kind==='throw')ordinals.set(r.id,++n);
  [...match.records].reverse().slice(0,4).forEach(r=>{
    if(r.kind==='substitution'){const el=document.createElement('div');el.className='recent-substitution';el.textContent=substitutionText(r);parent.append(el);return;}
    const b=document.createElement('button');b.className='recent-record';b.innerHTML=`<span>${ordinals.get(r.id)}. ${html(athleteLabel(r))}<small>${HALF[r.half]} · ${TYPE[r.throwType]}</small></span><small>${r.start?lane(r.start.y)+1:'—'} → ${lane(r.release.y)+1} → ${lane(r.target.y)+1}</small><span>${r.result==='normal'?'—':EVENT[r.result]}</span>`;
    b.onclick=()=>{if(!match.registered){openMenu();return;}match.half=r.half;lastThrowId=null;player={team:r.team,player:r.player};start=r.start?{...r.start}:null;release={...r.release};target={...r.target};throwType=r.throwType;editing=r.id;$('cancelEdit').hidden=false;renderPlayers();render();};parent.append(b);
  });
}
function showReport(report){$('recordView').hidden=report;$('reportView').hidden=!report;$('recordTab').classList.toggle('selected',!report);$('reportTab').classList.toggle('selected',report);$('recordTab').setAttribute('aria-pressed',!report);$('reportTab').setAttribute('aria-pressed',report);if(report)renderReport();}
function populateFilters(){const team=$('teamFilter'),prior=team.value;team.replaceChildren(new Option('전체',''));for(const t of ['A','B'])team.add(new Option(`${t==='A'?'왼쪽':'오른쪽'} · ${match.teams[t].name}`,t));team.value=prior;populatePlayerFilter();}
function populatePlayerFilter(){const p=$('playerFilter'),prior=p.value;p.replaceChildren(new Option('전체',''));const list=new Map();for(const team of ['A','B'])for(const a of match.teams[team].players)list.set(`${team}:${a.number}`,{team,player:a.number});for(const r of match.records)if(r.kind==='throw')list.set(`${r.team}:${r.player}`,r);for(const [key,r] of list)if(!$('teamFilter').value||r.team===$('teamFilter').value)p.add(new Option(athleteLabel(r),key));p.value=[...p.options].some(o=>o.value===prior)?prior:'';}
function inReportHalf(r){return !$('halfFilter').value||r.half===$('halfFilter').value;}
function filtered(ignorePlayer=false){const event=$('eventFilter').value;return match.records.filter(r=>r.kind==='throw'&&inReportHalf(r)&&(!$('teamFilter').value||r.team===$('teamFilter').value)&&(ignorePlayer||!$('playerFilter').value||`${r.team}:${r.player}`===$('playerFilter').value)&&(!$('courseFilter').value||lane(r.target.y)===Number($('courseFilter').value))&&(!event||(Object.hasOwn(TYPE,event)?r.throwType===event:event==='foul'?r.result.startsWith('foul'):r.result===event))).map(normalizeThrow);}
function heatField(points,sigma=7,w=180,h=90){const field=new Float32Array(w*h);let max=0;for(let j=0;j<h;j++)for(let i=0;i<w;i++){const x=(i+.5)*180/w,y=(j+.5)*90/h;let n=0;for(const p of points){const d=(x-p.x)**2+(y-p.y)**2;if(d<sigma*sigma*32)n+=Math.exp(-d/(2*sigma*sigma));}field[j*w+i]=n;max=Math.max(max,n);}return {field,max,w,h};}
function heatColor(t){const stops=[[50,135,177],[120,196,185],[217,236,148],[255,226,118],[233,92,68]],v=Math.min(1,Math.max(0,t))*4,k=Math.min(3,Math.floor(v)),f=v-k;return stops[k].map((c,i)=>Math.round(c+(stops[k+1][i]-c)*f));}
function renderReport(){
  const rs=filtered(),all=filtered(true),groups=new Map();for(const r of rs){const key=`${r.team}:${r.player}`;if(!groups.has(key))groups.set(key,{team:r.team,player:r.player,records:[]});groups.get(key).records.push(r);}
  const totals=['A','B'].filter(t=>!$('teamFilter').value||$('teamFilter').value===t).map(team=>({team,total:true,records:all.filter(r=>r.team===team)}));
  const ordered=[...groups.values()].sort((a,b)=>a.team.localeCompare(b.team)||Number(a.player)-Number(b.player));const plots=[...totals,...ordered];
  const maps=plots.map(g=>heatField(g.records.flatMap(r=>[r.start,r.release,r.target].filter(Boolean)))),max=Math.max(0,...maps.map(m=>m.max));$('teamFigures').replaceChildren();$('reportFigures').replaceChildren();$('reportEmpty').hidden=!!rs.length;
  renderSubstitutions();
  plots.forEach((g,i)=>{const f=document.createElement('figure');f.className='report-figure';const title=document.createElement('figcaption');title.textContent=g.total?`${match.teams[g.team].name} · 팀 전체 합 (N = ${g.records.length})`:`${athleteLabel(g)} (N = ${g.records.length})`;
    const canvas=document.createElement('canvas');canvas.width=860;canvas.height=500;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${title.textContent}, 출발·릴리스·도착 코스와 위치 빈도`);
    const goals=g.records.filter(r=>r.result==='goal').length,fouls=g.records.filter(r=>r.result.startsWith('foul')).length,summary=document.createElement('p');summary.className='figure-summary';summary.textContent=`골 ${goals} · 파울 ${fouls} (L ${g.records.filter(r=>r.result==='foulL').length} / H ${g.records.filter(r=>r.result==='foulH').length}${g.records.some(r=>r.result==='foul')?' / 미분류 '+g.records.filter(r=>r.result==='foul').length:''}) · 득점률 ${g.records.length?(goals/g.records.length*100).toFixed(1)+'%':'—'}`;
    const zs=zoneStats(g.records),frequency=document.createElement('div');frequency.className='zone-frequency';frequency.innerHTML=`<span>도착 1→6구역</span><div>횟수: ${zs.counts.join(', ')}</div><div>비율(%): ${g.records.length?zs.percent.map(n=>Number(n.toFixed(1))).join(', '):'—'}</div>`;
    f.append(title,canvas,summary,frequency);const legacy=g.records.filter(r=>!r.start).length;if(legacy){const note=document.createElement('p');note.className='figure-summary';note.textContent=`이전 기록 ${legacy}건: 출발 미확인`;f.append(note);}$(g.total?'teamFigures':'reportFigures').append(f);drawCourt(canvas,{kind:'report',team:g.team,records:g.records,heat:maps[i],heatMax:max});
  });
}
function renderSubstitutions(){const rs=match.records.filter(r=>r.kind==='substitution'&&inReportHalf(r)&&(!$('teamFilter').value||r.team===$('teamFilter').value));$('substitutionCount').textContent=rs.length;$('substitutionList').replaceChildren();for(const r of rs){const row=document.createElement('p');row.textContent=substitutionText(r);$('substitutionList').append(row);}}
function drawCourt(canvas,{kind,team='A',start=null,release=null,target=null,records=[],heat=null,heatMax=0}){
  const c=canvas.getContext('2d'),left=70,top=60,scale=4,w=720,h=360,X=x=>left+x*scale,Y=y=>top+y*scale;
  c.clearRect(0,0,860,500);c.fillStyle=kind==='input'?'#e8ebe6':'#fff';c.fillRect(0,0,860,500);
  if(kind==='input'){c.fillStyle='#dca64f';c.fillRect(left,top,w,h);for(let y=0;y<90;y+=2.5){c.strokeStyle=y%5===0?'#b7823530':'#f3d59c25';c.lineWidth=.7;c.beginPath();c.moveTo(X(0),Y(y));c.lineTo(X(180),Y(y));c.stroke();}}
  else{c.fillStyle='#3287b1';c.fillRect(left,top,w,h);if(heat&&heatMax){const layer=document.createElement('canvas');layer.width=heat.w;layer.height=heat.h;const lc=layer.getContext('2d'),im=lc.createImageData(heat.w,heat.h);for(let i=0;i<heat.field.length;i++)im.data.set([...heatColor(heat.field[i]/heatMax),255],i*4);lc.putImageData(im,0,0);c.drawImage(layer,left,top,w,h);}}
  const line=(x1,y1,x2,y2)=>{c.beginPath();c.moveTo(X(x1),Y(y1));c.lineTo(X(x2),Y(y2));c.stroke();};
  c.strokeStyle=kind==='input'?'#fff8ec':'#d9f2f1';c.lineWidth=2;for(const x of [30,60,120,150])line(x,0,x,90);
  for(const end of [0,180]){const d=end===0?1:-1;line(end+d*15,0,end+d*15,15);line(end+d*15,75,end+d*15,90);line(end,45,end+d*5,45);line(end+d*30,45,end+d*25,45);line(end,15,end+d*1.5,15);line(end,75,end+d*1.5,75);}
  c.save();c.setLineDash([3,6]);c.strokeStyle=kind==='input'?'#795a2e55':'#102f3e33';c.lineWidth=.8;for(const y of [15,30,45,60,75])line(0,y,180,y);c.restore();
  c.strokeStyle=kind==='input'?'#f9f5eb':'#16363f';c.lineWidth=2;c.strokeRect(left,top,w,h);
  c.strokeStyle='#1d59ad';c.lineWidth=3.5;line(90,0,90,90);
  for(const end of [0,180]){const d=end===0?-1:1;c.strokeStyle='#315e9855';c.lineWidth=.7;for(let y=0;y<=90;y+=3)line(end,y,end+d*4,y);c.strokeStyle='#1d59ad';c.lineWidth=2;line(end+d*4,0,end+d*4,90);c.fillStyle='#1d59ad';c.fillRect(X(end)-3,top-4,6,h+8);}
  c.font='13px Malgun Gothic, sans-serif';c.textAlign='center';c.fillStyle='#475b51';for(let i=0;i<6;i++){c.fillText(String(i+1),left-24,Y(7.5+i*15)+4);c.fillText(String(i+1),left+w+24,Y(7.5+i*15)+4);}
  const leftTeam=match.half==='first'?'A':'B',rightTeam=leftTeam==='A'?'B':'A';c.fillText(kind==='input'?`왼쪽 · ${match.teams[leftTeam].name}`:match.teams[team].name,left+w*.25,top-24);c.fillText(kind==='input'?`오른쪽 · ${match.teams[rightTeam].name}`:'상대 코트',left+w*.75,top-24);
  c.font='12px Malgun Gothic, sans-serif';c.fillText('벤치 기준 · 위에서 아래로 1 → 6',430,465);c.font='10px Malgun Gothic, sans-serif';c.fillText('18 m / 180',430,489);
  c.save();c.translate(20,240);c.rotate(-Math.PI/2);c.fillText('9 m / 90',0,0);c.restore();
  const path=(a,b,color,dashed=false,width=1.5)=>{if(!a||!b)return;c.save();c.strokeStyle=color;c.lineWidth=width;if(dashed)c.setLineDash([5,4]);line(a.x,a.y,b.x,b.y);c.restore();};
  if(kind==='report'){for(const r of records){path(r.start,r.release,'#37494599',true);path(r.release,r.target,'#102c37bb');for(const p of [r.start,r.release,r.target].filter(Boolean)){c.fillStyle='#102c37bb';c.beginPath();c.arc(X(p.x),Y(p.y),2,0,Math.PI*2);c.fill();}}}
  else{path(start,release,'#4b6659',true,2.5);path(release,target,'#253c34',false,2.5);for(const [p,n] of [[start,'1'],[release,'2'],[target,'3']])if(p){c.beginPath();c.arc(X(p.x),Y(p.y),10,0,Math.PI*2);c.fillStyle='#243c30';c.fill();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();c.fillStyle='#fff';c.font='bold 11px Malgun Gothic';c.fillText(n,X(p.x),Y(p.y)+4);}}
}
async function confirmReplace(){if(!match.records.length)return true;return new Promise(resolve=>{const d=$('replaceDialog');const done=v=>{d.close();resolve(v);};$('replaceYes').onclick=()=>done(true);$('replaceCancel').onclick=()=>done(false);d.oncancel=e=>{e.preventDefault();done(false);};d.showModal();});}
function afterReplace(){history=[];lastThrowId=null;throwType='normal';reset(false);renderPlayers();populateFilters();save();render();}
function rosterFields(team){const container=$('roster'+team);container.replaceChildren();for(let i=0;i<6;i++){const row=document.createElement('div');row.className='roster-slot';const p=match.teams[team].players[i],side=team==='A'?'전반 왼쪽':'전반 오른쪽';row.innerHTML=`<input id="${team}Number${i}" aria-label="${side} 선수 ${i+1} 번호" placeholder="번호" inputmode="numeric" pattern="[0-9]{1,2}" maxlength="2"><input id="${team}Name${i}" aria-label="${side} 선수 ${i+1} 이름" placeholder="이름" maxlength="40"><select id="${team}Position${i}" aria-label="${side} 선수 ${i+1} 포지션"><option value="">—</option><option>L</option><option>C</option><option>R</option></select><input id="${team}Active${i}" type="checkbox" aria-label="${side} 선수 ${i+1} 경기 진행 중">`;container.append(row);$(team+'Number'+i).value=p?.number||'';$(team+'Name'+i).value=p?.name||'';$(team+'Position'+i).value=p?.position||'';$(team+'Active'+i).checked=!!p?.active;}}
function openMenu(substitution=false){substitutionMode=substitution; $('registrationTitle').textContent=substitution?'선수교체':match.registered?'경기 등록 수정':'경기 등록';$('registerButton').textContent=substitution?'선수교체 기록':'등록 후 기록 시작';$('matchDate').value=match.date;$('matchName').value=match.name;for(const t of ['A','B']){$('team'+t).value=match.teams[t].name;rosterFields(t);}if(!$('menuDialog').open)$('menuDialog').showModal();}
function readRoster(team){const list=[];for(let i=0;i<6;i++){const number=$(team+'Number'+i).value.trim(),name=$(team+'Name'+i).value.trim(),position=$(team+'Position'+i).value,active=$(team+'Active'+i).checked;if(!number&&!name){if(active||position)throw Error('선수 번호와 이름을 먼저 입력하세요.');continue;}if(!/^\d{1,2}$/.test(number)||!name)throw Error(`${team==='A'?'전반 왼쪽':'전반 오른쪽'} ${i+1}번 칸의 번호와 이름을 확인하세요.`);list.push({number,name,position,active});}validateRoster(list,true);return list;}
function applyRegistration(next,substitution=false){
  const afterThrow=match.records.filter(r=>r.kind==='throw').length,changes=[];
  if(match.registered)for(const team of ['A','B'])if(JSON.stringify(match.teams[team].players)!==JSON.stringify(next.teams[team].players))changes.push({id:crypto.randomUUID(),kind:'substitution',team,half:match.half,recordedAt:new Date().toISOString(),afterThrow,before:structuredClone(match.teams[team].players),after:structuredClone(next.teams[team].players)});
  if(substitution&&!changes.length)throw Error('출전 체크 또는 선수 포지션을 바꿔 주세요.');
  next.records=[...match.records,...changes];validate(next);checkpoint();match=next;lastThrowId=null;reset(false);renderPlayers();populateFilters();save();render();return changes.length;
}
function download(){const url=URL.createObjectURL(new Blob([JSON.stringify(match,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`goalball-${match.date}${match.demo?'-demo':''}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('기록 파일 저장을 요청했습니다.');}
async function demo(){if(!await confirmReplace())return;match=fresh();match.name='예시 경기';match.demo=true;match.registered=true;for(const t of ['A','B'])match.teams[t].players=Array.from({length:6},(_,i)=>({number:String(i+1),name:['김민준','이서진','박지우','정하늘','최도윤','윤수현'][i],position:i<3?['L','C','R'][i]:'',active:i<3}));let seed=17;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<72;i++){const team=i%2?'B':'A',half=i<36?'first':'second',p=match.teams[team].players[Math.floor(i/2)%3],sy=7.5+Math.floor(i/2)%6*15+(rand()-.5)*10,ty=7.5+Math.floor(rand()*6)*15+(rand()-.5)*9;const left=sideOf(team,half)==='left',x=left?12:168,d=left?1:-1;match.records.push({id:crypto.randomUUID(),kind:'throw',half,throwType:i%9===0?'penalty':'normal',team,player:p.number,recordedAt:new Date().toISOString(),start:{x,y:sy},release:{x:x+d*(5+rand()*12),y:Math.max(0,Math.min(90,sy+(rand()-.5)*12))},target:{x:left?170+rand()*10:rand()*10,y:ty},result:i%11===0?'goal':i%17===0?'foulL':i%23===0?'foulH':'normal'});}afterReplace();$('menuDialog').close();showReport(true);}
$('recordTab').onclick=()=>showReport(false);$('reportTab').onclick=()=>showReport(true);
$('halfSelect').onchange=()=>{checkpoint();match.half=$('halfSelect').value;lastThrowId=null;reset(false);renderPlayers();save();render();notice(`${HALF[match.half]} · 코트 위치를 바꿨습니다.`);};
document.querySelectorAll('[data-throw]').forEach(b=>b.onclick=()=>{throwType=b.dataset.throw;renderDraft();});$('substitutionButton').onclick=()=>openMenu(true);$('saveThrow').onclick=record;document.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>recordResult(b.dataset.result));
$('clearPoints').onclick=()=>{start=null;release=null;target=null;renderDraft();};$('cancelEdit').onclick=()=>{reset(false);renderPlayers();};
$('undoButton').onclick=()=>{if(!history.length)return;match=JSON.parse(history.pop());lastThrowId=null;reset(false);renderPlayers();populateFilters();save();render();notice('직전 변경을 되돌렸습니다.');};
for(const id of ['halfFilter','teamFilter','playerFilter','courseFilter','eventFilter'])$(id).onchange=()=>{if(id==='teamFilter')populatePlayerFilter();renderReport();};$('reportView').querySelector('form').onsubmit=e=>e.preventDefault();$('menuButton').onclick=()=>openMenu();$('closeMenu').onclick=()=>$('menuDialog').close();
$('settingsForm').onsubmit=e=>{e.preventDefault();try{const a=readRoster('A'),b=readRoster('B'),next={...match,registered:true,date:$('matchDate').value,name:$('matchName').value.trim()||'새 경기',teams:{A:{name:$('teamA').value.trim()||'왼쪽 팀',players:a},B:{name:$('teamB').value.trim()||'오른쪽 팀',players:b}}};const changes=applyRegistration(next,substitutionMode);$('menuDialog').close();notice(changes?'선수교체와 투구 시점을 기록했습니다.':'경기와 출전 선수를 등록했습니다.');}catch(e){notice(e.message);}};
$('exportButton').onclick=download;$('importButton').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>10*1024*1024)throw Error('10MB 이하 JSON 파일을 선택하세요.');const next=migrate(JSON.parse(await f.text()));if(await confirmReplace()){match=next;afterReplace();$('menuDialog').close();if(!match.registered)openMenu();notice('기록을 불러왔습니다. 이전 기록은 전반으로 유지하며 출전 체크와 포지션을 등록해 주세요.');}}catch(e){notice(e.message||'파일을 읽지 못했습니다.');}finally{e.target.value='';}};
$('newButton').onclick=async()=>{if(!await confirmReplace())return;match=fresh();afterReplace();$('menuDialog').close();showReport(false);openMenu();};$('demoButton').onclick=demo;
document.addEventListener('keydown',e=>{if($('recordView').hidden||$('menuDialog').open||$('replaceDialog').open||e.repeat||e.ctrlKey||e.altKey||e.metaKey||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;const key=e.key.toLowerCase();if(key==='escape'){start=null;release=null;target=null;renderDraft();}if(['g','l','h'].includes(key)){e.preventDefault();recordResult({g:'goal',l:'foulL',h:'foulH'}[key]);}if(key==='enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();record();}});

renderPlayers();populateFilters();render();if(!match.registered)openMenu();

