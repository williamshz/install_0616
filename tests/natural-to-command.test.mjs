import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, makeConfig } from './harness.mjs';

describe('naturalToCommand', () => {
  let app;
  let win;

  beforeAll(() => {
    app = loadApp();
    win = app.window;
  });
  afterAll(() => app.dispose());

  const useOs = os => app.set('installState.cfg', JSON.stringify(makeConfig({ os })));

  beforeEach(() => {
    app.set('installState.cfg', 'null');
  });

  it('defaults to yum when no install config is active', () => {
    expect(win.naturalToCommand('安装 vim')).toBe('yum install -y vim');
  });

  it('uses apt-get on ubuntu/debian and yum on rpm systems', () => {
    useOs('ubuntu');
    expect(win.naturalToCommand('安装 vim')).toBe('apt-get install -y vim');
    expect(win.naturalToCommand('清理缓存')).toBe('apt-get clean all && apt-get update');
    useOs('debian');
    expect(win.naturalToCommand('卸载 vim')).toBe('apt-get remove -y vim');
    useOs('centos');
    expect(win.naturalToCommand('安装 vim')).toBe('yum install -y vim');
    expect(win.naturalToCommand('清理缓存')).toBe('yum clean all && yum makecache');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(win.naturalToCommand('   查看内存   ')).toBe('free -h');
  });

  it.each([
    ['更新系统', 'yum update -y'],
    ['更新软件包', 'yum upgrade -y'],
    ['查看目录', 'ls -la'],
    ['查看进程', 'ps aux'],
    ['查看磁盘', 'df -h'],
    ['查看CPU', 'top -bn1 | head -5'],
    ['重启系统', 'reboot'],
    ['关闭系统', 'shutdown -h now'],
    ['查看版本', 'cat /etc/os-release'],
    ['查看内核', 'uname -r'],
    ['查看架构', 'uname -m'],
    ['查看网络', 'ifconfig || ip addr'],
    ['安装docker', 'yum install -y docker'],
    ['启动docker', 'systemctl start docker && systemctl enable docker'],
    ['查看docker版本', 'docker --version'],
    ['查看conda环境', 'conda env list'],
    ['检查npu状态', 'npu-smi info'],
    ['检查toolkit版本', 'atc --version'],
    ['配置环境变量', 'source /usr/local/Ascend/ascend-toolkit/set_env.sh'],
    ['查看环境变量', 'env | grep -i ASCEND'],
    ['测试acl', 'python3 -c "import acl; print(acl)"'],
    ['验证安装', 'npu-smi info && atc --version'],
    ['同步时间', 'ntpdate time.nist.gov'],
    ['关闭防火墙', 'systemctl stop firewalld && systemctl disable firewalld']
  ])('maps the fixed phrase %s', (input, expected) => {
    expect(win.naturalToCommand(input)).toBe(expected);
  });

  it.each([
    ['创建用户 dev', 'useradd dev'],
    ['删除用户 dev', 'userdel dev'],
    ['切换目录 /opt', 'cd /opt'],
    ['创建目录 /opt/cann', 'mkdir -p /opt/cann'],
    ['删除目录 /tmp/x', 'rm -rf /tmp/x'],
    ['查看文件 /etc/hosts', 'cat /etc/hosts'],
    ['编辑文件 /etc/hosts', 'vim /etc/hosts'],
    ['重启服务 sshd', 'systemctl restart sshd'],
    ['启动服务 sshd', 'systemctl start sshd'],
    ['停止服务 sshd', 'systemctl stop sshd'],
    ['下载文件 https://x/y.run', 'wget https://x/y.run'],
    ['解压文件 x.tar.gz', 'tar -xzf x.tar.gz'],
    ['压缩文件 dir', 'tar -czf dir.tar.gz dir'],
    ['查找文件 acl.h', 'find / -name "acl.h" 2>/dev/null'],
    ['搜索内容 ascend', 'grep -r "ascend" .'],
    ['测试网络 8.8.8.8', 'ping -c 3 8.8.8.8'],
    ['查看端口 8080', 'netstat -tlnp | grep 8080']
  ])('maps the parameterised phrase %s', (input, expected) => {
    expect(win.naturalToCommand(input)).toBe(expected);
  });

  it('builds a firewall rule for 开放端口', () => {
    expect(win.naturalToCommand('开放端口 8080'))
      .toBe('firewall-cmd --add-port=8080/tcp --permanent && firewall-cmd --reload');
  });

  it('defaults 查看日志 to /var/log/messages when no file is given', () => {
    expect(win.naturalToCommand('查看日志')).toBe('tail -f /var/log/messages');
    expect(win.naturalToCommand('查看日志 /var/log/syslog')).toBe('tail -f /var/log/syslog');
  });

  it('parses the 为 separator for permission and ownership changes', () => {
    expect(win.naturalToCommand('修改权限 /opt/x 为 755')).toBe('chmod 755 /opt/x');
    expect(win.naturalToCommand('修改所有者 /opt/x 为 HwHiAiUser')).toBe('chown HwHiAiUser /opt/x');
  });

  it('returns the input unchanged when the 为 separator is missing or nothing matches', () => {
    expect(win.naturalToCommand('修改权限 /opt/x 755')).toBe('修改权限 /opt/x 755');
    expect(win.naturalToCommand('npu-smi info')).toBe('npu-smi info');
    expect(win.naturalToCommand('')).toBe('');
  });

  // These phrases are shadowed by a shorter prefix checked earlier, or slice the
  // input at the wrong offset. The expectations below pin the current output so
  // the behaviour change is visible if the mapping order/offsets are corrected.
  describe('phrases shadowed by an earlier prefix (current behaviour)', () => {
    it.each([
      ['安装依赖', 'yum install -y 依赖'],
      ['安装pip', 'yum install -y pip'],
      ['安装npu驱动', 'yum install -y npu驱动'],
      ['安装toolkit', 'yum install -y toolkit'],
      ['安装python包 numpy', 'yum install -y python包 numpy'],
      ['安装conda包 numpy', 'yum install -y conda包 numpy'],
      ['创建用户组 devs', 'useradd 组 devs'],
      ['删除用户组 devs', 'userdel 组 devs'],
      ['设置开机自启 sshd', 'systemctl enable 启 sshd'],
      ['检查服务状态 sshd', 'systemctl status 态 sshd'],
      ['创建conda环境 dev', 'conda create -n a环境 dev python=3.8 -y'],
      ['激活conda环境 dev', 'conda activate a环境 dev'],
      ['删除conda环境 dev', 'conda env remove -n a环境 dev -y']
    ])('%s currently maps to %s', (input, expected) => {
      expect(win.naturalToCommand(input)).toBe(expected);
    });
  });
});
