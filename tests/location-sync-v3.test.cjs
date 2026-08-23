'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const mod = require(path.join(__dirname, '..', 'packaging', 'common', 'location-sync-v3.cjs'));

const daymar = mod.parseDisplayInfoLines([
  'Zone: 00c Stanton 2b Daymar Pos: 200.5523km -104.9073km 190.0951km',
  'Zone: SolarSystem 742312208505 Pos: -18930616.1288km -2609945.7846km 190.0951km',
  'Zone: Ro0t Pos: -18930616.1288km -2609945.7846km 190.0951km',
  'Current player location : Stanton2b EMshelter EagerFlats  (LZ : Stanton2b EMShelter EagerFlats)',
  'Planet:ooc Stanton 2b Daymar (working) (Load Complete)',
]);
assert.equal(daymar.ok, true);
assert.equal(daymar.frame, 'body');
assert.equal(daymar.body, 'Daymar');
assert.equal(daymar.system, 'Stanton');
assert.deepEqual(daymar.pos, { x: 200552.3, y: -104907.3, z: 190095.1 });

const daymarDamagedLabels = mod.parseDisplayInfoLines([
  'Zone: 00c Stanton 2b Daymar Pos: 200.5523km -104.9073km 190.0951km',
  'Zone: SolarSystem 742312208505 Pos: -18930616.1288km -2609945.7846km 190.0951km',
  'Zone: Ro0t Pos: -18930616.1288km -2609945.7846km 190.0951km',
]);
assert.equal(daymarDamagedLabels.ok, true);
assert.equal(daymarDamagedLabels.frame, 'body');
assert.equal(daymarDamagedLabels.body, 'Daymar');

const eager = mod.nearestActiveStop([
  { id: '@eager', pos: { x: 200545.063566, y: -104917.273995, z: 190096.594760 }, meta: { name: 'Eager Flats Aid Shelter', parentName: 'Daymar', system: 'Stanton System', star: 'Stanton' } },
  { id: '@wrong-body', pos: { ...daymar.pos }, meta: { name: 'Coincidental Point', parentName: 'Yela', system: 'Stanton System', star: 'Stanton' } },
], daymar, 12000);
assert.equal(eager.id, '@eager');
assert.ok(eager.metres < 20, `Eager Flats should be within 20m, got ${eager.metres}`);

const levski = mod.parseDisplayInfoLines([
  'Zone: Hangar LargeFront Levski Nyx 718235905257 Pos: -0.00m -219.64m 6.57m',
  'Zone: levski all-001 Pos: 384.75m 1207.59m 2452.29m',
  'Zone: SolarSystem 729696722768 Pos: -9641671.0001km -11490733.6711km -91.8108km',
  'Zone: Ro0t Pos: -9641671.0001km -11490733.6711km -91.8108km',
  'Current player location : Nyx Levski (Lz : Nyx Levski)',
  'No Current Planet',
]);
assert.equal(levski.ok, true);
assert.equal(levski.frame, 'system');
assert.equal(levski.system, 'Nyx');
const levskiMatch = mod.nearestActiveStop([
  { id: '@levski', pos: { x: -9641672902.9, y: -11490734473.5, z: -93642.6 }, meta: { name: 'Levski', parentName: 'Nyx', system: 'Nyx System', star: 'Nyx' } },
  { id: '@wrong-system', pos: { ...levski.pos }, meta: { name: 'Wrong', parentName: 'Daymar', system: 'Stanton System', star: 'Stanton' } },
], levski, 12000);
assert.equal(levskiMatch.id, '@levski');
assert.ok(levskiMatch.metres > 2700 && levskiMatch.metres < 2800, `Levski snap distance unexpected: ${levskiMatch.metres}`);

const crop = mod.locationCropGeometry(6360, 2160);
assert.deepEqual(crop.crop, { x: 3960, y: 0, width: 2400, height: 900 });
assert.equal(crop.target.width, 3600);
assert.equal(crop.target.height, 1350);
console.log('Location Sync V3 parser/matcher fixtures: PASS');
