#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const [baselineArg, targetArg] = process.argv.slice(2);
if (!baselineArg || !targetArg) throw new Error('usage: stage-alpha23-candidate2.mjs <verified-c8k-root> <new-output-root>');
const baseline = resolve(baselineArg), target = resolve(targetArg);
execFileSync(process.execPath, ['packaging/common/stage-alpha23.mjs', baseline, target], { stdio: 'inherit' });
execFileSync(process.execPath, ['packaging/common/apply-alpha23-candidate2.cjs', target], { stdio: 'inherit' });
