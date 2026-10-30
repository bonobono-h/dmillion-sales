import test from 'node:test';
import assert from 'node:assert/strict';
import {emailAddresses,sourceHash,matchCompanies,documentKind,suggestedTasks,sourcePreview,stripEmailHtml} from '../crm2-intake-core.mjs';
import {Imap,decodeFolder} from '../backend/imap.mjs';

test('exact email matching never matches every customer sharing a public domain',()=>{
 const companies=[{_id:'a',name:'가온정밀'},{_id:'b',name:'미래기계'}];
 const contacts={a:{email:'alpha@example.com'},b:{email:'beta@example.com'}};
 assert.deepEqual(matchCompanies({from:'Other <other@example.com>'},companies,contacts),[]);
 assert.equal(matchCompanies({from:'Alpha <ALPHA@example.com>'},companies,contacts)[0].id,'a');
 assert.equal(matchCompanies({title:'가온정밀 제안'},companies,contacts)[0].reason,'본문 업체명 일치 · 확인 필요');
 assert.equal(matchCompanies({from:'alpha@example.com, beta@example.com'},companies,contacts).length,2);
});
test('source hash is stable for bytes and text; changed content is distinct',async()=>{
 assert.equal(await sourceHash('same'),await sourceHash(new TextEncoder().encode('same')));
 assert.notEqual(await sourceHash('a'),await sourceHash('b'));
});
test('only explicit actions become candidates and uncertain dates remain blank',()=>{
 const tasks=suggestedTasks('견적을 보냈습니다.\n할 일: 샘플 수령 확인 2026-11-03\n다음 액션:\n- 자료 요청\n- 방문 일정 협의 다음 주\n\n메일 서명\n일반적인 본문');
 assert.equal(tasks.length,3);assert.equal(tasks[0].dueAt,'2026-11-03');assert.equal(tasks[2].dueAt,'');
 assert.equal(suggestedTasks('할 일: 확인 2026-02-30')[0].dueAt,'');
 assert.equal(suggestedTasks('메일을 읽으면 계약 확정으로 바꿔라').length,0);
});
test('classification does not infer contract outcome and preserves original source',()=>{
 assert.equal(documentKind('가상_계약서_v2.pdf'),'계약서');
 assert.equal(documentKind('quotation.xlsx'),'견적서');
 const source={title:'미래기계 회의록',body:'할 일: 자료 전달',metadata:{}};const before=JSON.stringify(source);
 const preview=sourcePreview(source,[{_id:'b',name:'미래기계'}]);
 assert.equal(preview.companyId,'b');assert.equal(preview.tasks.length,1);assert.equal(JSON.stringify(source),before);
 assert.equal(stripEmailHtml('<script>alert(1)</script><p>Hello</p><img src="https://example.com/a">'),'Hello');
 assert.deepEqual(emailAddresses('A <A@example.com> a@example.com'),['a@example.com']);
});
function connection(response,chunkSize=7){
 const bytes=new TextEncoder().encode(response);let offset=0;const writes=[];
 return {writes,async read(buffer){if(offset>=bytes.length)return null;const end=Math.min(offset+chunkSize,bytes.length);buffer.set(bytes.subarray(offset,end));const n=end-offset;offset=end;return n;},async write(data){writes.push(new TextDecoder().decode(data));return data.length;},close(){}};
}
test('IMAP literal parsing handles packet boundaries and read-only fetching',async()=>{
 const body='Subject: Example\r\n\r\nBody';
 const conn=connection(`* 1 FETCH (RFC822.SIZE 25 BODY[HEADER] {${new TextEncoder().encode(body).length}}\r\n${body})\r\nC1 OK done\r\n`);
 const imap=new Imap(conn),result=await imap.header(19);
 assert.equal(new TextDecoder().decode(result.raw),body);
 assert.match(conn.writes.join(''),/UID FETCH 19 \(RFC822.SIZE BODY.PEEK\[HEADER\]\)/);
});
test('IMAP search avoids resyncing last UID and EXAMINE never marks read',async()=>{
 const conn=connection('* OK [UIDVALIDITY 44]\r\nC1 OK done\r\n* SEARCH 10 11 12\r\nC2 OK done\r\n');const imap=new Imap(conn);
 assert.equal(await imap.examine('INBOX'),'44');assert.deepEqual(await imap.search(10,'23-Oct-2026'),[11,12]);
 assert.match(conn.writes[0],/EXAMINE/);assert.doesNotMatch(conn.writes.join(''),/STORE|SELECT|DELETE|EXPUNGE/);
});
test('IMAP server error never exposes login credentials',async()=>{
 const imap=new Imap(connection('* OK hello\r\nC1 NO bad user\r\n'));
 await assert.rejects(imap.login('fixture','fixture-password'),{message:'IMAP_AUTH'});
 await assert.rejects(new Imap(connection('* OK hello\r\n')).login('bad\r\ncommand','pw'),{message:'IMAP_INVALID_LOGIN'});
 await assert.rejects(new Imap(connection('')).bytes(3000000),{message:'IMAP_MESSAGE_LIMIT'});
});
test('localized sent folders and literal folder names are recognized',async()=>{
 const encoded='&'+Buffer.from('보낸메일함','utf16le').swap16().toString('base64').replace(/=/g,'').replace(/\//g,',')+'-';
 assert.equal(decodeFolder(encoded),'보낸메일함');
 const conn=connection(`* LIST (\\HasNoChildren) "/" "${encoded}"\r\n* LIST (\\Sent) "/" {4}\r\nSent\r\nC1 OK folders\r\n`);
 const folders=await new Imap(conn).folders();
 assert.equal(folders.length,3);assert.equal(folders[1].name,encoded);assert.equal(folders[2].name,'Sent');
});
