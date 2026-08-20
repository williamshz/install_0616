/**
 * Merges the per-window coverage produced by tests/harness.mjs and prints a
 * text summary plus an HTML report for the inline script of index.html.
 *
 * Usage: node tests/report-coverage.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import { COVERAGE_TMP, ROOT } from './harness.mjs';

if (!existsSync(COVERAGE_TMP)) {
  console.error('No coverage data found — run `npm test` first.');
  process.exit(1);
}

const map = libCoverage.createCoverageMap({});
for (const file of readdirSync(COVERAGE_TMP)) {
  if (file.endsWith('.json')) map.merge(JSON.parse(readFileSync(resolve(COVERAGE_TMP, file), 'utf8')));
}

const outDir = resolve(ROOT, 'coverage');
const context = libReport.createContext({ dir: outDir, coverageMap: map, defaultSummarizer: 'flat' });
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

rmSync(COVERAGE_TMP, { recursive: true, force: true });
mkdirSync(COVERAGE_TMP, { recursive: true });
