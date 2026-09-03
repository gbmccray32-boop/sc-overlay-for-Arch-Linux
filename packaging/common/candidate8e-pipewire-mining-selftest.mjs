import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=process.argv[2];
if(!root) throw new Error('usage: candidate8e-pipewire-mining-selftest.mjs <root>');
const require=createRequire(import.meta.url);
const gate=require(path.join(root,'app/electron/scan-mode-gate.cjs'));
const catalog=require(path.join(root,'app/electron/mining-signature-catalog.cjs'));
const capture=await readFile(path.join(root,'app/electron/capture.cjs'),'utf8');
const server=await readFile(path.join(root,'app/server/server.mjs'),'utf8');
const pkg=JSON.parse(await readFile(path.join(root,'app/package.json'),'utf8'));
const must=(v,m)=>{if(!v) throw new Error(m)};
function decode(row){const packed=Buffer.from(row.bits,'base64'); const mask=new Uint8Array(row.width*row.height); for(let i=0;i<mask.length;i++) mask[i]=(packed[i>>3]>>(i&7))&1; return {...row,mask};}
function resize(src,w,h){const mask=new Uint8Array(w*h); for(let oy=0;oy<h;oy++) for(let ox=0;ox<w;ox++){const x0=ox*src.width/w,x1=(ox+1)*src.width/w,y0=oy*src.height/h,y1=(oy+1)*src.height/h; let covered=0,total=0; for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++) for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){const overlap=Math.max(0,Math.min(sx+1,x1)-Math.max(sx,x0))*Math.max(0,Math.min(sy+1,y1)-Math.max(sy,y0));total+=overlap;covered+=overlap*src.mask[sy*src.width+sx];} if(total&&covered/total>=0.12) mask[oy*w+ox]=1;} return {width:w,height:h,mask};}
function frameFor(keep=1){const W=960,H=548; const src=decode(gate.RADAR_REFERENCE_BITS.find(r=>r.reference===90)); const tpl=resize(src,Math.round(18*src.width/src.height),18); const frame=Buffer.alloc(W*H*4); const rx=Math.round(W*0.487),ry=Math.round(H*0.476); let n=0; for(let y=0;y<tpl.height;y++)for(let x=0;x<tpl.width;x++)if(tpl.mask[y*tpl.width+x]){if(((n++%100)/100)>=keep) continue; const i=((ry+y)*W+(rx+x))*4; frame[i]=90;frame[i+1]=230;frame[i+2]=245;frame[i+3]=255;} return {frame,W,H};}
let f=frameFor(1); let radar=gate.detectScanModeRadarIcon(f.frame,f.W,f.H);
must(radar.active===true && radar.visionWake===true && radar.authorityCandidate===true,`full radar reference rejected: ${JSON.stringify(radar)}`);
f=frameFor(0.5); radar=gate.detectScanModeRadarIcon(f.frame,f.W,f.H);
must(radar.active===false && radar.visionWake===true,`degraded radar should wake vision without gaining authority: ${JSON.stringify(radar)}`);
radar=gate.detectScanModeRadarIcon(Buffer.alloc(960*548*4),960,548);
must(radar.active===false && radar.visionWake===false && radar.authorityCandidate===false,'blank frame gained radar evidence');
must(catalog.classifyMiningSignature(11700).valid,'11700 lost');
must(catalog.classifyMiningSignature(17200).valid,'17200 lost');
must(!catalog.classifyMiningSignature(2504).valid,'2504 false positive');
must(pkg.version==='0.1.44-r31.alpha22.candidate8e',`wrong package identity ${pkg.version}`);
for(const marker of ['ARCHVERSE_LINUX_PIPEWIRE_MINING_VISION_CADENCE','ARCHVERSE_LINUX_PIPEWIRE_MINING_VISION_WAKE','ARCHVERSE_LINUX_PIPEWIRE_MINING_VISION_NUMERIC_FALLBACK','ARCHVERSE_LINUX_PIPEWIRE_MINING_RADAR_RS_AUTHORITY']) must(capture.includes(marker),`missing ${marker}`);
must(capture.includes('const MINING_VISION_IDLE_MS = 1200;'),'Mining visual cadence changed');
must(capture.includes('const MINING_NUMERIC_FALLBACK_MS = 3000;'),'numeric fallback cadence changed');
must(capture.includes('const MINING_RADAR_LATCH_MS = 1800;'),'radar latch changed');
must(capture.includes('archScanModeRead.visionWake === true || archScanModeRead.authorityCandidate === true'),'PipeWire pixel wake missing');
must(capture.includes('process.platform === "linux"\n          && (miningVisionWake || typeof read.signature === "number")'),'Linux fast mode is not vision/signature driven');
must(capture.includes('const confirmed = archScanModeRead.authorityCandidate === true'),'radar authority candidate missing');
must(!capture.includes('const confirmed = glyph.seen && archScanModeRead.active === true;'),'glyph veto returned');
must(!capture.includes('detectScanModeDualWitness(normalized.toBitmap()'),'status witness returned to active path');
must(server.includes('ARCHVERSE_LINUX_MINING_RADAR_RS_AUTHORITY_SERVER'),'server radar+RS contract missing');
console.log('Candidate 8e self-test OK: PipeWire pixels drive Mining wake/cadence; exact RS + radar remains commit authority');
