const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path'); const vm=require('node:vm'); const Module=require('node:module');
const root=path.resolve(process.argv[2]); const canvas=fs.readFileSync(path.join(root,'app/server/overlay/canvas.js'),'utf8');
const begin=canvas.indexOf('const classifyOverlayPoint ='); const marker='window.__archverseClassifyOverlayPoint = classifyOverlayPoint;'; const end=canvas.indexOf(marker,begin); assert(begin>=0&&end>begin);
let elements=[],top=null; const scope={window:{},RSEL:'.widget',document:{querySelectorAll:()=>elements,elementFromPoint:()=>top},getComputedStyle:el=>el.style};
vm.runInNewContext(canvas.slice(begin,end+marker.length),scope); const hit=scope.window.__overlayClassifyPoint; assert.equal(hit,scope.window.__archverseClassifyOverlayPoint); assert.equal(hit(50,50).hit,false);
const widget={id:'w-logView',dataset:{},style:{display:'block',visibility:'visible',opacity:'1'},getBoundingClientRect:()=>({left:20,right:120,top:20,bottom:80,width:100,height:60}),getAttribute:()=>null};
elements=[widget]; assert.equal(hit(50,50).key,'w-logView'); assert.equal(hit(150,50).hit,false); assert.equal(hit(NaN,50).hit,false); widget.style.display='none'; assert.equal(hit(50,50).hit,false); widget.style.display='block'; top={closest:()=>widget}; assert.equal(hit(50,50).classification,'renderer-dom-hit');
assert(canvas.includes('window.__overlayReportRegions = (force = false) => reportRegions(force === true)')); assert(canvas.includes('if (!force && sig === lastRegions) return;'));
const original=Module._load; Module._load=function(request,parent,isMain){if(request==='electron')return{desktopCapturer:{},screen:{},nativeImage:{}};return original.call(this,request,parent,isMain)};
try{const capture=require(path.join(root,'app/electron/capture.cjs')); assert.equal(typeof capture.startFabCapture,'function')}finally{Module._load=original}
console.log('Alpha23 Linux bridge passed: first-F hit/miss, forced regions, capture evaluation');
