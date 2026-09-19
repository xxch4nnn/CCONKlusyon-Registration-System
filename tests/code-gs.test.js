const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'..','apps-script','Code.gs'),'utf8');
const mk=()=>[['email','full_name','org','club','desig','ticket','code','qr','table','photo','status','ts','by'],
 ['a@x','Reg One','','CESA','Pres','Regular Attendee','11111','','Table 1','','','',''],
 ['b@x','Dr VIP','','UPEMS','Adviser','VIP Pass','22222','','VIP Table 01','','','',''],
 ['c@x','Reg Two','','CESA','Pres','Regular Attendee','33333','','Table 2','','','','']];
let rows=mk(), logs=[], fetches=0; const props={};
const sheet={getDataRange:()=>({getValues:()=>rows}),getRange:(r,c)=>({setValue:v=>{rows[r-1][c-1]=v}})};
const ctx={console:{log:m=>logs.push(m),error:m=>logs.push('ERR '+m)},JSON,Math,String,Date,Object,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 Utilities:{formatDate:()=>'2026-10-02T12:00:00+08:00'},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({getContent:()=>t,setMimeType(){return this}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>(props[k]==null?null:props[k])})},
 UrlFetchApp:{fetch:()=>{fetches++;return{getResponseCode:()=>200,getContentText:()=>''}}}};
vm.createContext(ctx); vm.runInContext(src+'\nthis.doGet=doGet;this.doPost=doPost;this.auditRosterRows_=auditRosterRows_;this.formatAudit_=formatAudit_;this.resetTestCheckins=resetTestCheckins;',ctx);
const J=o=>JSON.parse(o.getContent());
const post=(body,params)=>J(ctx.doPost({postData:{contents:typeof body==='string'?body:JSON.stringify(body)},parameter:params||{}}));
const get=params=>J(ctx.doGet({parameter:params}));
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

console.log(fail?('\n'+fail+' FAILED'):'\nALL PASS'); process.exit(fail?1:0);
