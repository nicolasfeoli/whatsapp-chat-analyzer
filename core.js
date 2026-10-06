/* Parsing and analysis. No DOM access: this file runs in the page, in worker.js and in the Node tests. */
(function(root){
"use strict";
function fmtDur(ms){const s=ms/1000;if(s<60)return Math.max(1,Math.round(s))+' s';const m=s/60;if(m<60)return Math.round(m)+' min';const h=m/60;if(h<48)return (h<10?h.toFixed(1):Math.round(h))+' h';return Math.round(h/24)+' days';}
const median=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;};

/* ---------- parsing ---------- */
/* Invisible characters are written as escapes on purpose: \u200e is the left-to-right mark iPhone exports put in front of anything that is not typed text. */
const LINE=/^\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})[,\u060c]?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(?:([ap])\.?\s?m\.?|([\u0635\u0645]))?\s*(?:\]|\s-)\s*(.*)$/i;
const INVIS=/[\u200e\u200f\u202a-\u202e\ufeff]/g,INVIS_KEEP_LRM=/[\u200f\u202a-\u202e\ufeff]/g,SPACES=/[\u00a0\u202f]/g;
const DIGITS=/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g;
const asciiDigits=s=>s.replace(DIGITS,c=>{const n=c.charCodeAt(0);return String(n-(n<0x6f0?0x660:n<0x966?0x6f0:0x966));});
const MEDIA=[
  /^<[^<>\n]{1,60}>$/, /* Android placeholder in any language: <Media omitted>, <Multimedia omitido> */
  /<(?:attached|adjunto|anexado|anhang|pi[eè]ce jointe|allegato)\s?:\s*[^>]+>/i,
  /\((?:file attached|archivo adjunto|arquivo anexado|datei angeh[aä]ngt|fichier joint|file allegato)\)\s*$/i,
  /^(?:poll|encuesta|enquete|umfrage|sondage|sondaggio):$/i,
  /^(?:location|ubicaci[oó]n|localiza[cç][aã]o|standort|localisation|posizione)\s?: https?:\/\/\S+$/i
];
/* iPhone placeholders (image omitted, GIF omitido). Only trusted when the line carries the left-to-right mark, so typed text ending in "omitted" still counts as text. */
const IOS_MEDIA=/^[\p{L} ]{2,40}\s(?:omitted|omitid[oa]|weggelassen|omise?s?|omess[aoi]|ocult[oa]|ocultad[oa])$/iu;
const DELETED=/^(?:this message was deleted|you deleted this message|se elimin[oó] este mensaje|eliminaste este mensaje|este mensaje fue eliminado|mensagem apagada|esta mensagem foi apagada|voc[eê] apagou esta mensagem|diese nachricht wurde gel[oö]scht|du hast diese nachricht gel[oö]scht|ce message a [eé]t[eé] supprim[eé]|vous avez supprim[eé] ce message|questo messaggio [eè] stato eliminato|hai eliminato questo messaggio)\.?$/i;
const SYSTEXT=/(end-to-end encrypted|cifrad[oa]s? de extremo a extremo|security code|c[oó]digo de seguridad|missed (voice|video) call|llamada (de voz |de video )?perdida)/i;
/* "Bob changed the group name to "X: y"" parses as a sender. The verb must follow a name and be followed by more text, so a contact called "Left Shark" is kept. */
const SYSNAME=/\S\s+(?:changed|added|removed|left|joined|created|deleted|cambi[oó]|a[ñn]adi[oó]|elimin[oó]|sali[oó]|cre[oó]|se uni[oó])\s+\S|ahora es admin|now an admin/i;
const EDITED=/\s*<(this message was edited|se edit[oó] este mensaje\.?)>\s*$/i;

function parseChat(raw,forceOrder,locale){
  const recs=[];let cur=null,hasSeconds=false;
  const report={lines:0,entries:0,notices:0,badDates:0,folded:0,platform:''};
  for(const line of raw.split(/\r?\n/)){
    const clean=line.replace(INVIS,'').replace(SPACES,' ');
    if(clean.trim())report.lines++;
    const m=LINE.exec(asciiDigits(clean));
    if(m){
      cur=null;report.entries++;
      if(!report.platform)report.platform=clean[0]==='['?'iPhone':'Android';
      const rest=clean.slice(clean.length-m[9].length);const i=rest.indexOf(': ');
      if(i<1){report.notices++;continue;}
      const who=rest.slice(0,i).trim(),text=rest.slice(i+2),body=text.trim();
      if(who.length>50||SYSNAME.test(who)){report.notices++;continue;}
      const marked=line.replace(INVIS_KEEP_LRM,'').replace(SPACES,' ').includes(who+': \u200e');
      let kind='text';
      if(MEDIA.some(r=>r.test(body))||(marked&&IOS_MEDIA.test(body))||(body==='null'&&clean[0]!=='['))kind='media';
      else if(DELETED.test(body))kind='deleted';
      else if(marked||SYSTEXT.test(text)){report.notices++;continue;}
      if(m[6]!==undefined)hasSeconds=true;
      const ap=m[7]?m[7].toLowerCase():m[8]?(m[8]==='\u0635'?'a':'p'):'';
      cur={a:+m[1],b:+m[2],c:+m[3],h:+m[4],mi:+m[5],s:+(m[6]||0),ap,who,text,kind};
      recs.push(cur);
    }else if(cur&&cur.kind==='text'){cur.text+='\n'+clean;}
  }
  if(!recs.length)return {msgs:[],order:null,ambiguous:false,minuteRes:false,report};
  let order=forceOrder,ambiguous=false;
  const ymd=recs[0].a>31;
  if(!ymd&&!order){
    let maxA=0,maxB=0;for(const r of recs){if(r.a>maxA)maxA=r.a;if(r.b>maxB)maxB=r.b;}
    if(maxA>12)order='dmy';else if(maxB>12)order='mdy';
    else{
      ambiguous=true;
      const back=o=>{let n=0,prev=-1;for(const r of recs){const k=o==='dmy'?r.b*100+r.a:r.a*100+r.b;const v=r.c*10000+k;if(v<prev)n++;prev=v;}return n;};
      /* The wrong reading puts consecutive days a month apart, so with both in order the shorter overall span wins; if that ties too, use how this browser region writes dates. */
      const span=o=>{const n=r=>r.c*372+(o==='dmy'?r.b*31+r.a:r.a*31+r.b);return n(recs[recs.length-1])-n(recs[0]);};
      const bm=back('mdy'),bd=back('dmy'),sm=span('mdy'),sd=span('dmy');
      order=bm<bd?'mdy':bd<bm?'dmy':sm<sd?'mdy':sd<sm?'dmy':/-US$/i.test(locale||'')?'mdy':'dmy';
    }
  }else if(!ymd&&forceOrder){ambiguous=true;}
  const all=[];
  for(const r of recs){
    let y,mo,d;
    if(ymd){y=r.a;mo=r.b;d=r.c;}else{y=r.c<100?2000+r.c:r.c;if(order==='dmy'){d=r.a;mo=r.b;}else{mo=r.a;d=r.b;}}
    let h=r.h;if(r.ap==='p')h=h%12+12;else if(r.ap==='a')h=h%12;
    const t=new Date(y,mo-1,d,h,r.mi,r.s);
    /* Date() rolls 31/02 over to March; reject anything that did not survive as written. */
    if(isNaN(t)||h>23||r.mi>59||t.getMonth()!==mo-1||t.getDate()!==d){report.badDates++;continue;}
    let text=r.text;if(EDITED.test(text))text=text.replace(EDITED,'');
    all.push({t,who:r.who,text,kind:r.kind});
  }
  const msgs=foldQuoted(all);report.folded=all.length-msgs.length;
  return {msgs,order:ymd?'ymd':order,ambiguous,minuteRes:!hasSeconds,report};
}

/* Lines pasted from another chat look like new messages. A short run that jumps back in time and then resumes is a candidate; a sender who only ever appears inside such runs is not a participant, so those lines are folded back into the message they were pasted in. Real senders are left alone, because a phone changing time zone produces the same pattern. */
function foldQuoted(all){
  const TOL=10*60e3,LOOK=20,quoted=new Array(all.length).fill(false);
  for(let i=1;i<all.length;i++){
    const base=all[i-1].t;
    if(all[i].t>=base-TOL)continue;
    let j=i;while(j<all.length&&j-i<LOOK&&all[j].t<base)j++;
    if(j-i<LOOK){for(let k=i;k<j;k++)quoted[k]=true;i=j;}
  }
  const seen=new Map();
  all.forEach((m,i)=>{const s=seen.get(m.who)||[0,0];s[0]++;if(quoted[i])s[1]++;seen.set(m.who,s);});
  const out=[];
  all.forEach((m,i)=>{
    const s=seen.get(m.who);
    if(quoted[i]&&s[0]===s[1]&&out.length){const p=out[out.length-1];if(p.kind==='text')p.text+='\n'+m.who+': '+m.text;}
    else out.push(m);
  });
  return out;
}

/* ---------- analysis ---------- */
const STOP=new Set(("the and for that this with you have but not are was all can had her his him one our out day get has how its may new now old see two way who did yes too use from they them then than what when your just like will been were would there their about which could should some more into only over also very much here well back even want because these those does doing done got going really thing things know yeah okay dont don didnt im ive ill youre thats cant its isnt wasnt lets still let "+
"que qué los las una uno unos unas del por con para como cómo pero más mas este esta esto ese esa eso esos esas estos estas hay muy sin sobre ser son fue era soy eres está esta están estoy estás estaba han has hemos tiene tengo tienes tenía van voy vas vamos nos les sus mis tus yo tu tú mi él ella ellos ellas usted ustedes vos al lo le la el en un se es no si sí ya me te de a y o e u ni ha he porque cuando donde dónde quien quién cual cuál todo toda todos todas algo nada bien bueno buena entonces también tambien tan así asi ahí ahi acá aca allá aquí aqui ahora luego después despues antes hoy ayer mañana pues igual solo sólo otra otro cada hace hacer hizo dice dijo ver vez eso ok vale sea creo puede puedo puedes quiero quieres").split(/\s+/));
const LAUGH=/^(a*(ha){2,}h*|(ja){2,}j*a*|j+a+j+[aj]*|(je){2,}j*|(he){2,}h*|lo+l+|lmf?ao+|xd+|(ji){2,})$/i;
const EMOJI=/[0-9#*]\ufe0f?\u20e3|\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\ufe0f|\u200d\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
const URL=/https?:\/\/\S+|www\.\S+/gi;
const dayKey=d=>d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());

function analyze(msgs){
  msgs.sort((a,b)=>a.t-b.t);
  const P=new Map();
  const person=n=>{if(!P.has(n))P.set(n,{name:n,n:0,words:0,media:0,emoji:0,q:0,links:0,deleted:0,laughs:0,night:0,gaps:[],starts:0,turns:0,emo:new Map(),wm:new Map(),textN:0});return P.get(n);};
  const heat=Array.from({length:7},()=>new Array(24).fill(0));
  const days=new Map();const emoAll=new Map();const wordAll=new Map();
  let longest=null,longestWords=0,silence={ms:0},prev=null,convos=0;
  for(const m of msgs){
    const p=person(m.who);p.n++;
    const wd=(m.t.getDay()+6)%7,h=m.t.getHours();heat[wd][h]++;if(h<5)p.night++;
    const k=dayKey(m.t);days.set(k,(days.get(k)||0)+1);
    if(!prev||m.t-prev.t>=8*3600e3){p.starts++;convos++;}
    if(prev){const g=m.t-prev.t;if(g>silence.ms)silence={ms:g,from:prev.t,to:m.t};if(prev.who!==m.who&&g<12*3600e3&&g>=0)p.gaps.push(g);}
    if(!prev||prev.who!==m.who)p.turns++;
    prev=m;
    if(m.kind==='media'){p.media++;continue;}
    if(m.kind==='deleted'){p.deleted++;continue;}
    p.textN++;
    const links=m.text.match(URL);if(links)p.links+=links.length;
    const body=m.text.replace(URL,' ');
    if(/[?¿]/.test(body))p.q++;
    const em=body.match(EMOJI);if(em){p.emoji+=em.length;for(const e of em){p.emo.set(e,(p.emo.get(e)||0)+1);emoAll.set(e,(emoAll.get(e)||0)+1);}}
    const ws=body.toLowerCase().match(/[\p{L}][\p{L}']*/gu)||[];
    p.words+=ws.length;
    if(ws.length>longestWords){longestWords=ws.length;longest=m;}
    let laughed=false;
    for(const w of ws){
      if(LAUGH.test(w)){laughed=true;continue;}
      if(w.length<3||STOP.has(w))continue;
      p.wm.set(w,(p.wm.get(w)||0)+1);wordAll.set(w,(wordAll.get(w)||0)+1);
    }
    if(laughed)p.laughs++;
  }
  const people=[...P.values()].sort((a,b)=>b.n-a.n);
  // streak
  const keys=[...days.keys()].sort((a,b)=>a-b);
  const toDate=k=>new Date(Math.floor(k/10000),Math.floor(k/100)%100-1,k%100);
  let best={len:0},run=0,runStart=null,pd=null;
  for(const k of keys){const d=toDate(k);if(pd&&Math.round((d-pd)/864e5)===1){run++;}else{run=1;runStart=d;}if(run>best.len)best={len:run,from:runStart,to:d};pd=d;}
  let busiest={n:0};for(const [k,n] of days)if(n>busiest.n)busiest={n,date:toDate(k)};
  const first=msgs[0].t,last=msgs[msgs.length-1].t;
  const spanDays=Math.round((startOfDay(last)-startOfDay(first))/864e5)+1;
  return {msgs,people,heat,days,emoAll,wordAll,longest,longestWords,silence,streak:best,busiest,first,last,spanDays,activeDays:days.size,convos,total:msgs.length};
}

/* One call from text to everything the page draws; shared by the page and the worker. */
function crunch(raw,forceOrder,locale){
  const r=parseChat(raw,forceOrder,locale);
  if(!r.msgs.length)return {empty:true};
  const A=analyze(r.msgs);A.minuteRes=r.minuteRes;
  return {A,order:r.order,ambiguous:r.ambiguous,report:r.report};
}

const api={parseChat,analyze,crunch,median,fmtDur,startOfDay,EMOJI};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ChatCore=api;
})(typeof self!=='undefined'?self:this);
