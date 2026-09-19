const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'..','apps-script','Code.gs'),'utf8');
const mk=()=>[['email','full_name','org','club','desig','ticket','code','qr','table','photo','status','ts','by'],
 ['a@x','Reg One','','CESA','Pres','Regular Attendee','11111','','Table 1','','','',''],
 ['b@x','Dr VIP','','UPEMS','Adviser','VIP Pass','22222','','VIP Table 01','','','',''],
 ['c@x','Reg Two','','CESA','Pres','Regular Attendee','33333','','Table 2','','','','']];
let rows=mk(), logs=[], fetches=0; const props={}; const tgQueue=[]; const tgSent=[]; const sleeps=[];
const sheet={getDataRange:()=>({getValues:()=>rows}),getRange:(r,c)=>({setValue:v=>{rows[r-1][c-1]=v}})};
const ctx={console:{log:m=>logs.push(m),error:m=>logs.push('ERR '+m)},JSON,Math,String,Date,Object,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 Utilities:{getUuid:()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>(Math.random()*16|0).toString(16)),formatDate:(d,tz,f)=>String(f).includes('yyyy')?new Date().toISOString().replace('Z','+00:00'):'TIME',sleep:ms=>{sleeps.push(ms)}},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({getContent:()=>t,setMimeType(){return this}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>(props[k]==null?null:props[k]),setProperty:(k,v)=>{props[k]=v}})},
 UrlFetchApp:{fetch:(u,o)=>{fetches++;tgSent.push(o&&o.payload?JSON.parse(o.payload):null);const n=tgQueue.length?tgQueue.shift():{code:200};if(n.throw)throw new Error(n.throw);return{getResponseCode:()=>n.code,getContentText:()=>n.body!==undefined?n.body:JSON.stringify({ok:true,result:{date:Math.floor(Date.now()/1000)+1}})}}}};
vm.createContext(ctx); vm.runInContext(src+'\nthis.doGet=doGet;this.doPost=doPost;this.auditRosterRows_=auditRosterRows_;this.buildVipAlertText_=typeof buildVipAlertText_=="function"?buildVipAlertText_:undefined;this.notifyVipTelegram_=notifyVipTelegram_;this.vipAlertReport=typeof vipAlertReport=="function"?vipAlertReport:undefined;this.handleSync_=handleSync_;this.formatAudit_=formatAudit_;this.resetTestCheckins=resetTestCheckins;this.generateAccessKey=typeof generateAccessKey=="function"?generateAccessKey:undefined;',ctx);
const J=o=>JSON.parse(o.getContent());
const KEY='test-key-0123456789ab'; props.API_KEY=KEY;
const withKey=p=>Object.prototype.hasOwnProperty.call(p||{},'key')?(p||{}):Object.assign({key:KEY},p||{});
const post=(body,params)=>J(ctx.doPost({postData:{contents:typeof body==='string'?body:JSON.stringify(body)},parameter:withKey(params)}));
const get=params=>J(ctx.doGet({parameter:withKey(params)}));
const postRaw=(body,params)=>J(ctx.doPost({postData:{contents:typeof body==='string'?body:JSON.stringify(body)},parameter:params||{}}));
const getRaw=params=>J(ctx.doGet({parameter:params||{}}));
let fail=0; const ok=(name,cond,extra)=>{console.log((cond?'PASS ':'FAIL ')+name+(extra?'  '+extra:'')); if(!cond)fail++;};

ok('POST checkin (normal)', post({action:'checkin',attendance_code:'11111',device_id:'T1'}).status==='SUCCESS');
const d=post({action:'checkin',attendance_code:'11111',device_id:'T2'});
ok('POST duplicate carries checked_in_by', d.status==='DUPLICATE' && d.data.checked_in_by==='T1', JSON.stringify(d.data));
ok('GET checkin SUCCESS', get({action:'checkin',attendance_code:'33333',device_id:'T3'}).status==='SUCCESS');
ok('GET checkin repeat => DUPLICATE (idempotent)', get({action:'checkin',attendance_code:'33333',device_id:'T3'}).status==='DUPLICATE');
ok('GET checkin bogus code => NOT_FOUND', get({action:'checkin',attendance_code:'99999',device_id:'T3'}).status==='NOT_FOUND');
ok('GET checkin missing code => ERROR (not Unknown action)', (r=>r.status==='ERROR'&&/Missing/.test(r.message))(get({action:'checkin'})));
ok('POST with action only in query string', post({attendance_code:'22222',device_id:'T4'},{action:'checkin'}).status==='SUCCESS');
ok('POST body {} + action in query + code in query', post({}, {action:'checkin',attendance_code:'99999'}).status==='NOT_FOUND');
ok('POST invalid JSON, no action => Invalid JSON', post('not json').message==='Invalid JSON payload.');
ok('POST invalid JSON but ?action=ping => pong', post('not json',{action:'ping'}).message==='pong');
ok('POST bogus action => Unknown action', post({action:'zzz'}).message==='Unknown action.');
ok('GET ping => pong', get({action:'ping'}).message==='pong');
ok('ping reports the backend version (deployment check)', /^\d{4}-\d{2}-\d{2}\.\d+$/.test(String(get({action:'ping'}).version)), JSON.stringify(get({action:'ping'})));
ok('GET no params => Unknown action (unchanged)', get({}).message==='Unknown action.');
ok('GET roster still works', get({action:'roster'}).status==='SUCCESS');
ok('GET recent still works', get({action:'recent',limit:'5'}).status==='SUCCESS');
const s=post({action:'sync',items:[{action:'checkin',attendance_code:'11111',device_id:'X'},{action:'checkin',attendance_code:'99999',device_id:'X'}]});
ok('POST sync results per item', s.results.map(r=>r.status).join()==='DUPLICATE,NOT_FOUND');
ok('logging present', logs.some(l=>l.startsWith('doGet action=checkin')) && logs.some(l=>l.startsWith('doPost action=checkin')), logs.slice(0,2).join(' | '));

// ---- roster audit (Stories 6.1.1 / 7.1.1) --------------------------------------------------------
const H=['email','full_name','org','club','desig','ticket','code','qr','table','photo','status','ts','by'];
const qr=c=>'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+c;
const good=(n,code,ticket)=>['p'+n+'@example.com','Person '+n,ticket==='VIP Pass'?'':'Academic','Club '+n,'Pres',ticket||'Regular Attendee',code,qr(code),'Table '+n,ticket==='VIP Pass'?'https://x/p'+n+'.jpg':'','','',''];
const noF=v=>v.map(r=>r.map(()=>''));
const audit=(vals,f)=>ctx.auditRosterRows_(vals,f||noF(vals));
const find=(rep,list,frag)=>rep[list].some(x=>(x.field+' '+x.message).includes(frag));

let a=audit([H,good(1,'48201'),good(2,'48202','VIP Pass'),good(3,'48203')]);
ok('AUDIT clean roster is READY', a.ready && a.errors.length===0 && a.summary.rows===3 && a.summary.vip===1 && a.summary.regular===2, JSON.stringify(a.summary));
ok('AUDIT no warnings on clean roster', a.warnings.length===0, JSON.stringify(a.warnings));

a=audit([H,good(1,'48201'),good(2,'48201')]);
ok('AUDIT duplicate PIN is an error', !a.ready && find(a,'errors','duplicate of row 2'));
a=audit([H,good(1,'4820'),good(2,'48202'),good(3,'01234'),good(4,'abcde'),good(5,'')]);
ok('AUDIT malformed / blank PINs are errors', a.errors.filter(e=>e.field==='attendance_code').length===4, a.errors.map(e=>e.row+':'+e.message).join(' | '));
a=audit([H,good(1,'48201'),good(2,'48202')],[Array(13).fill(''),Array(13).fill(''),Array(13).fill('').map((x,i)=>i===6?'=RANDARRAY(1)':x)]);
ok('AUDIT live formula is an error', !a.ready && a.summary.formulas===1 && find(a,'errors','live formula'));
a=audit([H,Object.assign(good(1,'48201'),{5:'Guest'})]);
ok('AUDIT bad ticket type is an error', find(a,'errors','ticket_type'));
a=audit([H,Object.assign(good(1,'48201'),{0:''}),Object.assign(good(2,'48202'),{0:'not-an-email'})]);
ok('AUDIT blank / invalid email are errors', a.errors.filter(e=>e.field==='email').length===2);
a=audit([H,Object.assign(good(1,'48201'),{7:qr('99999')}),Object.assign(good(2,'48202'),{7:''})]);
ok('AUDIT stale / missing QR url are errors', a.errors.filter(e=>e.field==='qr_code_url').length===2);
a=audit([H,Object.assign(good(1,'48201'),{10:'Done'})]);
ok('AUDIT unknown status is an error', find(a,'errors','checkin_status'));
a=audit([H,Object.assign(good(1,'48201'),{1:''})]);
ok('AUDIT blank name is an error', find(a,'errors','full_name'));
a=audit([H,Object.assign(good(1,'48201'),{10:'Checked-In'}),good(2,'48202')]);
ok('AUDIT checked-in rows warn (reset before go-live) but do not block', a.ready && find(a,'warnings','already Checked-In') && a.summary.checkedIn===1);
a=audit([H,Object.assign(good(1,'48201'),{8:'',4:'',3:''}),Object.assign(good(2,'48202','VIP Pass'),{9:''}),Object.assign(good(3,'48203'),{2:''}),Object.assign(good(4,'48204'),{9:'ftp://x'})]);
ok('AUDIT completeness gaps are warnings only', a.ready && ['table_allocation','designation','club_name','photo_url','org_classification'].every(f=>find(a,'warnings',f)), a.warnings.map(w=>w.field).join());
a=audit([H,good(1,'48201'),Object.assign(good(2,'48202'),{0:'P1@EXAMPLE.com'}),['','','','','','','','','','','','','']]);
ok('AUDIT duplicate email is a warning; blank rows ignored', a.ready && find(a,'warnings','same address') && a.summary.rows===2);
const txt=ctx.formatAudit_(audit([H,Object.assign(good(1,'48201'),{0:'secret.person@example.com',1:'Secret Person'}),good(2,'48201')])).join('\n');
ok('AUDIT report prints no names or emails', !/secret/i.test(txt) && /NOT READY/.test(txt), txt.split('\n').pop());

// ---- resetTestCheckins ------------------------------------------------------------------------------
rows=mk(); logs.length=0;
post({action:'checkin',attendance_code:'11111',device_id:'T'}); post({action:'checkin',attendance_code:'22222',device_id:'T'}); post({action:'checkin',attendance_code:'33333',device_id:'T'});
let r=ctx.resetTestCheckins();
ok('RESET does nothing when the property is unset', r.reset===0 && rows[1][10]==='Checked-In');
props.TEST_RESET_CODES='11111, 22222';
r=ctx.resetTestCheckins();
ok('RESET clears only the listed rows', r.reset===2 && rows[1][10]==='Pending' && rows[1][11]==='' && rows[1][12]==='' && rows[2][10]==='Pending' && rows[3][10]==='Checked-In', rows.slice(1).map(x=>x[10]).join());
props.TEST_RESET_CODES='33333,99999';
r=ctx.resetTestCheckins();
ok('RESET reports codes it could not find', r.reset===1 && r.notFound.join()==='99999');
rows=mk(); post({action:'checkin',attendance_code:'11111',device_id:'T'});
props.TEST_RESET_CODES='11111,abc';
r=ctx.resetTestCheckins();
ok('RESET refuses if any code is malformed', r.reset===0 && rows[1][10]==='Checked-In');
props.TEST_RESET_CODES=Array.from({length:31},(_,i)=>String(10000+i)).join(',');
r=ctx.resetTestCheckins();
ok('RESET refuses more than 30 codes', r.reset===0 && rows[1][10]==='Checked-In');
delete props.TEST_RESET_CODES;

// ---- Epic 4: VIP Telegram alert ---------------------------------------------------------------------------
const T4=(name,fn)=>{try{fn()}catch(e){ok(name+' — threw',false,String(e&&e.message||e))}};
const vip={full_name:'Dr Sample',designation:'Adviser',club_name:'UPEMS',table_allocation:'VIP Table 01'};
const reset4=()=>{rows=mk();tgQueue.length=0;tgSent.length=0;sleeps.length=0;fetches=0;logs.length=0;delete props.VIP_ALERT_LOG;props.TELEGRAM_BOT_TOKEN='TOK';props.TELEGRAM_CHAT_ID='CHAT'};
const EXPECT='⭐ VIP ARRIVAL DETECTED ⭐\nName: Dr Sample\nRole: Adviser (UPEMS)\nAssigned Seat: VIP Table 01\nTime: TIME\n\n👉 Designated Escort: Usher Lead please acknowledge and proceed to Entrance.';

T4('E1',()=>{ ok('E1 alert text matches the spec template exactly', ctx.buildVipAlertText_&&ctx.buildVipAlertText_(vip)===EXPECT, ctx.buildVipAlertText_?JSON.stringify(ctx.buildVipAlertText_(vip)):'buildVipAlertText_ missing'); });
T4('E2',()=>{ ['0',0,'',null,undefined,'  '].forEach(v=>ok('E2 unassigned seat '+JSON.stringify(v)+' -> "Not yet assigned"', ctx.buildVipAlertText_&&ctx.buildVipAlertText_(Object.assign({},vip,{table_allocation:v})).includes('Assigned Seat: Not yet assigned'))); });
T4('E3',()=>{ const t=ctx.buildVipAlertText_(Object.assign({},vip,{club_name:''})); ok('E3 no club -> no empty parentheses', t.includes('Role: Adviser\n')&&!t.includes('()')); ok('E3 missing designation -> dash', ctx.buildVipAlertText_(Object.assign({},vip,{designation:''})).includes('Role: — (UPEMS)')); });
T4('E4',()=>{ ok('E4 no delayed marker for a live scan', !ctx.buildVipAlertText_(vip).includes('offline')); const d=ctx.buildVipAlertText_(vip,{delayed:true}); ok('E4 delayed marker for a queued/synced scan', /offline/i.test(d)&&d.endsWith('proceed to Entrance.')); });

T4('E5',()=>{ reset4(); tgQueue.push({code:500,body:'err'},{code:200}); const r=ctx.notifyVipTelegram_(vip); ok('E5 500 then 200 -> retried and delivered', r.ok===true&&r.attempts===2&&tgSent.length===2&&sleeps.length===1, JSON.stringify(r)); });
T4('E6',()=>{ reset4(); tgQueue.push({code:403,body:'{"ok":false,"description":"Forbidden"}'}); const r=ctx.notifyVipTelegram_(vip); ok('E6 403 (bad chat/token) is not retried', r.ok===false&&r.attempts===1&&tgSent.length===1, JSON.stringify(r)); });
T4('E7',()=>{ reset4(); tgQueue.push({code:429,body:'{"ok":false,"parameters":{"retry_after":1}}'},{code:200}); const r=ctx.notifyVipTelegram_(vip); ok('E7 429 honours retry_after (capped at 2 s) then delivers', r.ok===true&&r.attempts===2&&sleeps[0]>=1000&&sleeps[0]<=2000, JSON.stringify(r)+' sleeps='+sleeps); });
T4('E8',()=>{ reset4(); tgQueue.push({throw:'network'},{code:200}); const r=ctx.notifyVipTelegram_(vip); ok('E8 thrown network error then 200 -> delivered', r.ok===true&&r.attempts===2, JSON.stringify(r)); });
T4('E9',()=>{ reset4(); tgQueue.push({code:500},{code:500}); const chk=post({action:'checkin',attendance_code:'22222',device_id:'T'}); ok('E9 Telegram down: check-in still SUCCESS', chk.status==='SUCCESS'&&rows[2][10]==='Checked-In'); const L=JSON.parse(props.VIP_ALERT_LOG||'[]'); ok('E9 failure is recorded in the alert log', L.length===1&&L[0].ok===false, props.VIP_ALERT_LOG); });
T4('E10',()=>{ reset4(); post({action:'checkin',attendance_code:'22222',device_id:'T'}); const L=JSON.parse(props.VIP_ALERT_LOG||'[]'); ok('E10 successful alert logged with timings', L.length===1&&L[0].ok===true&&typeof L[0].ms==='number'&&typeof L[0].tgMs==='number'&&L[0].delaySec>=0&&L[0].delaySec<=3, props.VIP_ALERT_LOG);
  for(let i=0;i<25;i++){ rows=mk(); post({action:'checkin',attendance_code:'22222',device_id:'T'}); } ok('E10 log keeps only the last 20', JSON.parse(props.VIP_ALERT_LOG).length===20); });
T4('E11',()=>{ reset4(); const r0=ctx.vipAlertReport&&ctx.vipAlertReport(); ok('E11 report on an empty log', r0&&r0.count===0, JSON.stringify(r0));
  for(let i=0;i<3;i++){ rows=mk(); post({action:'checkin',attendance_code:'22222',device_id:'T'}); } const r=ctx.vipAlertReport(); ok('E11 report summarises count / delivered / within 3 s', r.count===3&&r.delivered===3&&r.within3s===3&&typeof r.maxMs==='number', JSON.stringify(r)); });
T4('E12',()=>{ reset4(); post({action:'checkin',attendance_code:'22222',device_id:'T'}); ok('E12 live scan: no delayed marker', tgSent.length===1&&!/offline/i.test(tgSent[0].text)); reset4();
  ctx.handleSync_({items:[{action:'checkin',attendance_code:'22222',device_id:'T'}]}); ok('E12 synced (queued offline) scan: marked delayed', tgSent.length===1&&/offline/i.test(tgSent[0].text), JSON.stringify(tgSent[0]&&tgSent[0].text)); });
T4('E13',()=>{ reset4(); post({action:'checkin',attendance_code:'11111',device_id:'T'}); ok('E13 regular attendee: no alert', tgSent.length===0); post({action:'checkin',attendance_code:'22222',device_id:'T'}); const n=tgSent.length; post({action:'checkin',attendance_code:'22222',device_id:'T'}); ok('E13 duplicate VIP scan: no second alert', n===1&&tgSent.length===1); });
T4('E14',()=>{ reset4(); delete props.TELEGRAM_BOT_TOKEN; const chk=post({action:'checkin',attendance_code:'22222',device_id:'T'}); ok('E14 not provisioned: check-in fine, no request, nothing logged', chk.status==='SUCCESS'&&tgSent.length===0&&!props.VIP_ALERT_LOG); });
T4('E15',()=>{ const a=audit([H,Object.assign(good(1,'48201'),{8:'0'}),Object.assign(good(2,'48202'),{8:0}),Object.assign(good(3,'48203'),{8:'Table 0'})]); ok('E15 audit warns when table_allocation is 0 (unassigned)', a.warnings.filter(w=>w.field==='table_allocation').length===3, a.warnings.map(w=>w.field+':'+w.row).join()); });

// ---- Shared access key (every data endpoint needs it; ping is open) ------------------------------------------------
const T5=(name,fn)=>{try{fn()}catch(e){ok(name+' — threw',false,String(e&&e.message||e))}};
T5('K1',()=>{ rows=mk(); delete props.API_KEY; fetches=0;
  const rs=[postRaw({action:'checkin',attendance_code:'11111',device_id:'K'},{key:KEY}), getRaw({action:'checkin',attendance_code:'11111',device_id:'K',key:KEY}), getRaw({action:'recent',key:KEY}), getRaw({action:'roster',key:KEY}), postRaw({action:'sync',items:[{action:'checkin',attendance_code:'11111',device_id:'K'}]},{key:KEY})];
  ok('K1 no key configured on the server: every data endpoint refuses (fail closed)', rs.every(r=>r.status==='ERROR'&&r.code==='KEY_NOT_SET'), rs.map(r=>r.code).join());
  ok('K1 nothing was written', rows[1][10]===''); props.API_KEY=KEY; });
T5('K2',()=>{ rows=mk(); fetches=0; tgSent.length=0; let all=true; const bad=[];
  [undefined,'','wrong',KEY+'x',KEY.slice(0,-1),KEY.toUpperCase()].forEach(k=>{ const p=k===undefined?{}:{key:k};
    [postRaw({action:'checkin',attendance_code:'22222',device_id:'K'},p), getRaw(Object.assign({action:'checkin',attendance_code:'22222',device_id:'K'},p)), getRaw(Object.assign({action:'recent'},p)), getRaw(Object.assign({action:'roster'},p)), postRaw({action:'sync',items:[{action:'checkin',attendance_code:'22222',device_id:'K'}]},p)]
      .forEach(r=>{ if(!(r.status==='ERROR'&&r.code==='UNAUTHORIZED')){ all=false; bad.push(r.code||r.status); } }); });
  ok('K2 missing / empty / wrong / near-miss keys are refused on every endpoint', all, bad.join());
  ok('K2 refused requests write nothing and send no Telegram alert', rows[2][10]===''&&tgSent.length===0&&fetches===0); });
T5('K3',()=>{ rows=mk();
  ok('K3 key in the query string is accepted', postRaw({action:'checkin',attendance_code:'11111',device_id:'K'},{key:KEY}).status==='SUCCESS');
  ok('K3 key inside the POST body is accepted', postRaw({action:'checkin',attendance_code:'33333',device_id:'K',key:KEY},{}).status==='SUCCESS');
  ok('K3 GET check-in, recent and roster accept it', getRaw({action:'checkin',attendance_code:'99999',device_id:'K',key:KEY}).status==='NOT_FOUND'&&getRaw({action:'recent',key:KEY}).status==='SUCCESS'&&getRaw({action:'roster',key:KEY}).status==='SUCCESS');
  const s=postRaw({action:'sync',key:KEY,items:[{action:'checkin',attendance_code:'22222',device_id:'K'}]},{});
  ok('K3 sync accepts it (once for the whole batch)', s.status==='SUCCESS'&&s.results[0].status==='SUCCESS', JSON.stringify(s)); });
T5('K4',()=>{
  const a=getRaw({action:'ping'}), b=getRaw({action:'ping',key:KEY}), c=getRaw({action:'ping',key:'nope'});
  ok('K4 ping stays open and reports whether a key is required', a.status==='SUCCESS'&&a.message==='pong'&&a.secured===true&&a.authorized===false, JSON.stringify(a));
  ok('K4 ping says whether the supplied key is right', b.authorized===true&&c.authorized===false&&c.status==='SUCCESS');
  ok('K4 ping never echoes the key', !JSON.stringify([a,b,c]).includes(KEY));
  delete props.API_KEY; const d=getRaw({action:'ping',key:KEY}); ok('K4 ping on a server with no key set says so', d.secured===false&&d.authorized===false, JSON.stringify(d)); props.API_KEY=KEY;
  ok('K4 unknown actions still answer "Unknown action." without a key', getRaw({action:'zzz'}).message==='Unknown action.'&&postRaw({action:'zzz'},{}).message==='Unknown action.'); });
T5('K5',()=>{ logs.length=0; rows=mk();
  postRaw({action:'checkin',attendance_code:'11111',device_id:'K'},{key:KEY}); getRaw({action:'roster',key:KEY}); getRaw({action:'recent',key:'wrong-key-value'}); postRaw({action:'sync',key:KEY,items:[]},{});
  ok('K5 the key is never written to the execution log', !logs.some(l=>String(l).includes(KEY)||String(l).includes('wrong-key-value')), logs.join(' | ')); });
T5('K6',()=>{ delete props.API_KEY; logs.length=0;
  const r=ctx.generateAccessKey&&ctx.generateAccessKey();
  ok('K6 generateAccessKey creates a key when none exists', !!r&&r.created===true&&/^[A-Za-z0-9]{20,}$/.test(props.API_KEY||''), String(props.API_KEY));
  ok('K6 and shows it once, in the log, for the operator', logs.some(l=>String(l).includes(props.API_KEY)));
  const first=props.API_KEY; logs.length=0; const r2=ctx.generateAccessKey();
  ok('K6 never overwrites an existing key and does not print it again', r2.created===false&&props.API_KEY===first&&!logs.some(l=>String(l).includes(first)));
  props.API_KEY=KEY; });

console.log(fail?('\n'+fail+' FAILED'):'\nALL PASS'); process.exit(fail?1:0);
