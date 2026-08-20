import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './harness.mjs';

describe('event wiring', () => {
  let app;
  let win;
  let els;

  beforeEach(() => {
    app = loadApp();
    win = app.window;
    els = app.get('els');
    win.navigator.clipboard = { writeText: () => Promise.resolve() };
  });
  afterEach(() => app.dispose());

  const click = selector => win.document.querySelector(selector).click();
  const change = el => el.dispatchEvent(new win.Event('change', { bubbles: true }));

  it('switches tabs from the editor tab bar and the file tree', () => {
    click('.editor-tab[data-tab="env"]');
    expect(app.get('state.activeTab')).toBe('env');
    click('.tree-item[data-tab="verify"]');
    expect(app.get('state.activeTab')).toBe('verify');
  });

  it('switches bottom panels and refreshes the package list', () => {
    click('.panel-tab[data-panel="packages"]');
    expect(app.get('state.activePanel')).toBe('packages');
    expect(els.packageList.innerHTML).toContain('ascend-toolkit-');
  });

  it('switches the install method from the sidebar tabs', () => {
    click('.install-method-tab[data-method="runfile"]');
    expect(app.get('state.installMethod')).toBe('runfile');
    expect(app.get('state.activeTab')).toBe('install');
    expect(els.codeEditor.value).toContain('INSTALL_METHOD=runfile');
  });

  it('switches the install method from the editor toolbar select', () => {
    els.editorMethodSelect.value = 'conda';
    change(els.editorMethodSelect);
    expect(app.get('state.installMethod')).toBe('conda');
    expect(els.codeEditor.value).toContain('INSTALL_METHOD=conda');
  });

  it('regenerates the active tab when a config field changes', () => {
    win.showTab('install');
    els.cannVersion.value = els.cannVersion.options[els.cannVersion.options.length - 1].value;
    change(els.cannVersion);
    expect(els.codeEditor.value).toContain(`CANN_VERSION=${els.cannVersion.value}`);
  });

  it('updates the default path hint when the user type changes', () => {
    els.userType.value = 'nonroot';
    change(els.userType);
    expect(els.defaultPathHint.textContent).toBe('默认: ~/Ascend');
  });

  it('generates all commands from the toolbar button', () => {
    click('#generateBtn');
    expect(app.get('state.showInstallSteps')).toBe(true);
    expect(els.checkSummary.textContent).toContain('已更新:');
  });

  it('warns instead of parsing when the paste area is empty', () => {
    els.pasteOutput.value = '   ';
    click('#parseCheckOutput');
    expect(els.toast.textContent).toBe('请先粘贴或运行环境检查');
    expect(app.get('state.checkResults')).toEqual({});
  });

  it('parses the pasted output when the button is clicked', () => {
    els.pasteOutput.value = 'aarch64\nPRETTY_NAME="Ubuntu 22.04"';
    click('#parseCheckOutput');
    expect(app.get('state.checkResults').arch.status).toBe('pass');
    expect(els.os.value).toBe('ubuntu');
  });

  it('copies all scripts, the current script and selects the editor', () => {
    const copied = [];
    win.navigator.clipboard = { writeText: text => { copied.push(text); return Promise.resolve(); } };
    click('#copyBtn');
    click('#copyCurrentBtn');
    click('#selectAllBtn');
    expect(copied[0]).toContain('# === env_check.sh ===');
    expect(copied[0]).toContain('# === verify_install.sh ===');
    expect(copied[1]).toBe(els.codeEditor.value);
  });

  it('focuses the terminal panel and toggles the config sidebar', () => {
    click('#focusTerminal');
    expect(app.get('state.activePanel')).toBe('terminal');
    els.toggleConfigBtn.click();
    expect(els.sidebar.classList.contains('collapsed')).toBe(false);
  });

  it('applies a modified command when Enter is pressed in the modify input', async () => {
    win.setTimeout = callback => { callback(); return 0; };
    await win.simulateInstallRun();
    els.modifyInput.value = '查看内存';
    els.modifyInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(els.stepCommand.textContent).toBe('free -h');
  });

  it('ignores other keys in the modify input', async () => {
    win.setTimeout = callback => { callback(); return 0; };
    await win.simulateInstallRun();
    const original = els.stepCommand.textContent;
    els.modifyInput.value = '查看内存';
    els.modifyInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(els.stepCommand.textContent).toBe(original);
  });

  it('re-highlights and renumbers while typing in the editor', () => {
    els.codeEditor.value = '#!/bin/bash\nyum install -y gcc';
    els.codeEditor.dispatchEvent(new win.Event('input', { bubbles: true }));
    expect(els.codeHighlight.innerHTML).toContain('hl-shebang');
    expect(els.lineNumbers.textContent).toBe('1\n2');
  });

  it('keeps the gutter and highlight layer in sync while scrolling', () => {
    els.codeEditor.scrollTop = 40;
    els.codeEditor.scrollLeft = 12;
    els.codeEditor.dispatchEvent(new win.Event('scroll', { bubbles: true }));
    expect(els.lineNumbers.scrollTop).toBe(els.codeEditor.scrollTop);
    expect(els.codeHighlight.scrollLeft).toBe(els.codeEditor.scrollLeft);
  });

  it('runs the check and install simulations from the titlebar buttons', async () => {
    win.setTimeout = callback => { callback(); return 0; };
    els.titlebarRunCheckBtn.click();
    // the simulation is a promise chain of immediately resolved sleeps
    for (let i = 0; i < 2000; i++) await Promise.resolve();
    expect(app.get('state.activePanel')).toBe('results');
    expect(els.pasteOutput.value).toBe(app.get('MOCK_CHECK_OUTPUT'));
  });
});
