/**
 * Merges the per-window coverage produced by tests/harness.mjs and prints a
 * text summary plus an HTML report for the inline script of index.html.
 *
 * Usage: node tests/report-coverage.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { COVERAGE_TMP, ROOT, SCRIPT_NAME, inlineScript } from './harness.mjs';

const files = existsSync(COVERAGE_TMP) ? readdirSync(COVERAGE_TMP).filter(file => file.endsWith('.json')) : [];
if (!files.length) {
  console.error('No coverage data found — run `npm test` first.');
  process.exit(1);
}

// `tests/global-setup.mjs` empties this folder before every run, so only data
// measured against the current index.html is merged here.
const map = libCoverage.createCoverageMap({});
for (const file of files) map.merge(JSON.parse(readFileSync(resolve(COVERAGE_TMP, file), 'utf8')));

const outDir = resolve(ROOT, 'coverage');
// The measured script only exists inside index.html, so serve its source to the
// reporters instead of letting them read SCRIPT_NAME from disk.
const context = libReport.createContext({
  dir: outDir,
  coverageMap: map,
  defaultSummarizer: 'flat',
  sourceFinder: file => {
    if (file === SCRIPT_NAME) return inlineScript;
    return readFileSync(file, 'utf8');
  }
});
reports.create('text').execute(context);
reports.create('html', { subdir: 'html' }).execute(context);
writeFileSync(resolve(outDir, 'coverage-final.json'), JSON.stringify(map.toJSON()));

const summary = map.getCoverageSummary();
const uncovered = [];
for (const file of map.files()) {
  const data = map.fileCoverageFor(file).toJSON();
  for (const [id, meta] of Object.entries(data.fnMap)) {
    if (!data.f[id]) uncovered.push(`${meta.name} (line ${meta.decl.start.line})`);
  }
}

console.log(`\nUncovered functions (${uncovered.length}):`);
for (const name of uncovered.sort()) console.log(`  - ${name}`);
console.log(`\nFunctions ${summary.functions.pct}% | Statements ${summary.statements.pct}% | Branches ${summary.branches.pct}% | Lines ${summary.lines.pct}%`);
