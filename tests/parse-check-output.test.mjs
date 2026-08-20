import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './harness.mjs';

describe('parseCheckOutput', () => {
  let app;
  let win;
  let els;

  beforeEach(() => {
    app = loadApp();
    win = app.window;
    els = app.get('els');
  });
  afterEach(() => app.dispose());

  const parse = text => {
    win.parseCheckOutput(text, true);
    return app.get('state.checkResults');
  };

  it('detects the architecture and applies it to the config form', () => {
    expect(parse('uname -m\naarch64').arch).toEqual({ status: 'pass', detail: '架构: aarch64' });
    expect(els.arch.value).toBe('aarch64');
  });

  it('fails the arch check when no architecture is present', () => {
    expect(parse('nothing useful here').arch.status).toBe('fail');
  });

  it.each([
    ['PRETTY_NAME="Ubuntu 22.04.4 LTS"', 'ubuntu', 'Ubuntu'],
    ['NAME="CentOS Linux"', 'centos', 'CentOS/openEuler'],
    ['NAME="openEuler"', 'centos', 'CentOS/openEuler'],
    ['NAME="Debian GNU/Linux"', 'debian', 'Debian']
  ])('recognises %s as %s', (text, expectedValue, detail) => {
    const results = parse(text);
    expect(results.os).toEqual({ status: 'pass', detail });
    expect(els.os.value).toBe(expectedValue);
  });

  it('warns when only PRETTY_NAME is present and fails when no OS info is found', () => {
    expect(parse('PRETTY_NAME="Unknown Linux"').os).toEqual({ status: 'warn', detail: '请手动确认系统' });
    expect(parse('x86_64').os.status).toBe('fail');
  });

  it('selects a first-time driver install when npu-smi is missing', () => {
    const results = parse('npu-smi: command not found');
    expect(results.driver).toEqual({ status: 'warn', detail: '驱动未安装，需安装驱动固件' });
    expect(els.installDriver.checked).toBe(true);
    expect(els.driverScene.value).toBe('first');
  });

  it('switches to the overlay scene when a healthy NPU is reported', () => {
    const results = parse('NPU 0   Ascend 910B   OK');
    expect(results.driver).toEqual({ status: 'pass', detail: 'NPU 驱动正常' });
    expect(els.driverScene.value).toBe('overlay');
  });

  it('reports an unknown driver state otherwise', () => {
    expect(parse('x86_64').driver).toEqual({ status: 'warn', detail: '驱动状态未知' });
  });

  it('checks memory, disk, gcc and python from the pasted output', () => {
    const results = parse([
      'Mem:           62Gi        8.2Gi        48Gi',
      'Filesystem      Size  Used Avail Use%',
      'gcc (Ubuntu 11.4.0) 11.4.0',
      'Python 3.10.12'
    ].join('\n'));
    expect(results.memory.status).toBe('pass');
    expect(results.disk.status).toBe('pass');
    expect(results.gcc.status).toBe('pass');
    expect(results.python).toEqual({ status: 'pass', detail: 'Python 3.10.12' });
  });

  it('warns for each missing environment prerequisite', () => {
    const results = parse('x86_64');
    expect(results.memory.status).toBe('warn');
    expect(results.gcc.status).toBe('warn');
    expect(results.python).toEqual({ status: 'warn', detail: 'Python 未检测到' });
  });

  it('treats an existing ascend-toolkit as an overlay install', () => {
    const results = parse('ls ascend-toolkit\nascend-toolkit');
    expect(results.cann).toEqual({ status: 'pass', detail: '已有 CANN 安装' });
    expect(els.driverScene.value).toBe('overlay');
  });

  it('plans a fresh toolkit install when the output says 未安装', () => {
    const results = parse('ls ascend-toolkit\n未安装');
    expect(results.cann).toEqual({ status: 'warn', detail: 'CANN 未安装，将全新安装' });
    expect(els.installToolkit.checked).toBe(true);
  });

  it('reports an unknown CANN state otherwise', () => {
    expect(parse('x86_64').cann).toEqual({ status: 'warn', detail: 'CANN 状态未知' });
  });

  it('summarises how many checks passed and renders one row per check step', () => {
    win.parseCheckOutput(app.get('MOCK_CHECK_OUTPUT'), true);
    const results = app.get('state.checkResults');
    const passed = Object.values(results).filter(r => r.status === 'pass').length;
    expect(els.checkSummary.textContent).toBe(`检查完成 ${passed}/${Object.keys(results).length} 项通过，配置已自动更新`);
    expect(els.checkItems.querySelectorAll('.check-item')).toHaveLength(app.get('CHECK_STEPS').length);
    expect(els.statusWarnings.textContent).toBe(`⚠ ${Object.keys(results).length - passed}`);
  });

  it('switches to the results panel and install tab when not silent', () => {
    win.parseCheckOutput(app.get('MOCK_CHECK_OUTPUT'));
    expect(app.get('state.activePanel')).toBe('results');
    expect(app.get('state.activeTab')).toBe('install');
    expect(els.toast.classList.contains('show')).toBe(true);
  });
});

describe('renderCheckItemsLive', () => {
  let app;
  let els;

  beforeEach(() => {
    app = loadApp();
    els = app.get('els');
  });
  afterEach(() => app.dispose());

  it('marks the currently running check and leaves the rest pending', () => {
    app.window.renderCheckItemsLive({}, 'gcc');
    const rows = [...els.checkItems.querySelectorAll('.check-item')];
    const running = rows.find(r => r.dataset.checkId === 'gcc');
    expect(running.className).toContain('check-running');
    expect(running.textContent).toContain('正在检查...');
    expect(rows.filter(r => r.className.includes('check-pending'))).toHaveLength(rows.length - 1);
  });

  it('renders pass, warn and fail icons and counts warnings', () => {
    app.window.renderCheckItemsLive({
      arch: { status: 'pass', detail: 'ok' },
      os: { status: 'warn', detail: 'maybe' },
      gcc: { status: 'fail', detail: 'missing' }
    }, null);
    const row = id => els.checkItems.querySelector(`[data-check-id="${id}"]`);
    expect(row('arch').querySelector('.check-status').className).toContain('status-pass');
    expect(row('os').querySelector('.check-status').textContent).toBe('!');
    expect(row('gcc').querySelector('.check-status').textContent).toBe('✗');
    expect(els.statusWarnings.textContent).toBe('⚠ 2');
  });
});
