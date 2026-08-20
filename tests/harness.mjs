import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createInstrumenter } from 'istanbul-lib-instrument';

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(here, '..');
export const SOURCE_PATH = resolve(ROOT, 'index.html');
export const SCRIPT_NAME = resolve(ROOT, 'index.html.inline.js');
export const COVERAGE_TMP = resolve(ROOT, 'coverage', 'tmp');

const html = readFileSync(SOURCE_PATH, 'utf8');

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) throw new Error('inline <script> block not found in index.html');

/** The inline script extracted from index.html, as measured by the coverage report. */
export const inlineScript = scriptMatch[1];
const htmlWithoutScript = html.replace(scriptMatch[0], '</body>');

const instrumenter = createInstrumenter({ esModules: false, produceSourceMap: false });
// `let`/`const` declarations of the inline script are not reachable from the
// outside, so expose a direct-eval bridge that runs inside the script scope.
const instrumentedScript = `${instrumenter.instrumentSync(inlineScript, SCRIPT_NAME)}\n;window.__evalInScript = function (expression) { return eval(expression); };`;

/**
 * Boot index.html in jsdom with its inline script instrumented for coverage.
 * Returns the jsdom window plus helpers to read/write script-local bindings
 * (`const`/`let` declarations are not exposed as window properties).
 */
export function loadApp() {
  const dom = new JSDOM(htmlWithoutScript, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.eval(instrumentedScript);

  return {
    dom,
    window,
    /** Read a script-local binding such as `state`, `els` or `INSTALL_METHODS`. */
    get: name => window.__evalInScript(name),
    /** Assign to a script-local binding, e.g. set('state.installMethod', '"conda"'). */
    set: (target, valueExpression) => window.__evalInScript(`${target} = ${valueExpression}`),
    /** Persist collected coverage and tear down the window. */
    dispose() {
      const coverage = window.__coverage__;
      if (coverage) {
        mkdirSync(COVERAGE_TMP, { recursive: true });
        writeFileSync(resolve(COVERAGE_TMP, `${randomUUID()}.json`), JSON.stringify(coverage));
      }
      window.close();
    }
  };
}

/** Config object matching the shape returned by the app's `getConfig()`. */
export function makeConfig(overrides = {}) {
  return {
    installMethod: 'yum',
    os: 'centos',
    arch: 'x86_64',
    cannVersion: '8.0.RC3',
    chipType: '910b',
    userType: 'root',
    installPath: '/usr/local/Ascend',
    driverScene: 'first',
    installDriver: true,
    installToolkit: true,
    installKernels: true,
    installNnal: false,
    pythonVersion: '3.10',
    condaEnv: 'cann-env',
    condaChannel: 'https://repo.huaweicloud.com/ascend/cann',
    yumRepoUrl: 'https://repo.huaweicloud.com/ascend/cann',
    ...overrides
  };
}
