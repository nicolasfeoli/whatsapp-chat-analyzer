// Run with: node --test
// Loads the parser and analysis straight out of index.html, so the page stays a single file.
// Every chat line here is invented. Never add a real export to this folder.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('const esc='),html.indexOf('/* ---------- rendering'));
const {parseChat,analyze,median,EMOJI}=new Function(src+';return {parseChat,analyze,median,EMOJI};')();
const LRM='\u200e',NNBSP='\u202f';
const run=(lines,order,locale)=>{const r=parseChat(lines.join('\r\n'),order,locale);return {...r,A:r.msgs.length?analyze(r.msgs):null};};
const who=(A,n)=>A.people.find(p=>p.name===n);

test('iPhone en-US: system lines dropped, media and deleted counted',()=>{
  const {msgs,order,minuteRes,A}=run([
    `[8/31/26, 1:29:57${NNBSP}PM] Ana: ${LRM}Messages and calls are end-to-end encrypted. Only people in this chat can read them.`,
    `[8/31/26, 1:29:57${NNBSP}PM] Ana: ${LRM}Ana is a contact.`,
    `[8/31/26, 1:12:41${NNBSP}PM] Ana: Hola hola`,
    `${LRM}[8/31/26, 1:13:00${NNBSP}PM] Bob: ${LRM}sticker omitted`,
    `${LRM}[8/31/26, 1:13:10${NNBSP}PM] Bob: ${LRM}<attached: 00001-PHOTO.jpg>`,
    `[8/31/26, 1:13:20${NNBSP}PM] Ana: ${LRM}This message was deleted.`,
    `[8/31/26, 1:13:30${NNBSP}PM] Bob: ${LRM}You deleted this message.`,
    `[8/31/26, 1:13:40${NNBSP}PM] Bob: ${LRM}Location: https://maps.google.com/?q=1,2`,
    `[8/31/26, 1:13:50${NNBSP}PM] Ana: ${LRM}POLL:`,
    `${LRM}OPTION: yes (2 votes)`,
    `[8/31/26, 1:14:00${NNBSP}PM] Ana: fixed it ${LRM}<This message was edited>`,
    `[8/31/26, 1:14:10${NNBSP}PM] Bob: that part was omitted`,
  ]);
  assert.equal(order,'mdy');assert.equal(minuteRes,false);assert.equal(msgs.length,9);
  assert.deepEqual([who(A,'Ana').deleted,who(A,'Bob').deleted],[1,1]);
  assert.deepEqual([who(A,'Ana').media,who(A,'Bob').media],[1,3]);
  assert.equal(who(A,'Bob').textN,1,'typed text ending in "omitted" is still text');
  assert.equal(msgs.find(m=>m.text.startsWith('fixed')).text,'fixed it');
  assert.equal(A.first.getHours(),13);
});

test('Android en-US 12h: multi-line, media, deleted, system lines',()=>{
  const {msgs,order,minuteRes,A}=run([
    `12/31/23, 9:58${NNBSP}PM - Messages and calls are end-to-end encrypted. Tap to learn more.`,
    `12/31/23, 10:00${NNBSP}PM - Ana: happy new year`,
    `12/31/23, 10:00${NNBSP}PM - Bob: same to you`,
    `second line`,
    `12/31/23, 10:01${NNBSP}PM - Ana: <Media omitted>`,
    `12/31/23, 10:02${NNBSP}PM - Bob: This message was deleted`,
    `12/31/23, 10:03${NNBSP}PM - Ana: IMG-20231231-WA0001.jpg (file attached)`,
    `caption`,
    `1/1/24, 12:05${NNBSP}AM - Bob added Carl`,
    `1/1/24, 12:06${NNBSP}AM - Bob changed the group name to "Party: 2024"`,
    `1/1/24, 12:07${NNBSP}AM - Carl: hello`,
    `1/1/24, 12:08${NNBSP}AM - Bob: null`,
    `1/1/24, 12:09${NNBSP}AM - Ana: Missed voice call`,
  ]);
  assert.equal(order,'mdy');assert.equal(minuteRes,true);
  assert.deepEqual(A.people.map(p=>p.name).sort(),['Ana','Bob','Carl']);
  assert.equal(msgs.length,7);
  assert.equal(msgs[1].text,'same to you\nsecond line');
  assert.deepEqual([who(A,'Ana').media,who(A,'Bob').media,who(A,'Bob').deleted],[2,1,1]);
  assert.equal(A.last.getHours(),0);
});

test('Spanish "p. m." clock',()=>{
  const {msgs,A}=run([`31/12/23, 10:00 p. m. - Ana: hola`,`31/12/23, 10:01 p. m. - Bob: <Multimedia omitido>`,`1/1/24, 12:02 a. m. - Bob: Se eliminó este mensaje`]);
  assert.equal(msgs[0].t.getHours(),22);assert.equal(msgs[2].t.getHours(),0);
  assert.deepEqual([who(A,'Bob').media,who(A,'Bob').deleted],[1,1]);
});

test('German and Portuguese placeholders do not count as words',()=>{
  const de=run([`31.12.23, 22:00 - Ana: hallo`,`31.12.23, 22:01 - Bob: <Medien ausgeschlossen>`,`31.12.23, 22:02 - Bob: Diese Nachricht wurde gelöscht`]).A;
  assert.deepEqual([who(de,'Bob').media,who(de,'Bob').deleted,who(de,'Bob').words],[1,1,0]);
  const pt=run([`31/12/2023 22:00 - Ana: oi`,`31/12/2023 22:01 - Bob: <Mídia oculta>`,`[31/12/2023, 22:02:00] Bob: ${LRM}imagem ocultada`]).A;
  assert.deepEqual([who(pt,'Bob').media,who(pt,'Bob').words],[2,0]);
});

test('non-Latin digits and Arabic am/pm',()=>{
  const {msgs}=run([`٣١/١٢/٢٠٢٣، ١٠:٠٥ م - Ana: hi`,`۳۱/۱۲/۲۰۲۳, ۲۲:۰۶ - Bob: hi`]);
  assert.equal(msgs.length,2);assert.equal(msgs[0].t.getHours(),22);assert.equal(msgs[0].t.getMinutes(),5);assert.equal(msgs[1].t.getDate(),31);
});

test('a sender named like a system verb is kept',()=>{
  const {A}=run([`[31/12/2023, 22:00:00] Left Shark: hi`,`[31/12/2023, 22:00:05] Juan Added: hi`,`31/12/2023, 22:01 - Bob changed the subject from "a" to "b: c"`]);
  assert.deepEqual(A.people.map(p=>p.name).sort(),['Juan Added','Left Shark']);
});

test('pasted chat lines do not create participants',()=>{
  const {msgs,A}=run([
    `1/13/24, 10:00 - Ana: look what he said:`,
    `1/12/24, 09:00 - Zed: I never said that`,
    `1/12/24, 09:01 - Zed: honest`,
    `1/13/24, 10:01 - Bob: wow`,
  ]);
  assert.deepEqual(A.people.map(p=>p.name).sort(),['Ana','Bob']);
  assert.equal(msgs[0].text,'look what he said:\nZed: I never said that\nZed: honest');
});

test('a real sender whose clock jumps back is not folded away',()=>{
  const {msgs}=run([`1/13/24, 10:00 - Ana: boarding`,`1/13/24, 04:00 - Ana: landed`,`1/13/24, 04:30 - Bob: welcome`,`1/13/24, 11:00 - Bob: dinner?`]);
  assert.equal(msgs.length,4);
});

test('ambiguous dates: sequence, then shortest span, then region',()=>{
  const us=[`1/2/24, 10:00 - Ana: a`,`1/3/24, 10:00 - Bob: b`,`1/4/24, 10:00 - Ana: c`];
  const eu=[`1/2/24, 10:00 - Ana: a`,`2/2/24, 10:00 - Bob: b`,`3/2/24, 10:00 - Ana: c`];
  const oneDay=[`1/2/24, 10:00 - Ana: a`,`1/2/24, 10:01 - Bob: b`];
  assert.equal(run(us,null,'es-CR').order,'mdy');
  assert.equal(run(eu,null,'en-US').order,'dmy');
  assert.equal(run(us,null,'es-CR').ambiguous,true);
  assert.equal(run(oneDay,null,'en-US').order,'mdy');
  assert.equal(run(oneDay,null,'es-CR').order,'dmy');
  assert.equal(run(us,'dmy','en-US').order,'dmy');
});

test('impossible dates are rejected, not rolled over',()=>{
  const {msgs}=run([`31/02/24, 10:00 - Ana: a`,`13/03/24, 10:00 - Bob: b`]);
  assert.equal(msgs.length,1);assert.equal(msgs[0].who,'Bob');
});

test('minute-resolution exports are flagged; same-minute gaps are 0',()=>{
  const {minuteRes,A}=run(Array.from({length:12},(_,i)=>`1/13/24, 10:0${i>>2} - ${i%2?'Ana':'Bob'}: msg`));
  assert.equal(minuteRes,true);assert.equal(median(who(A,'Ana').gaps),0);
});

test('large chats do not overflow the stack',()=>{
  const n=400000,lines=new Array(n);
  for(let i=0;i<n;i++)lines[i]=`1/${1+(i%9)}/24, 10:00 - ${i%2?'Ana':'Bob'}: m`;
  const {msgs,A}=run(lines);
  assert.equal(msgs.length,n);assert.equal(A.total,n);
});

test('emoji counting: keycaps, flags, ZWJ families, skin tones',()=>{
  assert.deepEqual('1️⃣ 🇨🇷 👨‍👩‍👧 👍🏽 🏴󠁧󠁢󠁥󠁮󠁧󠁿 ok 12'.match(EMOJI).length,5);
});
