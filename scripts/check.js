'use strict';

/** Cross-platform syntax check for every JavaScript source file (used by `npm run check` and CI). */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = ['.', 'src', 'public/js', 'scripts', 'tests'];

const files = DIRS.flatMap((dir) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(ROOT, dir, f)));

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    process.stderr.write(`✗ ${path.relative(ROOT, file)}\n${err.stderr}\n`);
  }
}
console.log(`${files.length - failed}/${files.length} files passed syntax check`);
process.exitCode = failed ? 1 : 0;
