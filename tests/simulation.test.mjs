import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './harness.mjs';

/**
 * The simulated runs sleep between every terminal line. Running the timers
 * immediately keeps these tests fast while still exercising the real flow.
 */
describe('simulated runs', () => {
  let app;
  let win;
  let els;

  beforeEach(() => {
    app = loadApp();
    win = app.window;
    els = app.get('els');
    win.setTimeout = callback => { callback(); return 0; };
  });
  afterEach(() => app.dispose());

  describe('typeCommand', () => {
    it('types the command into a prompt line and drops the cursor when done', async () => {
      const line = await win.typeCommand('bash env_check.sh');
      expect(line.querySelector('.term-typing').textContent).toBe('bash env_check.sh');
      expect(line.querySelector('.term-cursor')).toBeNull();
    });
  });

  describe('animateInstallBar', () => {
    it('runs the progress bar from 0 to 100 percent', async () => {
      await win.animateInstallBar('安装 Toolkit', '正在执行...', 100);
      expect(els.installCardTitle.textContent).toBe('安装 Toolkit');
      expect(els.installCardSub.textContent).toBe('正在执行...');
      expect(els.installCardPct.textContent).toBe('100%');
      expect(els.installCardFill.style.width).toBe('100%');
    });
  });

  describe('simulateCheckRun', () => {
    it('runs every check, parses the output and hands over to the install tab', async () => {
      await win.simulateCheckRun();
      const steps = app.get('CHECK_STEPS');

      expect(els.sidebar.classList.contains('collapsed')).toBe(true);
      for (const [i, step] of steps.entries()) {
        expect(els.terminal.textContent).toContain(`[${i + 1}/${steps.length}] ${step.name}`);
        expect(els.terminal.textContent).toContain(`>>> ${step.cmd}`);
      }
      expect(els.stepPipeline.querySelector('[data-id="driver"]').className).toContain('warn');
      expect(els.termVizPct.textContent).toBe('100%');
      expect(els.pasteOutput.value).toBe(app.get('MOCK_CHECK_OUTPUT'));
      expect(Object.keys(app.get('state.checkResults'))).toHaveLength(steps.length);
      expect(app.get('state.showInstallSteps')).toBe(true);
      expect(app.get('state.activeTab')).toBe('install');
      expect(app.get('state.activePanel')).toBe('results');
      expect(app.get('state.isRunning')).toBe(false);
      expect(els.codeEditor.value).toContain('#  步骤 6/6: 安装后验证');
    });

    it('is a no-op while another run is in flight', async () => {
      const before = els.terminal.textContent;
      app.set('state.isRunning', 'true');
      await win.simulateCheckRun();
      expect(els.terminal.textContent).toBe(before);
    });
  });

  describe('simulateInstallRun', () => {
    it('prepares the phases and shows the first step card', async () => {
      await win.simulateInstallRun();
      expect(app.get('installState.phases')).toHaveLength(6);
      expect(app.get('installState.currentStep')).toBe(0);
      expect(els.terminal.textContent).toContain('# 在线安装 (Yum) — 由安装助手自动生成');
      expect(els.terminal.textContent).toContain('#   1. 安装 shadow 工具包');
      expect(els.stepBadge.textContent).toBe('步骤 1/6');
      expect(app.get('state.isRunning')).toBe(true);
      expect(els.stepPipeline.querySelectorAll('.step-chip')).toHaveLength(6);
    });

    it('is a no-op while another run is in flight', async () => {
      const before = els.terminal.textContent;
      app.set('state.isRunning', 'true');
      await win.simulateInstallRun();
      expect(app.get('installState.phases')).toEqual([]);
      expect(els.terminal.textContent).toBe(before);
    });
  });

  describe('executeStep', () => {
    it('logs the phase, marks the chip done and advances to the next step', async () => {
      app.set('state.installMethod', '"conda"');
      win.updateInstallMethodUI(false);
      await win.simulateInstallRun();
      await win.executeStep();

      expect(els.terminal.textContent).toContain('════════ 步骤 1/3: Python 版本选择 ════════');
      expect(els.terminal.textContent).toContain('✓ Python 版本选择 完成');
      expect(els.stepPipeline.querySelector('[data-id="s1"]').className).toContain('done');
      expect(app.get('installState.currentStep')).toBe(1);
      expect(app.get('installState.isExecuting')).toBe(false);
      expect(els.stepBadge.textContent).toBe('步骤 2/3');
      expect(els.stepExecuteBtn.disabled).toBe(false);
    });

    it('shows the chmod line for run-file phases', async () => {
      app.set('state.installMethod', '"runfile"');
      win.updateInstallMethodUI(false);
      await win.simulateInstallRun();
      await win.executeStep();
      await win.executeStep();
      await win.executeStep();
      expect(els.terminal.textContent).toContain('$ chmod +x Ascend-*.run');
    });

    it('finishes the run after the last phase', async () => {
      app.set('state.installMethod', '"conda"');
      win.updateInstallMethodUI(false);
      await win.simulateInstallRun();
      await win.executeStep();
      await win.executeStep();
      await win.executeStep();

      expect(els.stepCardContainer.style.display).toBe('none');
      expect(els.termVizLabel.textContent).toBe('CANN 安装完成');
      expect(els.terminal.textContent).toContain('🎉 在线安装 (Conda) 成功！（演示模式）');
      expect(els.checkSummary.textContent).toBe('安装完成 — 在线安装 (Conda)，共 3 步');
      expect(app.get('state.isRunning')).toBe(false);
    });

    it('prints the npu-smi summary for driver installs', async () => {
      await win.simulateInstallRun();
      for (let i = 0; i < 6; i++) await win.executeStep();
      expect(els.terminal.textContent).toContain('Ascend 910B | OK');
    });

    it('is a no-op while a step is already executing', async () => {
      await win.simulateInstallRun();
      app.set('installState.isExecuting', 'true');
      await win.executeStep();
      expect(app.get('installState.currentStep')).toBe(0);
    });
  });
});
