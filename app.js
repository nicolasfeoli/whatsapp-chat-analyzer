(function(){
"use strict";
const {crunch,median,fmtDur,startOfDay}=ChatCore;
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n).toLocaleString('en-US');
const pct=x=>(x*100).toFixed(x<0.1?1:0)+'%';
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const p2=n=>String(n).padStart(2,'0');
const dLong=d=>d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();
const dShort=d=>d.getDate()+' '+MON[d.getMonth()];
const hm=d=>p2(d.getHours())+':'+p2(d.getMinutes());

/* ---------- rendering ---------- */
let colorMap=new Map();
const colorOf=n=>colorMap.get(n)||'var(--other)';
const sw=n=>`<i class="sw" style="background:${colorOf(n)}"></i>`;
const nm=n=>`<b>${esc(n)}</b>`;
const tip=$('tip');
function showTip(html,e){tip.innerHTML=html;tip.hidden=false;const r=tip.getBoundingClientRect();let x=e.clientX+14,y=e.clientY+14;if(x+r.width>innerWidth-8)x=e.clientX-r.width-14;if(x<8)x=8;if(y+r.height>innerHeight-8)y=e.clientY-r.height-14;tip.style.left=x+'px';tip.style.top=Math.max(8,y)+'px';}
const hideTip=()=>{tip.hidden=true;};

function hbars(rows){
  const max=Math.max(...rows.map(r=>r.value),1e-9);
  return '<div class="hbars">'+rows.map(r=>`<div class="lab" title="${esc(r.label)}">${esc(r.label)}</div><div class="track"><div class="bar" style="width:${(r.value/max*100).toFixed(1)}%;background:${r.color}"></div></div><div class="val">${esc(r.display)}</div>`).join('')+'</div>';
}
const topN=(map,n)=>[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);

function buckets(A){
  const span=A.spanDays;let mode='day';
  if(span>45)mode='week';if(span>420)mode='month';if(span>365*8)mode='year';
  const floor=d=>{if(mode==='day')return startOfDay(d);if(mode==='week'){const s=startOfDay(d);s.setDate(s.getDate()-(s.getDay()+6)%7);return s;}if(mode==='month')return new Date(d.getFullYear(),d.getMonth(),1);return new Date(d.getFullYear(),0,1);};
  const next=d=>{const n=new Date(d);if(mode==='day')n.setDate(n.getDate()+1);else if(mode==='week')n.setDate(n.getDate()+7);else if(mode==='month')n.setMonth(n.getMonth()+1);else n.setFullYear(n.getFullYear()+1);return n;};
  const series=A.people.slice(0,6).map(p=>p.name);const idx=new Map(series.map((s,i)=>[s,i]));
  const other=A.people.length>6?series.push('Others')-1:-1;
  const list=[];const pos=new Map();
  for(let d=floor(A.first),end=floor(A.last);d<=end;d=next(d)){pos.set(+d,list.length);list.push({d,v:new Array(series.length).fill(0),tot:0});}
  for(const m of A.msgs){const b=list[pos.get(+floor(m.t))];if(!b)continue;const i=idx.has(m.who)?idx.get(m.who):series.length-1;b.v[i]++;b.tot++;}
  const label=d=>mode==='year'?String(d.getFullYear()):mode==='month'?MON[d.getMonth()]+' '+String(d.getFullYear()).slice(2):dShort(d);
  const full=d=>mode==='year'?String(d.getFullYear()):mode==='month'?MON[d.getMonth()]+' '+d.getFullYear():mode==='week'?'Week of '+dLong(d):dLong(d);
  return {mode,series,other,list,label,full};
}
function niceMax(v){const e=Math.pow(10,Math.floor(Math.log10(v||1)));const f=v/e;const step=(f<=2?0.5:f<=5?1:2)*e;return {step,max:Math.ceil(v/step)*step};}

let TL=null;
function drawTimeline(){
  if(!TL)return;const el=$('timeline');if(!el)return;
  const {series,other,list,label,full}=TL;
  const W=Math.max(300,el.clientWidth),H=250,L=44,R=26,T=10,B=24;
  const n=list.length,bw=(W-L-R)/n,gap=bw>6?2:bw>3?1:0,w=Math.max(1,bw-gap);
  const {step,max}=niceMax(Math.max(...list.map(b=>b.tot),1));
  const y=v=>T+(H-T-B)*(1-v/max);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Messages over time by person">`;
  for(let v=0;v<=max+1e-9;v+=step){const yy=y(v);s+=`<line class="grid-l" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="axis-t" x="${L-6}" y="${yy+4}" text-anchor="end">${v>=1000?(v/1000)+'k':v}</text>`;}
  const every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor((W-L-R)/72))));
  list.forEach((b,i)=>{
    const x=L+i*bw+gap/2;let acc=0;const top=b.v.reduce((t,v,j)=>v>0?j:t,-1);
    b.v.forEach((v,j)=>{if(!v)return;const y1=y(acc+v),y0=y(acc);let h=y0-y1;const sg=(acc>0&&h>3&&gap)?1.5:0;h-=sg;acc+=v;
      const col=j===other?'var(--other)':colorOf(series[j]);
      if(j===top){const r=Math.min(3,h,w/2);s+=`<path fill="${col}" d="M${x},${y1+h}V${y1+r}Q${x},${y1} ${x+r},${y1}H${x+w-r}Q${x+w},${y1} ${x+w},${y1+r}V${y1+h}Z"/>`;}
      else s+=`<rect fill="${col}" x="${x}" y="${y1}" width="${w}" height="${Math.max(0.5,h)}"/>`;});
    if(i%every===0)s+=`<text class="axis-t" x="${x+w/2}" y="${H-7}" text-anchor="middle">${label(b.d)}</text>`;
    s+=`<rect class="hover-band" data-i="${i}" x="${L+i*bw}" y="${T}" width="${bw}" height="${H-T-B}"/>`;
  });
  el.innerHTML=s+'</svg>';
  el.querySelectorAll('.hover-band').forEach(r=>{
    r.addEventListener('pointermove',e=>{const b=list[+r.dataset.i];r.classList.add('on');
      showTip(`<div class="t">${full(b.d)}</div>`+series.map((sn,j)=>b.v[j]?`<div class="r"><span><i class="sw" style="background:${j===other?'var(--other)':colorOf(sn)}"></i>${esc(sn)}</span><b>${fmt(b.v[j])}</b></div>`:'').join('')+(series.length>1?`<div class="r"><span>Total</span><b>${fmt(b.tot)}</b></div>`:''),e);});
    r.addEventListener('pointerleave',()=>{r.classList.remove('on');hideTip();});
  });
}

function render(A,title){
  colorMap=new Map(A.people.slice(0,6).map((p,i)=>[p.name,`var(--s${i+1})`]));
  const ppl=A.people,top=ppl.slice(0,8),multi=ppl.length>1;
  /* Android exports only record the minute, so a same-minute reply has a gap of 0. */
  const fmtReply=ms=>A.minuteRes&&ms<60e3?'under 1 min':fmtDur(ms);
  const totalWords=ppl.reduce((s,p)=>s+p.words,0),totalMedia=ppl.reduce((s,p)=>s+p.media,0);
  let h='';
  h+=`<div class="chat-head"><h2>${esc(title)}</h2><div class="chat-meta mono">${dLong(A.first)} to ${dLong(A.last)} · ${fmt(A.spanDays)} day${A.spanDays===1?'':'s'}</div><div class="legend">${ppl.slice(0,6).map(p=>`<span>${sw(p.name)}${esc(p.name)}</span>`).join('')}${ppl.length>6?`<span><i class="sw" style="background:var(--other)"></i>${ppl.length-6} others</span>`:''}</div></div>`;
  h+=`<div class="stats">
    <div class="stat"><b>${fmt(A.total)}</b><span>messages</span></div>
    <div class="stat"><b>${fmt(totalWords)}</b><span>words</span></div>
    <div class="stat"><b>${fmt(A.activeDays)}</b><span>active days of ${fmt(A.spanDays)}</span></div>
    <div class="stat"><b>${(A.total/A.activeDays).toFixed(1)}</b><span>messages per active day</span></div>
    <div class="stat"><b>${fmt(A.convos)}</b><span>conversations</span></div>
    <div class="stat"><b>${fmt(totalMedia)}</b><span>photos, audios and files</span></div></div>`;

  /* insights */
  const ins=[];const p0=ppl[0],p1=ppl[1];
  if(multi){
    let t=`${nm(p0.name)} writes the most: ${pct(p0.n/A.total)} of all messages.`;
    if(ppl.length===2&&p1.n>0)t+=` For every 10 from ${esc(p1.name)}, ${esc(p0.name)} sends ${(p0.n/p1.n*10).toFixed(0)}.`;
    ins.push(t);
  }
  let pk={v:-1};A.heat.forEach((row,d)=>row.forEach((v,hr)=>{if(v>pk.v)pk={v,d,hr};}));
  ins.push(`The chat is most alive on <b>${DAYS[pk.d]}s around ${p2(pk.hr)}:00</b>, with ${fmt(pk.v)} messages in that hour slot.`);
  const dayTot=A.heat.map(r=>r.reduce((a,b)=>a+b,0));const qd=dayTot.indexOf(Math.min(...dayTot));
  ins.push(`The quietest day of the week is <b>${DAYS[qd]}</b>.`);
  if(multi){
    const rep=top.filter(p=>p.gaps.length>=5).map(p=>({p,m:median(p.gaps)})).sort((a,b)=>a.m-b.m);
    if(rep.length>=2)ins.push(`${nm(rep[0].p.name)} replies fastest, typically in <b>${fmtReply(rep[0].m)}</b>. ${nm(rep[rep.length-1].p.name)} takes ${fmtReply(rep[rep.length-1].m)}.`);
    const st=ppl.slice().sort((a,b)=>b.starts-a.starts)[0];
    ins.push(`${nm(st.name)} starts <b>${pct(st.starts/A.convos)}</b> of the conversations (${fmt(st.starts)} of ${fmt(A.convos)}).`);
  }
  if(A.streak.len>1)ins.push(`Longest streak: <b>${A.streak.len} days in a row</b>, from ${dLong(A.streak.from)} to ${dLong(A.streak.to)}.`);
  if(A.silence.ms>864e5)ins.push(`Longest silence: <b>${fmtDur(A.silence.ms)}</b>, between ${dLong(A.silence.from)} and ${dLong(A.silence.to)}.`);
  ins.push(`Busiest day: <b>${dLong(A.busiest.date)}</b> with ${fmt(A.busiest.n)} messages.`);
  const lg=top.filter(p=>p.textN>=10).map(p=>({p,r:p.laughs/p.textN})).sort((a,b)=>b.r-a.r);
  if(lg.length&&lg[0].p.laughs>0)ins.push(`${nm(lg[0].p.name)} laughs the most in writing: ${pct(lg[0].r)} of their messages contain a laugh such as jaja or haha.`);
  const wl=top.filter(p=>p.textN>=10).map(p=>({p,r:p.words/p.textN})).sort((a,b)=>b.r-a.r);
  if(wl.length>=2)ins.push(`${nm(wl[0].p.name)} writes the longest messages, ${wl[0].r.toFixed(1)} words on average against ${wl[wl.length-1].r.toFixed(1)} for ${esc(wl[wl.length-1].p.name)}.`);
  const owl=top.filter(p=>p.n>=20).map(p=>({p,r:p.night/p.n})).sort((a,b)=>b.r-a.r);
  if(owl.length&&owl[0].r>=0.03)ins.push(`${nm(owl[0].p.name)} is the night owl: ${pct(owl[0].r)} of their messages are sent between midnight and 5:00.`);
  const dt=top.filter(p=>p.turns>=5).map(p=>({p,r:p.n/p.turns})).sort((a,b)=>b.r-a.r);
  if(multi&&dt.length)ins.push(`${nm(dt[0].p.name)} sends the most messages in a row before anyone answers: ${dt[0].r.toFixed(1)} per turn.`);
  h+=`<section><div class="sec-head"><h2>What stands out</h2></div><ul class="insights">${ins.map(i=>`<li>${i}</li>`).join('')}</ul></section>`;

  /* people */
  h+=`<section><div class="sec-head"><h2>Who says what</h2><p>Messages sent by each person, then the detail behind them.</p></div>
    ${hbars(top.map(p=>({label:p.name,value:p.n,color:colorOf(p.name),display:fmt(p.n)+'  '+pct(p.n/A.total)})))}
    <div class="tablewrap"><table><thead><tr><th>Person</th><th>Messages</th><th>Words</th><th>Words / msg</th><th>Media</th><th>Emojis</th><th>Questions</th><th>Links</th><th>Deleted</th><th>Top emojis</th></tr></thead><tbody>
    ${top.map(p=>`<tr><td>${sw(p.name)}${esc(p.name)}</td><td>${fmt(p.n)}</td><td>${fmt(p.words)}</td><td>${p.textN?(p.words/p.textN).toFixed(1):'0'}</td><td>${fmt(p.media)}</td><td>${fmt(p.emoji)}</td><td>${fmt(p.q)}</td><td>${fmt(p.links)}</td><td>${fmt(p.deleted)}</td><td>${topN(p.emo,4).map(e=>e[0]).join(' ')}</td></tr>`).join('')}
    </tbody></table></div></section>`;

  /* timeline */
  TL=buckets(A);
  h+=`<section><div class="sec-head"><h2>Activity over time</h2><p>Messages per ${TL.mode}, stacked by person. Hover or tap a bar for the exact counts.</p></div><div id="timeline"></div></section>`;

  /* heatmap */
  const hmax=Math.max(...A.heat.flat(),1);
  let hg='<div class="heat"><div></div>'+Array.from({length:24},(_,i)=>`<div class="hh">${i%3===0?p2(i):''}</div>`).join('');
  A.heat.forEach((row,d)=>{hg+=`<div class="hl">${DAYS[d].slice(0,3)}</div>`+row.map((v,hr)=>`<div class="c" data-d="${d}" data-h="${hr}" data-v="${v}"${v?` style="background:color-mix(in oklab,var(--heat-hi) ${(6+94*v/hmax).toFixed(0)}%,var(--heat-lo))"`:''}></div>`).join('');});
  hg+='</div>';
  h+=`<section><div class="sec-head"><h2>When the chat is alive</h2><p>Each square is one hour of one weekday. A stronger color means more messages.</p></div>${hg}<div class="heat-legend">1<i></i>${fmt(hmax)} messages</div></section>`;

  /* replies */
  if(multi){
    const rep=top.filter(p=>p.gaps.length>=5).map(p=>({label:p.name,value:median(p.gaps),color:colorOf(p.name),display:fmtReply(median(p.gaps))}));
    h+=`<section><div class="sec-head"><h2>Replies and openings</h2></div><div class="two">
      <div><h3>Typical time to reply</h3>${rep.length?hbars(rep)+(A.minuteRes?'<p class="hint">This export records times to the minute, so replies are rounded.</p>':''):'<p class="hint">Not enough back and forth to measure.</p>'}</div>
      <div><h3>Conversations started</h3>${hbars(top.map(p=>({label:p.name,value:p.starts,color:colorOf(p.name),display:fmt(p.starts)})))}</div></div></section>`;
  }

  /* words & emojis */
  const tw=topN(A.wordAll,15),te=topN(A.emoAll,16);
  let sig='';
  if(multi){
    const V=A.wordAll.size;
    for(const p of ppl.slice(0,6)){
      const Wp=[...p.wm.values()].reduce((a,b)=>a+b,0),Wall=[...A.wordAll.values()].reduce((a,b)=>a+b,0),Wr=Wall-Wp;
      const sc=[];for(const [w,c] of p.wm){if(c<4)continue;const cr=(A.wordAll.get(w)||0)-c;const r=((c+1)/(Wp+V))/((cr+1)/(Wr+V));if(r>1.6)sc.push([w,r,c]);}
      sc.sort((a,b)=>b[1]-a[1]);
      if(sc.length)sig+=`<div class="sig-row"><div class="who">${sw(p.name)}${esc(p.name)}</div><div class="chips">${sc.slice(0,7).map(x=>`<span class="chip">${esc(x[0])}<small>${x[2]}</small></span>`).join('')}</div></div>`;
    }
  }
  h+=`<section><div class="sec-head"><h2>Words and emojis</h2><p>Common filler words in English and Spanish are left out.</p></div><div class="two">
    <div><h3>Most used words</h3>${tw.length?hbars(tw.map(([w,c])=>({label:w,value:c,color:'var(--neutral-bar)',display:fmt(c)}))):'<p class="hint">No words found.</p>'}</div>
    <div><h3>Most used emojis</h3>${te.length?`<div class="chips">${te.map(([e,c])=>`<span class="chip">${e}<small>${fmt(c)}</small></span>`).join('')}</div>`:'<p class="hint">No emojis in this chat.</p>'}
    ${sig?`<h3 style="margin-top:10px">Signature words</h3><p class="hint">Words each person uses far more than the others.</p><div class="sig">${sig}</div>`:''}</div></div></section>`;

  /* records */
  const bub=(m,cap)=>`<div><h3 style="margin-bottom:8px">${cap}</h3><div class="bubble"><div class="who">${sw(m.who)}${esc(m.who)}</div><div class="txt">${esc(m.kind==='media'?'(photo, audio or file)':m.text.length>1500?m.text.slice(0,1500)+' …':m.text)}</div><div class="ts">${p2(m.t.getDate())}/${p2(m.t.getMonth()+1)}/${m.t.getFullYear()} ${hm(m.t)}</div></div></div>`;
  h+=`<section><div class="sec-head"><h2>From the record</h2></div><div class="two">${bub(A.msgs[0],'First message in the export')}${A.longest?bub(A.longest,'Longest message, '+fmt(A.longestWords)+' words'):''}</div></section>`;

  $('out').innerHTML=h;
  drawTimeline();
  document.querySelectorAll('.heat .c').forEach(c=>{
    c.addEventListener('pointermove',e=>showTip(`<div class="t">${DAYS[+c.dataset.d]}, ${p2(+c.dataset.h)}:00 to ${p2(+c.dataset.h)}:59</div><div class="r"><span>Messages</span><b>${fmt(+c.dataset.v)}</b></div>`,e));
    c.addEventListener('pointerleave',hideTip);
  });
}
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(drawTimeline,120);});
addEventListener('scroll',hideTip,{passive:true});

/* ---------- loading ---------- */
const MAX_TXT=250*1048576,MAX_ZIP=400*1048576;
const ORDER={dmy:'day/month/year',mdy:'month/day/year',ymd:'year/month/day'};
const mb=n=>Math.round(n/1048576)+' MB';
const plural=(n,one,many)=>fmt(n)+' '+(n===1?one:many);
let state={title:'',order:null};
function status(msg,busy){const s=$('status');s.hidden=!msg;s.textContent=msg||'';s.classList.toggle('busy',!!busy);}
/* Says what was read and what was skipped, so a half-understood file does not pass for a complete one. */
function showReport(d){
  const el=$('report');el.hidden=!d;if(!d)return;
  const r=d.report,n=d.A.total;
  let t='Read '+plural(n,'message','messages')+' from '+plural(r.lines,'line','lines')+' of an '+r.platform+' export, dates as '+ORDER[d.order]+'.';
  if(r.notices)t+=' Skipped '+plural(r.notices,'system notice','system notices')+'.';
  if(r.folded)t+=' '+plural(r.folded,'pasted line was','pasted lines were')+' kept as part of the message quoting them.';
  const bad=r.badDates>0;
  if(bad)t+=' '+plural(r.badDates,'entry has','entries have')+' a date that could not be read'+(r.badDates>r.entries*0.02?', so the numbers below are incomplete.':'.');
  el.textContent=t;el.classList.toggle('warn',bad);
}

/* Parsing and analysis run in a worker so a big chat does not freeze the page. The worker keeps the text for the date-order switch, so the page does not hold a second copy. Browsers refuse workers on pages opened straight from disk; the same code then runs here instead. */
let worker=null,useWorker=typeof Worker!=='undefined',proven=false,kept=null,job=0;
function compute(raw,order){ /* raw null: reuse the text from the last load */
  const id=++job,locale=navigator.language;
  if(raw!==null&&!proven)kept=raw;
  if(!useWorker)return new Promise(res=>setTimeout(()=>{try{res(crunch(raw===null?kept:raw,order,locale));}catch(e){res({error:'Could not analyse that file. Load it again.'});}},30));
  return new Promise(res=>{
    const fallback=()=>{useWorker=false;if(worker){worker.terminate();worker=null;}res(compute(raw===null?kept:raw,order));};
    try{if(!worker)worker=new Worker('worker.js');}catch(e){fallback();return;}
    worker.onmessage=e=>{const d=e.data;if(d.id!==id)return;if(d.stage){status(d.stage,true);return;}proven=true;kept=null;res(d);};
    worker.onerror=e=>{e.preventDefault();if(!proven)fallback();else{worker.terminate();worker=null;proven=false;res({error:'The analysis stopped unexpectedly. Load the file again.'});}};
    worker.postMessage(raw===null?{id,order,locale}:{id,raw,order,locale});
  });
}
function show(d,title,isSample){
  if(d.error){status(d.error);return;}
  if(d.empty){status('No messages found in that file. Check that it is a WhatsApp chat export (.txt or .zip).');return;}
  state={title,order:d.order};status('');
  $('sampleNote').hidden=!isSample;
  $('dateRow').hidden=!d.ambiguous||isSample;
  if(d.ambiguous)$('dateMsg').textContent='Dates in this file could be read two ways. Reading them as '+ORDER[d.order]+'. If the timeline looks wrong:';
  showReport(isSample?null:d);
  render(d.A,title);
}
async function run(raw,title,forceOrder){status('Reading messages …',true);show(await compute(raw,forceOrder),title,false);}
function cleanTitle(name){
  let t=name.replace(/\.(txt|zip)$/i,'').replace(/^(WhatsApp Chat (with|-)\s*|Chat de WhatsApp con\s*)/i,'').trim();
  if(!t||/^_?chat$/i.test(t))t='Your chat';
  return t;
}
async function loadFile(f){
  try{
    status('Opening '+f.name+' …',true);let text;
    if(/\.zip$/i.test(f.name)||f.type==='application/zip'){
      if(!window.JSZip)throw new Error('The zip reader did not load. Unzip the file and load the .txt inside it.');
      if(f.size>MAX_ZIP)throw new Error('That zip is '+mb(f.size)+', too big to open in a browser tab. Export the chat again and choose Without media.');
      const z=await JSZip.loadAsync(f);
      /* An export with media can hold other .txt attachments; take the chat itself. */
      const txts=Object.values(z.files).filter(e=>!e.dir&&/\.txt$/i.test(e.name)&&!/^__MACOSX\//.test(e.name));
      const base=e=>e.name.split('/').pop();
      const entry=txts.find(e=>/^_chat\.txt$/i.test(base(e)))||txts.find(e=>/whatsapp/i.test(base(e)))||txts.find(e=>!e.name.includes('/'))||txts[0];
      if(!entry)throw new Error('That zip has no .txt chat file inside.');
      /* Checked before unpacking, so a small zip cannot expand into more text than the tab can hold. */
      const size=entry._data&&entry._data.uncompressedSize;
      if(size>MAX_TXT)throw new Error('The chat inside that zip is '+mb(size)+' of text, more than this page can handle.');
      text=await entry.async('string');
    }else{
      if(f.size>MAX_TXT)throw new Error('That file is '+mb(f.size)+', more than this page can handle. A chat export without media is usually far smaller.');
      text=await f.text();
    }
    await run(text,cleanTitle(f.name),null);
  }catch(err){status(err.message||'Could not read that file.');}
}
$('pick').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0]);e.target.value='';});
$('swapDates').addEventListener('click',()=>run(null,state.title,state.order==='dmy'?'mdy':'dmy'));
const L=$('loader');
addEventListener('dragover',e=>{e.preventDefault();L.classList.add('drag');});
addEventListener('dragleave',e=>{if(!e.relatedTarget)L.classList.remove('drag');});
addEventListener('drop',e=>{e.preventDefault();L.classList.remove('drag');const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)loadFile(f);});

/* ---------- invented example chat ---------- */
function sampleChat(){
  let s=20260105;const r=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;
  const pick=a=>a[Math.floor(r()*a.length)];
  const A='Marta',B='Diego';
  const shared=['did you see the photos from saturday','what time are you home today','I am leaving the office now','can you pick up bread on the way','the train is delayed again','dinner at my parents on sunday, remember','I booked the tickets for the concert','the plumber is coming tomorrow morning','how was the meeting','call me when you can','running ten minutes late','we need coffee and milk','the neighbour asked about the parking spot again','did you feed the cat','weekend plan: beach or mountain','I found a cheap flight to Lisbon','movie tonight','the package arrived','good morning','good night, sleep well','I will cook tonight','that restaurant was amazing','rain all day here','remind me to pay the electricity bill','ok perfect','sounds good','on my way','thanks for today'];
  const mA=['what do you think?','are you coming to yoga with us?','did you remember the keys?','look at this recipe 😍','I miss you ❤️','so tired today 😴','can we talk later?','guess who I just met 😱','the garden looks beautiful 🌿','do we have plans friday?','love it ❤️','seriously? 😂','I am bringing dessert 🍰','have you eaten?'];
  const mB=['jajaja no way','jajajaja','the match starts at nine ⚽','I will fix the bike this weekend','boss wants the report by friday','honestly no idea','jaja ok','give me five minutes','pizza tonight 🍕','the car needs petrol','deal','jajaja you win','watching the match with Pablo','sure 👍'];
  const lines=[];const end=new Date(2026,9,3);
  for(let d=new Date(2026,0,5);d<=end;d.setDate(d.getDate()+1)){
    const mo=d.getMonth(),dt=d.getDate(),wd=d.getDay();
    if(mo===6&&dt>=12&&dt<=20)continue;
    if(r()>(wd===3?0.55:0.86))continue;
    const big=(mo===4&&dt===16);
    const nc=big?4:1+Math.floor(r()*r()*3);
    for(let c=0;c<nc;c++){
      const hr=pick(wd===0||wd===6?[10,11,12,13,16,18,20,21,22,23,0]:[8,8,9,13,13,14,18,19,20,21,21,22,22,23,0]);
      let t=new Date(d.getFullYear(),mo,dt,hr,Math.floor(r()*60),Math.floor(r()*60));
      let who=r()<0.63?A:B;const n=(big?25:2)+Math.floor(r()*r()*24);
      for(let i=0;i<n;i++){
        let txt;const x=r();
        if(x<0.05)txt='\u200e'+pick(['image omitted','image omitted','audio omitted','sticker omitted','video omitted']);
        else if(x<0.5)txt=pick(shared)+(who===A&&r()<0.25?' '+pick(['😊','❤️','😂','🙈','✨']):'')+(r()<0.12?'?':'');
        else txt=pick(who===A?mA:mB);
        if(r()<0.015)txt='I had a long day so let me tell you everything: first the train was delayed for forty minutes, then the meeting ran over, then I realised I left my lunch at home, and after all that the client finally signed the contract we have been chasing since March, so tonight we celebrate and I am choosing the restaurant';
        lines.push(`[${p2(t.getDate())}/${p2(t.getMonth()+1)}/${String(t.getFullYear()).slice(2)}, ${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}] ${who}: ${txt}`);
        const sw=r()<0.68;if(sw)who=who===A?B:A;
        const mins=sw?(who===B?1+r()*r()*28:0.4+r()*r()*7):0.1+r()*1.2;
        t=new Date(+t+mins*60000);
      }
    }
  }
  return lines.join('\n');
}
show(crunch(sampleChat(),null,navigator.language),'Marta and Diego (example)',true);
})();
