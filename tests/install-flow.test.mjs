import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, makeConfig } from './harness.mjs';

describe('terminal and step flow', () => {
  let app;
  let win;
  let els;

  beforeEach(() => {
    app = loadApp();
    win = app.window;
    els = app.get('els');
  });
  afterEach(() => app.dispose());

  describe('terminal helpers', () => {
    it('appends escaped text lines with the given class', () => {
      win.appendTerminal('a < b', 'term-info');
      const line = els.terminal.lastElementChild;
      expect(line.className).toBe('term-line term-info');
      expect(line.innerHTML).toBe('a &lt; b');
      expect(line.textContent).toBe('a < b');
    });

    it('appends raw html lines', () => {
      win.appendTerminalHtml('<b>ok</b>');
      expect(els.terminal.lastElementChild.querySelector('b').textContent).toBe('ok');
    });

    it('keeps at most one prompt line and removes it before new output', () => {
      win.addPromptLine();
      win.addPromptLine();
      expect(els.terminal.querySelectorAll('.term-prompt-line')).toHaveLength(1);
      expect(win.getPromptLine()).not.toBeNull();
      win.appendTerminal('output');
      expect(win.getPromptLine()).toBeNull();
      win.removePromptLine();
      expect(win.getPromptLine()).toBeNull();
    });
  });

  describe('setRunning / setProgress', () => {
    it('disables the run buttons and expands the panel while running', () => {
      win.setRunning(true, els.runInstallBtn);
      expect(app.get('state.isRunning')).toBe(true);
      expect(els.runCheckBtn.disabled).toBe(true);
      expect(els.titlebarRunInstallBtn.disabled).toBe(true);
      expect(els.runInstallBtn.classList.contains('running')).toBe(true);
      expect(els.bottomPanel.classList.contains('expanded')).toBe(true);
      expect(els.termViz.classList.contains('running')).toBe(true);

      win.setRunning(false, els.runInstallBtn);
      expect(els.runInstallBtn.classList.contains('running')).toBe(false);
      expect(els.bottomPanel.classList.contains('expanded')).toBe(false);
    });

    it('renders a rounded percentage and an optional label', () => {
      win.setProgress(42.4, '安装中');
      expect(els.termProgressFill.style.width).toBe('42.4%');
      expect(els.termVizPct.textContent).toBe('42%');
      expect(els.termVizLabel.textContent).toBe('安装中');

      win.setProgress(100);
      expect(els.termVizPct.textContent).toBe('100%');
      expect(els.termVizLabel.textContent).toBe('安装中');
    });
  });

  describe('buildPipeline / updateChip', () => {
    it('renders one chip per step and activates the card for installs', () => {
      win.buildPipeline([{ id: 'a', label: 'A' }, { id: 'b', label: 'B', state: 'done' }], 'install');
      const chips = els.stepPipeline.querySelectorAll('.step-chip');
      expect(chips).toHaveLength(2);
      expect(chips[1].className).toContain('done');
      expect(els.installStepCard.classList.contains('active')).toBe(true);

      win.buildPipeline([{ id: 'a', label: 'A' }], 'check');
      expect(els.installStepCard.classList.contains('active')).toBe(false);
    });

    it('updates the state class of a single chip and ignores unknown ids', () => {
      win.buildPipeline([{ id: 'a', label: 'A' }], 'check');
      win.updateChip('a', 'running');
      expect(els.stepPipeline.querySelector('[data-id="a"]').className).toBe('step-chip running');
      expect(() => win.updateChip('missing', 'done')).not.toThrow();
    });
  });

  describe('showStepCard', () => {
    it('shows the current phase and hides the card past the last step', () => {
      const cfg = makeConfig({ installMethod: 'conda' });
      app.set('installState.cfg', JSON.stringify(cfg));
      app.set('installState.phases', JSON.stringify(win.getInstallPhases(cfg)));

      win.showStepCard(1);
      expect(els.stepCardContainer.style.display).toBe('block');
      expect(els.stepBadge.textContent).toBe('步骤 2/3');
      expect(els.stepTitle.textContent).toBe('安装 Toolkit');
      expect(els.stepCommand.textContent).toContain('conda install -y cann-toolkit=');

      win.showStepCard(3);
      expect(els.stepCardContainer.style.display).toBe('none');
    });
  });

  describe('toggleModify / applyModify', () => {
    const withPhases = () => {
      const cfg = makeConfig({ installMethod: 'yum' });
      app.set('installState.cfg', JSON.stringify(cfg));
      app.set('installState.phases', JSON.stringify(win.getInstallPhases(cfg)));
      app.set('installState.currentStep', '0');
    };

    it('toggles the input and clears it when opening', () => {
      els.modifyInput.value = 'stale';
      win.toggleModify();
      expect(els.stepModifyInput.style.display).toBe('block');
      expect(els.modifyInput.value).toBe('');
      win.toggleModify();
      expect(els.stepModifyInput.style.display).toBe('none');
    });

    it('translates the phrase into a command and stores it on the phase', () => {
      withPhases();
      win.showStepCard(0);
      els.modifyInput.value = '安装 vim';
      win.applyModify();
      expect(app.get('installState.phases')[0].cmd).toBe('yum install -y vim');
      expect(els.stepCommand.textContent).toBe('yum install -y vim');
      expect(els.stepModifyInput.style.display).toBe('none');
      expect(els.toast.textContent).toBe('命令已修改: 安装 vim → yum install -y vim');
    });

    it('ignores an empty phrase', () => {
      withPhases();
      const original = app.get('installState.phases')[0].cmd;
      els.modifyInput.value = '   ';
      win.applyModify();
      expect(app.get('installState.phases')[0].cmd).toBe(original);
    });
  });

  describe('skipStep', () => {
    const startRun = method => {
      const cfg = makeConfig({ installMethod: method });
      app.set('installState.cfg', JSON.stringify(cfg));
      app.set('installState.phases', JSON.stringify(win.getInstallPhases(cfg)));
      app.set('installState.currentStep', '0');
      win.buildPipeline(app.get('installState.phases').map(p => ({ id: p.id, label: p.label })), 'install');
      win.showStepCard(0);
    };

    it('advances to the next step and logs the skip', () => {
      startRun('conda');
      win.skipStep();
      expect(app.get('installState.currentStep')).toBe(1);
      expect(els.terminal.textContent).toContain('跳过步骤 1: Python 版本选择');
      expect(els.stepBadge.textContent).toBe('步骤 2/3');
      expect(els.stepPipeline.querySelector('[data-id="s1"]').className).toContain('done');
    });

    it('finishes the run when the last step is skipped', () => {
      startRun('conda');
      win.skipStep();
      win.skipStep();
      win.skipStep();
      expect(els.stepCardContainer.style.display).toBe('none');
      expect(els.termVizLabel.textContent).toBe('安装完成（部分步骤已跳过）');
      expect(els.termVizPct.textContent).toBe('100%');
      expect(els.terminal.textContent).toContain('在线安装 (Conda) 完成（部分步骤已跳过）');
      expect(win.getPromptLine()).not.toBeNull();
    });
  });

  describe('getInstallTabLabel', () => {
    it('describes the active method and its step count', () => {
      app.set('state.installMethod', '"runfile"');
      win.updateInstallMethodUI(false);
      expect(win.getInstallTabLabel()).toBe('install_cann_runfile.sh — 离线安装 (Runfile)（4 步，见下方命令）');
    });
  });

  describe('buildMockOutput', () => {
    it('contains a numbered block per check step', () => {
      const output = win.buildMockOutput();
      const steps = app.get('CHECK_STEPS');
      expect(output).toContain('  CANN 环境检查');
      steps.forEach((s, i) => {
        expect(output).toContain(`[${i + 1}/${steps.length}] ${s.name}`);
        expect(output).toContain(`>>> ${s.cmd}`);
      });
      expect(output.trimEnd().endsWith('==========================================')).toBe(true);
    });
  });

  describe('copyText', () => {
    it('falls back to selecting the editor when the clipboard is unavailable', async () => {
      win.navigator.clipboard = { writeText: () => Promise.reject(new Error('denied')) };
      win.document.execCommand = () => true;
      win.copyText('hello');
      await new Promise(resolve => win.setTimeout(resolve, 0));
      expect(els.toast.textContent).toBe('已复制到剪贴板');
    });
  });

  describe('showToast', () => {
    it('shows the message and hides it again after the timeout', () => {
      win.showToast('hi');
      expect(els.toast.textContent).toBe('hi');
      expect(els.toast.classList.contains('show')).toBe(true);
    });
  });

  describe('toggleSidebar', () => {
    it('expands the collapsed sidebar and swaps the toggle label', () => {
      expect(els.sidebar.classList.contains('collapsed')).toBe(true);

      win.toggleSidebar();
      expect(els.sidebar.classList.contains('collapsed')).toBe(false);
      expect(els.toggleConfigBtn.textContent).toBe('✕ 关闭');
      expect(els.titlebarRunCheckBtn.disabled).toBe(true);

      win.toggleSidebar();
      expect(els.sidebar.classList.contains('collapsed')).toBe(true);
      expect(els.toggleConfigBtn.textContent).toBe('⚙ 配置');
      expect(els.titlebarRunCheckBtn.disabled).toBe(false);
    });
  });
});
