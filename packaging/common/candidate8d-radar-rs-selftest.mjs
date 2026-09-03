import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=process.argv[2];
if(!root) throw new Error('usage: selftest <root>');
const require=createRequire(import.meta.url);
const gate=require(path.join(root,'app/electron/scan-mode-gate.cjs'));
const catalog=require(path.join(root,'app/electron/mining-signature-catalog.cjs'));
const capture=await readFile(path.join(root,'app/electron/capture.cjs'),'utf8');
const server=await readFile(path.join(root,'app/server/server.mjs'),'utf8');
const must=(v,m)=>{if(!v) throw new Error(m)};
function decode(row){const packed=Buffer.from(row.bits,'base64'); const mask=new Uint8Array(row.width*row.height); for(let i=0;i<mask.length;i++) mask[i]=(packed[i>>3]>>(i&7))&1; return {...row,mask};}
function resize(src,w,h){const mask=new Uint8Array(w*h); for(let oy=0;oy<h;oy++) for(let ox=0;ox<w;ox++){ const x0=ox*src.width/w,x1=(ox+1)*src.width/w,y0=oy*src.height/h,y1=(oy+1)*src.height/h; let covered=0,total=0; for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++) for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){const overlap=Math.max(0,Math.min(sx+1,x1)-Math.max(sx,x0))*Math.max(0,Math.min(sy+1,y1)-Math.max(sy,y0)); total+=overlap; covered+=overlap*src.mask[sy*src.width+sx];} if(total && covered/total>=0.12) mask[oy*w+ox]=1;} return {width:w,height:h,mask};}
const W=960,H=548; const src=decode(gate.RADAR_REFERENCE_BITS.find(r=>r.reference===90)); const tpl=resize(src,Math.round(18*src.width/src.height),18); const frame=Buffer.alloc(W*H*4); const rx=Math.round(W*0.487), ry=Math.round(H*0.476); for(let y=0;y<tpl.height;y++)for(let x=0;x<tpl.width;x++)if(tpl.mask[y*tpl.width+x]){const i=((ry+y)*W+(rx+x))*4; frame[i]=90; frame[i+1]=230; frame[i+2]=245; frame[i+3]=255;}
const radar=gate.detectScanModeRadarIcon(frame,W,H); must(radar.active===true,`radar-only detector rejected reference: ${JSON.stringify(radar)}`);
must(catalog.classifyMiningSignature(11700).valid,'11700 lost');
must(catalog.classifyMiningSignature(17200).valid,'17200 lost');
must(!catalog.classifyMiningSignature(2504).valid,'2504 false positive');
must(capture.includes('ARCHVERSE_LINUX_SCAN_MODE_RADAR_ONLY_AUTHORITY'),'radar-only marker missing');
must(capture.includes('ARCHVERSE_LINUX_MINING_RADAR_RS_AUTHORITY'),'radar+RS marker missing');
must(capture.includes('const confirmed = archScanModeRead.active === true;'),'authority is not radar-only after valid RS admission');
must(!capture.includes('const confirmed = glyph.seen && archScanModeRead.active === true;'),'glyph still vetoes authority');
must(!capture.includes('detectScanModeDualWitness(normalized.toBitmap()'),'signal-status pair still active');
must(!capture.includes('createScanModeAuthorityStabilizer();'),'pair temporal stabilizer still active');
must(server.includes('ARCHVERSE_LINUX_MINING_RADAR_RS_AUTHORITY_SERVER'),'server radar+RS marker missing');
must(server.includes('radar + current-RS authority required'),'server wording stale');
must(server.includes('radar+RS ${body?.confirmed === true ? "CONFIRMED" : "not confirmed"}'),'server mining log still claims glyph authority');
console.log('Candidate 8d self-test OK: authority is only structural radar icon + exact current-RS signature; status witness and glyph veto removed');
