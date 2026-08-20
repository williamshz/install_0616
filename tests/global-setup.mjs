import { mkdirSync, rmSync } from 'node:fs';
import { COVERAGE_TMP } from './harness.mjs';

/**
 * Drop coverage collected by earlier runs: istanbul merges by source location,
 * so data measured against an older index.html would corrupt the report.
 */
export default function setup() {
  rmSync(COVERAGE_TMP, { recursive: true, force: true });
  mkdirSync(COVERAGE_TMP, { recursive: true });
}
