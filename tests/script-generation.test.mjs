import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, makeConfig } from './harness.mjs';

describe('script generation', () => {
  let app;
  let win;

  beforeAll(() => {
    app = loadApp();
    win = app.window;
  });
  afterAll(() => app.dispose());

  beforeEach(() => {
    app.set('state.installMethod', '"yum"');
    app.set('state.showInstallSteps', 'true');
  });

  describe('chipLabel', () => {
    it('maps known chips to themselves and passes through unknown ones', () => {
      expect(win.chipLabel('910b')).toBe('910b');
      expect(win.chipLabel('310p')).toBe('310p');
      expect(win.chipLabel('999x')).toBe('999x');
    });
  });

  describe('getInstallFileName', () => {
    it('returns the file of the requested method', () => {
      expect(win.getInstallFileName('yum')).toBe('install_cann_yum.sh');
      expect(win.getInstallFileName('conda')).toBe('install_cann_conda.sh');
      expect(win.getInstallFileName('runfile')).toBe('install_cann_runfile.sh');
    });

    it('falls back to the active install method', () => {
      app.set('state.installMethod', '"runfile"');
      expect(win.getInstallFileName()).toBe('install_cann_runfile.sh');
    });
  });

  describe('scriptStep / scriptHeader', () => {
    it('wraps the body with numbered banners and a completion echo', () => {
      const lines = [];
      win.scriptStep(lines, 2, 6, '安装依赖', ['yum install -y gcc']);
      expect(lines).toContain('#  步骤 2/6: 安装依赖');
      expect(lines).toContain('yum install -y gcc');
      expect(lines[lines.length - 1]).toBe('echo "✓ [步骤 2/6] 安装依赖 — 完成"');
    });

    it('lists every step of the method in the header', () => {
      const lines = [];
      win.scriptHeader(lines, 'conda');
      expect(lines[0]).toBe('# 安装步骤一览（共 3 步）:');
      expect(lines[1]).toBe('#   1. Python 版本选择');
      expect(lines[lines.length - 1]).toBe('');
    });
  });

  describe('userGroupCommands / depInstallCommands', () => {
    it('creates the HwHiAiUser group and user idempotently', () => {
      const cmds = win.userGroupCommands();
      expect(cmds[0]).toBe('groupadd HwHiAiUser 2>/dev/null || true');
      expect(cmds[1]).toContain('useradd -g HwHiAiUser -d /home/HwHiAiUser -m HwHiAiUser');
      expect(cmds.every(c => c.includes('2>/dev/null ||'))).toBe(true);
    });

    it('uses apt-get on debian-family systems and yum elsewhere', () => {
      expect(win.depInstallCommands('ubuntu')[0]).toBe('apt-get update');
      expect(win.depInstallCommands('debian')[0]).toBe('apt-get update');
      expect(win.depInstallCommands('centos')[0]).toContain('yum install -y gcc gcc-c++');
      expect(win.depInstallCommands('openeuler')[0]).toContain('yum install -y');
    });
  });

  describe('generateCheckScript', () => {
    it('emits one numbered block per check step with a failure fallback', () => {
      const script = win.generateCheckScript();
      const steps = app.get('CHECK_STEPS');
      expect(script.startsWith('#!/bin/bash')).toBe(true);
      for (const [i, step] of steps.entries()) {
        expect(script).toContain(`echo "[${i + 1}/${steps.length}] ${step.name}"`);
        expect(script).toContain(`${step.cmd} 2>&1 || echo "检查失败或未安装"`);
      }
    });
  });

  describe('generateInstallScriptYum', () => {
    it('renders the parameter header from the config', () => {
      const script = win.generateInstallScriptYum(makeConfig({ arch: 'aarch64', cannVersion: '8.0.0' }));
      expect(script).toContain('PRODUCT_MODEL=Ascend 910B');
      expect(script).toContain('CANN_VERSION=8.0.0');
      expect(script).toContain('INSTALL_METHOD=yum');
      expect(script).toContain('ARCH=aarch64');
    });

    it('stops after the parameter header when steps are not requested', () => {
      const script = win.generateInstallScriptYum(makeConfig(), false);
      expect(script).toContain('# 运行「环境检查」后将自动生成完整安装步骤');
      expect(script).not.toContain('步骤 1/6');
    });

    it('writes a repo file pointing at the configured mirror', () => {
      const script = win.generateInstallScriptYum(makeConfig({
        yumRepoUrl: 'https://mirror.example.com/cann',
        cannVersion: '8.1.RC1',
        arch: 'aarch64'
      }));
      expect(script).toContain('baseurl=https://mirror.example.com/cann/8.1.RC1/yum/aarch64');
      expect(script).toContain('name=Ascend CANN 8.1.RC1');
    });

    it('generates all six steps and installs the chip specific driver', () => {
      const script = win.generateInstallScriptYum(makeConfig({ chipType: '310p' }));
      for (let n = 1; n <= 6; n++) expect(script).toContain(`#  步骤 ${n}/6:`);
      expect(script).toContain('yum install -y ascend-npu-driver-310p');
    });

    it('truncates at stepLimit and marks that it is waiting for the user', () => {
      const script = win.generateInstallScriptYum(makeConfig(), true, 1);
      expect(script).toContain('#  步骤 2/6: 配置用户属组');
      expect(script).not.toContain('#  步骤 3/6:');
      expect(script.trimEnd().endsWith('# ⏳ 等待用户操作... (执行/跳过/修改后自动继续)')).toBe(true);
    });

    it('omits the waiting marker once the last step is included', () => {
      const script = win.generateInstallScriptYum(makeConfig(), true, 5);
      expect(script).toContain('#  步骤 6/6: 安装后验证');
      expect(script).not.toContain('# ⏳ 等待用户操作');
    });
  });

  describe('generateInstallScriptConda', () => {
    it('creates the environment with the configured python and channel', () => {
      const script = win.generateInstallScriptConda(makeConfig({
        installMethod: 'conda',
        pythonVersion: '3.9',
        condaEnv: 'my-env',
        condaChannel: 'https://channel.example.com'
      }));
      expect(script).toContain('INSTALL_METHOD=conda');
      expect(script).toContain('conda create -n my-env python=3.9 -y');
      expect(script).toContain('conda config --add channels https://channel.example.com');
      expect(script).toContain('conda install -y -n my-env cann-toolkit=8.0.RC3');
      for (let n = 1; n <= 3; n++) expect(script).toContain(`#  步骤 ${n}/3:`);
    });

    it('honours includeSteps=false and stepLimit', () => {
      expect(win.generateInstallScriptConda(makeConfig({ installMethod: 'conda' }), false))
        .toContain('# 运行「环境检查」后将自动生成完整安装步骤');
      const limited = win.generateInstallScriptConda(makeConfig({ installMethod: 'conda' }), true, 0);
      expect(limited).toContain('#  步骤 1/3: Python 版本选择');
      expect(limited).not.toContain('#  步骤 2/3:');
      expect(limited).toContain('# ⏳ 等待用户操作');
    });
  });

  describe('generateInstallScriptRunfile', () => {
    const runfile = overrides => makeConfig({ installMethod: 'runfile', ...overrides });

    it('installs driver before firmware on a first installation', () => {
      const script = win.generateInstallScriptRunfile(runfile({ driverScene: 'first' }));
      const driverAt = script.indexOf('./Ascend-hdk-910b-npu-driver_*.run --full --install-for-all');
      const firmwareAt = script.indexOf('./Ascend-hdk-910b-npu-firmware_*.run --full');
      expect(driverAt).toBeGreaterThan(-1);
      expect(driverAt).toBeLessThan(firmwareAt);
    });

    it('installs firmware before driver when overlaying an existing install', () => {
      const script = win.generateInstallScriptRunfile(runfile({ driverScene: 'overlay' }));
      const driverAt = script.indexOf('./Ascend-hdk-910b-npu-driver_*.run --full --install-for-all');
      const firmwareAt = script.indexOf('./Ascend-hdk-910b-npu-firmware_*.run --full');
      expect(firmwareAt).toBeLessThan(driverAt);
    });

    it('only includes the selected components', () => {
      const script = win.generateInstallScriptRunfile(runfile({
        installDriver: false,
        installKernels: false,
        installNnal: true
      }));
      expect(script).not.toContain('npu-driver_*.run --full');
      expect(script).not.toContain('Ascend-cann-kernels');
      expect(script).toContain('./Ascend-cann-nnal_8.0.RC3_linux-x86_64.run --install');
      expect(script).toContain('source /usr/local/Ascend/nnal/atb/set_env.sh');
    });

    it('prefixes the toolkit install with sudo for root and not for other users', () => {
      const asRoot = win.generateInstallScriptRunfile(runfile({ userType: 'root' }));
      const asUser = win.generateInstallScriptRunfile(runfile({ userType: 'nonroot', installPath: '${HOME}/Ascend' }));
      expect(asRoot).toContain('sudo ./Ascend-cann-toolkit_8.0.RC3_linux-x86_64.run --install');
      expect(asUser).not.toContain('sudo ./Ascend-cann-toolkit');
      expect(asUser).toContain('# 安装路径: ${HOME}/Ascend');
    });

    it('uses apt dependencies for ubuntu and supports includeSteps=false', () => {
      expect(win.generateInstallScriptRunfile(runfile({ os: 'ubuntu' }))).toContain('apt-get install -y gcc g++ make cmake');
      expect(win.generateInstallScriptRunfile(runfile(), false)).not.toContain('步骤 1/4');
    });
  });

  describe('generateInstallScript', () => {
    it('dispatches on installMethod', () => {
      expect(win.generateInstallScript(makeConfig({ installMethod: 'yum' }))).toContain('INSTALL_METHOD=yum');
      expect(win.generateInstallScript(makeConfig({ installMethod: 'conda' }))).toContain('INSTALL_METHOD=conda');
      expect(win.generateInstallScript(makeConfig({ installMethod: 'runfile' }))).toContain('INSTALL_METHOD=runfile');
    });

    it('omits the steps while state.showInstallSteps is false', () => {
      app.set('state.showInstallSteps', 'false');
      expect(win.generateInstallScript(makeConfig())).toContain('# 运行「环境检查」后将自动生成完整安装步骤');
    });

    it('falls back to the live form config when called without one', () => {
      expect(win.generateInstallScript()).toContain('INSTALL_METHOD=yum');
    });
  });

  describe('generateEnvScript', () => {
    it('activates the conda environment for conda installs', () => {
      const script = win.generateEnvScript(makeConfig({ installMethod: 'conda', condaEnv: 'cann-9' }));
      expect(script).toContain('conda activate cann-9');
      expect(script).not.toContain('ASCEND_TOOLKIT_HOME');
    });

    it('always uses /usr/local/Ascend for yum installs', () => {
      const script = win.generateEnvScript(makeConfig({ installMethod: 'yum', installPath: '/opt/ignored' }));
      expect(script).toContain('source /usr/local/Ascend/ascend-toolkit/set_env.sh');
      expect(script).not.toContain('/opt/ignored');
    });

    it('uses the custom path and adds the nnal env only when selected', () => {
      const base = makeConfig({ installMethod: 'runfile', installPath: '/opt/Ascend' });
      expect(win.generateEnvScript(base)).not.toContain('nnal/atb/set_env.sh');
      const withNnal = win.generateEnvScript({ ...base, installNnal: true });
      expect(withNnal).toContain('source /opt/Ascend/nnal/atb/set_env.sh');
      expect(withNnal).toContain('export ASCEND_TOOLKIT_HOME=/opt/Ascend/ascend-toolkit/latest');
    });
  });

  describe('generateVerifyScript', () => {
    it('reads the install info file for the configured path and arch', () => {
      const script = win.generateVerifyScript(makeConfig({ installPath: '/opt/Ascend', arch: 'aarch64' }));
      expect(script).toContain('cat /opt/Ascend/ascend-toolkit/latest/aarch64-linux/ascend_toolkit_install.info');
      expect(script).toContain('npu-smi info 2>&1 || echo "驱动未就绪"');
    });
  });

  describe('generatePackageList', () => {
    it('lists yum components', () => {
      expect(win.generatePackageList(makeConfig({ installMethod: 'yum' }))[0]).toBe('ascend-toolkit-8.0.RC3 (yum)');
    });

    it('lists the conda package and target environment', () => {
      const pkgs = win.generatePackageList(makeConfig({ installMethod: 'conda', pythonVersion: '3.11', condaEnv: 'env-a' }));
      expect(pkgs).toEqual(['cann-toolkit=8.0.RC3 (conda)', 'python=3.11 → 环境 env-a']);
    });

    it('lists one runfile per selected component', () => {
      const pkgs = win.generatePackageList(makeConfig({
        installMethod: 'runfile',
        chipType: '310b',
        arch: 'aarch64',
        installNnal: true
      }));
      expect(pkgs).toEqual([
        'Ascend-hdk-310b-npu-driver_<version>_linux-aarch64.run',
        'Ascend-hdk-310b-npu-firmware_<version>.run',
        'Ascend-cann-toolkit_8.0.RC3_linux-aarch64.run',
        'Ascend-cann-kernels-310b_8.0.RC3_linux-aarch64.run',
        'Ascend-cann-nnal_8.0.RC3_linux-aarch64.run'
      ]);
    });

    it('returns an empty list when nothing is selected', () => {
      expect(win.generatePackageList(makeConfig({
        installMethod: 'runfile',
        installDriver: false,
        installToolkit: false,
        installKernels: false,
        installNnal: false
      }))).toEqual([]);
    });
  });

  describe('getInstallPhases', () => {
    it('returns six yum phases carrying the chip and version', () => {
      const phases = win.getInstallPhases(makeConfig({ installMethod: 'yum', chipType: '910' }));
      expect(phases.map(p => p.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
      expect(phases[3].cmd).toBe('yum install -y ascend-npu-driver-910');
      expect(phases[4].cmd).toBe('yum install -y ascend-toolkit-8.0.RC3');
    });

    it('returns three conda phases using the configured environment', () => {
      const phases = win.getInstallPhases(makeConfig({ installMethod: 'conda', condaEnv: 'e1', pythonVersion: '3.8' }));
      expect(phases).toHaveLength(3);
      expect(phases[0].cmd).toBe('conda create -n e1 python=3.8 -y');
    });

    it('marks the runfile install phase as a long running run step', () => {
      const phases = win.getInstallPhases(makeConfig({ installMethod: 'runfile', os: 'ubuntu' }));
      expect(phases).toHaveLength(4);
      expect(phases[1].cmd).toBe('apt-get update');
      expect(phases[2].isRun).toBe(true);
    });
  });
});
