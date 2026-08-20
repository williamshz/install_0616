import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './harness.mjs';

describe('editor rendering', () => {
  let app;
  let win;
  let els;

  beforeEach(() => {
    app = loadApp();
    win = app.window;
    els = app.get('els');
  });
  afterEach(() => app.dispose());

  describe('escapeHtml', () => {
    it('escapes ampersands and angle brackets', () => {
      expect(win.escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
      expect(win.escapeHtml('<script>')).toBe('&lt;script&gt;');
    });
  });

  describe('highlightBash', () => {
    it('keeps blank lines and highlights the shebang and comments', () => {
      expect(win.highlightBash('')).toBe('');
      expect(win.highlightBash('#!/bin/bash')).toBe('<span class="hl-shebang">#!/bin/bash</span>');
      expect(win.highlightBash('  # note')).toBe('<span class="hl-comment">  # note</span>');
    });

    it('highlights variables in both $VAR and ${VAR} form', () => {
      expect(win.highlightBash('echo $HOME')).toContain('<span class="hl-var">$HOME</span>');
      expect(win.highlightBash('echo ${CONDA_PREFIX}')).toContain('<span class="hl-var">${CONDA_PREFIX}</span>');
    });

    it('highlights ./ commands and long flags', () => {
      const html = win.highlightBash('./setup --install');
      expect(html).toContain('<span class="hl-cmd">./setup</span>');
      expect(html).toContain('hl-flag');
    });

    it('classifies wildcard paths as globs (the glob rule runs before the ./ rule)', () => {
      const html = win.highlightBash('./Ascend-cann-toolkit_*.run --install');
      expect(html).toContain('<span class="hl-glob">Ascend-cann-toolkit_*.run</span>');
      expect(html).not.toContain('hl-cmd');
    });

    it('highlights keywords and builtin commands', () => {
      const html = win.highlightBash('if true; then yum install; fi');
      expect(html).toContain('<span class="hl-kw">if</span>');
      expect(html).toContain('<span class="hl-fn">yum</span>');
    });

    it('does not highlight inside quoted strings', () => {
      const html = win.highlightBash('echo "yum install if"');
      expect(html).toContain('<span class="hl-string">"yum install if"</span>');
      expect(html.match(/hl-fn/g)).toBeNull();
    });

    it('escapes markup before highlighting', () => {
      expect(win.highlightBash('echo a<b')).not.toContain('a<b');
    });

    it('preserves the line count of the input', () => {
      const code = '#!/bin/bash\n\nyum install -y gcc\n# done';
      expect(win.highlightBash(code).split('\n')).toHaveLength(4);
    });
  });

  describe('setCodeContent / updateLineNumbers / syncHighlight', () => {
    it('fills the editor, the highlight layer and the gutter', () => {
      win.setCodeContent('line1\nline2\nline3');
      expect(els.codeEditor.value).toBe('line1\nline2\nline3');
      expect(els.lineNumbers.textContent).toBe('1\n2\n3');
      expect(els.codeHighlight.innerHTML).toContain('line1');
      expect(els.statusLine.textContent).toBe('行 3, 列 1');
    });

    it('re-renders the highlight layer from the editor value', () => {
      els.codeEditor.value = '#!/bin/bash';
      win.syncHighlight();
      expect(els.codeHighlight.innerHTML).toBe('<span class="hl-shebang">#!/bin/bash</span>');
    });
  });

  describe('showTab', () => {
    it.each([
      ['check', 'env_check.sh', '# CANN 安装前环境检查脚本'],
      ['env', 'set_env.sh', '# CANN 环境变量配置'],
      ['verify', 'verify_install.sh', '# CANN 安装验证']
    ])('loads the %s script and updates the labels', (tab, file, marker) => {
      win.showTab(tab);
      expect(app.get('state.activeTab')).toBe(tab);
      expect(els.codeEditor.value).toContain(marker);
      expect(win.document.querySelector('.titlebar-center strong').textContent).toBe(file);
      expect(els.fileLabel.textContent).toBe(app.get('tabLabels')[tab]);
      expect(win.document.querySelector(`.editor-tab[data-tab="${tab}"]`).classList.contains('active')).toBe(true);
    });

    it('describes the install method and step count on the install tab', () => {
      win.showTab('install');
      expect(els.fileLabel.textContent).toBe('install_cann_yum.sh — 在线安装 (Yum)（6 步，见下方命令）');
    });
  });

  describe('showPanel', () => {
    it('activates only the requested panel', () => {
      win.showPanel('packages');
      expect(app.get('state.activePanel')).toBe('packages');
      const active = [...win.document.querySelectorAll('.panel-content.active')].map(el => el.dataset.panel);
      expect(active).toEqual(['packages']);
    });
  });

  describe('generateAllCommands', () => {
    it('enables the full step list and reports the generated files', () => {
      app.set('state.showInstallSteps', 'false');
      win.generateAllCommands();
      expect(app.get('state.showInstallSteps')).toBe(true);
      expect(app.get('state.activeTab')).toBe('install');
      expect(els.codeEditor.value).toContain('#  步骤 6/6: 安装后验证');
      expect(els.checkSummary.textContent).toBe('已更新: install_cann_yum.sh、set_env.sh、verify_install.sh');
      expect(els.toast.textContent).toBe('已生成 在线安装 (Yum) 脚本，共 6 个步骤');
    });
  });

  describe('updateInstallMethodUI', () => {
    it('swaps the option group, file name and package list for conda', () => {
      app.set('state.installMethod', '"conda"');
      win.updateInstallMethodUI(true);
      expect(win.document.getElementById('condaOptions').classList.contains('active')).toBe(true);
      expect(win.document.getElementById('yumOptions').classList.contains('active')).toBe(false);
      expect(app.get('tabFiles').install).toBe('install_cann_conda.sh');
      expect(els.statusMode.textContent).toBe('安装: 在线安装 (Conda)');
      expect(els.editorMethodSelect.value).toBe('conda');
      expect(els.packageList.innerHTML).toContain('cann-toolkit=');
      expect(els.codeEditor.value).toContain('INSTALL_METHOD=conda');
    });

    it('lists the run packages and download hint for runfile', () => {
      app.set('state.installMethod', '"runfile"');
      win.updateInstallMethodUI(false);
      expect(els.packageList.innerHTML).toContain('昇腾社区');
      expect(els.packageList.innerHTML).toContain('Ascend-cann-toolkit_');
    });
  });

  describe('getConfig', () => {
    it('reads the form and derives the default install path per user type', () => {
      els.installPath.value = '';
      els.userType.value = 'root';
      expect(win.getConfig().installPath).toBe('/usr/local/Ascend');
      els.userType.value = 'nonroot';
      expect(win.getConfig().installPath).toBe('${HOME}/Ascend');
      els.installPath.value = '  /opt/Ascend  ';
      expect(win.getConfig().installPath).toBe('/opt/Ascend');
    });

    it('takes the chip type from the option group of the active method', () => {
      win.document.getElementById('chipTypeYum').value = '310p';
      els.chipType.value = '910';
      app.set('state.installMethod', '"yum"');
      expect(win.getConfig().chipType).toBe('310p');
      app.set('state.installMethod', '"runfile"');
      expect(win.getConfig().chipType).toBe('910');
    });

    it('reflects the component checkboxes', () => {
      els.installNnal.checked = true;
      els.installKernels.checked = false;
      const cfg = win.getConfig();
      expect(cfg.installNnal).toBe(true);
      expect(cfg.installKernels).toBe(false);
    });
  });

  describe('updateDefaultPathHint', () => {
    it('shows the default path for the selected user type', () => {
      els.userType.value = 'nonroot';
      win.updateDefaultPathHint();
      expect(els.defaultPathHint.textContent).toBe('默认: ~/Ascend');
      els.userType.value = 'root';
      win.updateDefaultPathHint();
      expect(els.defaultPathHint.textContent).toBe('默认: /usr/local/Ascend');
    });
  });

  describe('syncParamsFromConfig', () => {
    it('regenerates the install script when the editor is out of date', () => {
      win.showTab('install');
      els.codeEditor.value = 'stale';
      win.syncParamsFromConfig();
      expect(els.codeEditor.value).toContain('INSTALL_METHOD=yum');
    });

    it('leaves other tabs untouched', () => {
      win.showTab('check');
      els.codeEditor.value = 'stale';
      win.syncParamsFromConfig();
      expect(els.codeEditor.value).toBe('stale');
    });
  });
});
