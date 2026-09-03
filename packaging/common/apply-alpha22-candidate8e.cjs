#!/usr/bin/env node
"use strict";
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const zlib=require('node:zlib');
const {spawnSync}=require('node:child_process');
const root=process.argv[2];
if(!root) throw new Error('usage: apply-alpha22-candidate8e.cjs <staged-candidate8d-root>');
const must=(v,m)=>{if(!v) throw new Error(`Candidate 8e apply: ${m}`)};
const here=__dirname;
const packagePath=path.join(root,'app/package.json');
const capturePath=path.join(root,'app/electron/capture.cjs');
const gatePath=path.join(root,'app/electron/scan-mode-gate.cjs');
const serverPath=path.join(root,'app/server/server.mjs');
for(const p of [packagePath,capturePath,gatePath,serverPath]) must(fs.existsSync(p),`missing ${path.relative(root,p)}`);
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
must(String(pkg.version||'')==='0.1.44-r31.alpha22.candidate8d',`expected exact Candidate 8d base, got ${pkg.version}`);
const beforeCapture=fs.readFileSync(capturePath,'utf8');
must(beforeCapture.includes('ARCHVERSE_LINUX_MINING_RADAR_RS_AUTHORITY'),'Candidate 8d radar+RS base marker missing');
must(beforeCapture.includes('ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_STATE_V2'),'Candidate 8c PipeWire recovery marker missing');
const encoded=[1,2,3,4].map(n=>fs.readFileSync(path.join(here,`candidate8e-patch-0${n}.b64`),'utf8').trim()).join('');
const patch=zlib.gunzipSync(Buffer.from(encoded,'base64'));
const digest=crypto.createHash('sha256').update(patch).digest('hex');
must(digest==='86fcd681f86f1e3ecf0a146d800462c96c038b7a61398c35023cfacc3dcaf806',`patch digest mismatch: ${digest}`);
const patchPath=path.join(os.tmpdir(),`archverse-candidate8e-${process.pid}.patch`);
try{
  fs.writeFileSync(patchPath,patch);
  const result=spawnSync('patch',['-p1','--fuzz=0','-i',patchPath],{cwd:root,encoding:'utf8'});
  if(result.status!==0) throw new Error(`zero-fuzz patch failed\n${result.stdout||''}\n${result.stderr||''}`);
} finally { try{fs.unlinkSync(patchPath)}catch{} }
const check=spawnSync(process.execPath,[path.join(here,'candidate8e-pipewire-mining-selftest.mjs'),root],{encoding:'utf8'});
process.stdout.write(check.stdout||''); process.stderr.write(check.stderr||'');
if(check.status!==0) process.exit(check.status||1);
console.log(`Candidate 8e zero-fuzz patch applied; sha256=${digest}`);
