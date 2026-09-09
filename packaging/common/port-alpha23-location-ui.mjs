#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [baseline, staged] = process.argv.slice(2);
if (!baseline || !staged) throw new Error('usage: port-alpha23-location-ui.mjs <c8k-root> <staged-root>');
const old = readFileSync(join(baseline, 'app/server/overlay/hauling.html'), 'utf8');
const target = join(staged, 'app/server/overlay/hauling.html');
let html = readFileSync(target, 'utf8');
const start = old.indexOf('  // ARCHVERSE_LOCATION_SYNC_V3_UI');
const end = old.indexOf('  function renderRoute()', start);
if (start < 0 || end < 0) throw new Error('Candidate 8k location UI seam missing');
const selector = '<select id="startPick"';
if (html.split(selector).length !== 2 || html.includes('id="syncLoc"')) throw new Error('Alpha23 start picker seam changed');
const selectEnd = html.indexOf('</select>', html.indexOf(selector)) + '</select>'.length;
html = html.slice(0, selectEnd) + '\n<button id="syncLoc" class="hbtn" type="button" title="Read your current position from r_DisplayInfo once.">Sync</button>\n<div id="syncMsg" role="status" style="display:none"></div>' + html.slice(selectEnd);
html = html.replace('</body>', '<script src="/archverse-location-sync.js"></script>\n</body>');
writeFileSync(join(staged, 'app/server/overlay/archverse-location-sync.js'), old.slice(start, end) + '\n$("syncLoc").addEventListener("click", syncLocation);\n');
writeFileSync(target, html);
console.log('Candidate 8k one-shot Location Sync UI restored');
