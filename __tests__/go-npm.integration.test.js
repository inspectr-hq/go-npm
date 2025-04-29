const fs   = require('fs');
const path = require('path');
const os   = require('os');
const cp   = require('child_process').execSync;

jest.setTimeout(60_000); // allow up to 60s for network + untar

describe('go-npm CLI', () => {
  const version    = '0.3.1';
  const archMap    = { ia32: '386', x64: 'amd64', arm: 'arm', arm64: 'arm64' };
  const platformMap= { darwin: 'darwin', linux: 'linux', win32: 'windows' };

  let tmpCwd, tmpGlobal;
  // const tmpCwd    = path.join(__dirname, 'project');
  // const tmpGlobal = path.join(__dirname, 'global');
  // [tmpCwd, tmpGlobal].forEach(dir => {
  //   if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  //   fs.mkdirSync(dir, { recursive: true });
  // });
  const binName = process.platform === 'win32' ? 'inspectr.exe' : 'inspectr';

  beforeAll(() => {
    // Make a temp “project” dir and temp “global” prefix
    tmpCwd    = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
    tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'global-'));

    // 2) Tell npm to use our fake prefix
    process.env.NPM_CONFIG_PREFIX = tmpGlobal;

    // 3) Write a minimal package.json that points at the real GitHub tar.gz
    const pkg = {
      version,
      goBinary: {
        name: 'inspectr',
        path: 'bin',
        url: 'https://github.com/inspectr-hq/inspectr/releases/download/v{{version}}/inspectr_{{version}}_{{platform}}_{{arch}}.tar.gz'
      }
    };
    fs.writeFileSync(
      path.join(tmpCwd, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    );
  });

  it('installs and then uninstalls the Inspectr binary', () => {
    const cli = path.resolve(__dirname, '../bin/index.js');

    // --- INSTALL ---
    // this will fetch from GitHub, stream → gunzip → untar → move to our tmpGlobal prefix
    cp(`node ${cli} install`, { cwd: tmpCwd, env: process.env });
    const destDir = process.platform === 'win32'
      ? tmpGlobal
      : path.join(tmpGlobal, 'bin');
    const installed = path.join(destDir, binName);
    expect(fs.existsSync(installed)).toBe(true);

    // --- UNINSTALL ---
    cp(`node ${cli} uninstall`, { cwd: tmpCwd, env: process.env });
    expect(fs.existsSync(installed)).toBe(false);
  });
});
