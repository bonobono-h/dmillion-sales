const encoder=new TextEncoder(),decoder=new TextDecoder();
const quote=s=>{if(/[\r\n\0]/.test(s)||String(s).length>1024)throw new Error('IMAP_INVALID_LOGIN');return '"'+String(s).replace(/[\\"]/g,'\\$&')+'"';};
export function decodeFolder(value){return String(value).replace(/&([^-]*)-/g,(_,token)=>{
 if(!token)return '&';try{const binary=atob(token.replace(/,/g,'/'));return new TextDecoder('utf-16be').decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{return token;}
});}
export class Imap {
  constructor(conn){this.conn=conn;this.buffer=new Uint8Array();this.sequence=0;}
  async more(){const chunk=new Uint8Array(65536);const n=await this.conn.read(chunk);if(n===null)throw new Error('IMAP_CLOSED');const next=new Uint8Array(this.buffer.length+n);next.set(this.buffer);next.set(chunk.subarray(0,n),this.buffer.length);this.buffer=next;}
  async line(){while(true){for(let i=0;i<this.buffer.length-1;i++)if(this.buffer[i]===13&&this.buffer[i+1]===10){const value=decoder.decode(this.buffer.subarray(0,i));this.buffer=this.buffer.slice(i+2);return value;}if(this.buffer.length>131072)throw new Error('IMAP_LINE_LIMIT');await this.more();}}
  async bytes(size){if(size>2500000)throw new Error('IMAP_MESSAGE_LIMIT');while(this.buffer.length<size)await this.more();const out=this.buffer.slice(0,size);this.buffer=this.buffer.slice(size);return out;}
  async command(command){
    const tag='C'+(++this.sequence);const data=encoder.encode(tag+' '+command+'\r\n');let written=0;
    while(written<data.length)written+=await this.conn.write(data.subarray(written));
    const lines=[],literals=[];let size=0;
    for(let i=0;i<10000;i++){
      const line=await this.line();lines.push(line);size+=line.length;if(size>4000000)throw new Error('IMAP_RESPONSE_LIMIT');
      if(line.startsWith(tag+' ')){if(!line.startsWith(tag+' OK'))throw new Error(command.startsWith('LOGIN')?'IMAP_AUTH':'IMAP_COMMAND');return {lines,literals};}
      const literal=line.match(/\{(\d+)\}$/);if(literal){const bytes=await this.bytes(Number(literal[1]));size+=bytes.length;literals.push(bytes);}
    }
    throw new Error('IMAP_RESPONSE_LIMIT');
  }
  async login(user,password){if(!/^\* (?:OK|PREAUTH)/i.test(await this.line()))throw new Error('IMAP_GREETING');await this.command('LOGIN '+quote(user)+' '+quote(password));}
  async folders(){
    const {lines,literals}=await this.command('LIST "" "*"');const out=[{name:'INBOX',direction:'received'}];let literalIndex=0;
    for(const line of lines){
      if(!/^\* LIST /i.test(line))continue;
      const name=/\{\d+\}$/.test(line)?decoder.decode(literals[literalIndex++]||new Uint8Array()):line.match(/ "((?:[^"\\]|\\.)*)"$/)?.[1]?.replace(/\\(["\\])/g,'$1')||line.match(/ ([^ ]+)$/)?.[1];
      if(!/\\Sent\b/i.test(line)&&! /^(?:Sent(?: Messages| Items)?|보낸\s*메일(?:함)?|발신함)$/i.test(decodeFolder(name)))continue;
      if(name&&!out.some(x=>x.name===name))out.push({name,direction:'sent'});
    }
    return out;
  }
  async examine(folder){const r=await this.command('EXAMINE '+quote(folder));const validity=r.lines.join('\n').match(/UIDVALIDITY (\d+)/i)?.[1];if(!validity)throw new Error('IMAP_UIDVALIDITY');return validity;}
  async search(lastUid,since){const r=await this.command('UID SEARCH '+(lastUid?'UID '+(Number(lastUid)+1)+':*':'SINCE '+since));return r.lines.filter(l=>/^\* SEARCH(?: |$)/i.test(l)).flatMap(l=>l.replace(/^\* SEARCH\s*/i,'').trim().split(/\s+/).map(Number)).filter(n=>Number.isSafeInteger(n)&&n>Number(lastUid||0)).sort((a,b)=>a-b);}
  async header(uid){const r=await this.command(`UID FETCH ${Number(uid)} (RFC822.SIZE BODY.PEEK[HEADER])`);return {size:Number(r.lines.join(' ').match(/RFC822.SIZE (\d+)/i)?.[1]||0),raw:r.literals[0]||new Uint8Array()};}
  async message(uid){const r=await this.command(`UID FETCH ${Number(uid)} (BODY.PEEK[])`);return r.literals[0]||new Uint8Array();}
  close(){try{this.conn.close();}catch{}}
}
