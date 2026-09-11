#!/usr/bin/env node
import { cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const [baselineArg, targetArg] = process.argv.slice(2);
if (!baselineArg || !targetArg) throw new Error('usage: stage-alpha23-candidate3.mjs <verified-candidate2-root> <new-output-root>');
const baseline = resolve(baselineArg), target = resolve(targetArg);
cpSync(baseline, target, { recursive: true, force: false, errorOnExist: true });
execFileSync(process.execPath, ['packaging/common/apply-alpha23-candidate3.cjs', target], { stdio: 'inherit' });
