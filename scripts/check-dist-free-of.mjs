#!/usr/bin/env node
/**
 * Walks a built dist directory and fails if any `.js` file contains one of
 * the given needles in its content, or has one of them in its file name.
 * MIM-332 (unit F5) adds this gate for the admin production build: the
 * owner does not want any mock (MSW) code in the admin production dist,
 * and nothing in CI inspected the built output before this script existed.
 * The file-name check catches a copied `mockServiceWorker.js` even where
 * its content never spells out the needle.
 *
 * Usage: node scripts/check-dist-free-of.mjs <dir> <needle> [<needle>...]
 *
 * Exit code:
 *   0  - no `.js` file under <dir> matches any needle by content or name
 *   1  - at least one `.js` file under <dir> matches a needle
 *   2  - the arguments are missing, <dir> does not exist, or it holds no
 *        `.js` file (so a missing build can never pass)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const [, , dir, ...needles] = process.argv;

if (!dir || needles.length === 0) {
  console.log(
    'check-dist-free-of: usage: node scripts/check-dist-free-of.mjs <dir> <needle> [<needle>...]',
  );
  process.exit(2);
}

if (!existsSync(dir)) {
  console.log(`check-dist-free-of: directory does not exist: ${dir}`);
  process.exit(2);
}

function findJsFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        stack.push(path);
      } else if (path.endsWith('.js')) {
        files.push(path);
      }
    }
  }
  return files;
}

const jsFiles = findJsFiles(dir);

if (jsFiles.length === 0) {
  console.log(`check-dist-free-of: no .js file found under ${dir}`);
  process.exit(2);
}

const needleList = needles.map((needle) => `"${needle}"`).join(', ');

function matches(file) {
  const name = basename(file);
  if (needles.some((needle) => name.includes(needle))) {
    return true;
  }
  const content = readFileSync(file, 'utf8');
  return needles.some((needle) => content.includes(needle));
}

const offending = jsFiles.filter(matches);

if (offending.length > 0) {
  console.log(
    `check-dist-free-of: FAIL (${offending.length} of ${jsFiles.length} files contain ${needleList})`,
  );
  for (const file of offending) {
    console.log(file);
  }
  process.exit(1);
}

console.log(`check-dist-free-of: OK (${jsFiles.length} files, no ${needleList})`);
process.exit(0);
