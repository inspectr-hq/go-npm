const fs   = require('fs');
const path = require('path');
const os   = require('os');
const cpSync   = require('child_process').execSync;

jest.setTimeout(60_000); // allow up to 60s for network + untar

describe('go-npm CLI', () => {
  const version    = '0.3.1';
  const archMap    = { ia32: '386', x64: 'amd64', arm: 'arm', arm64: 'arm64' };
  const platformMap= { darwin: 'darwin', linux: 'linux', win32: 'windows' };
  const binName    = process.platform === 'win32' ? 'inspectr.exe' : 'inspectr';
  let tmpCwd, tmpGlobal;
  // const tmpCwd    = path.join(__dirname, 'project');
  // const tmpGlobal = path.join(__dirname, 'global');
  // [tmpCwd, tmpGlobal].forEach(dir => {
  //   if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  //   fs.mkdirSync(dir, { recursive: true });
  // });

  beforeAll(() => {
    // Make a temp “project” dir and temp “global” prefix
    tmpCwd    = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
    tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'global-'));

    // Write a minimal package.json that points at the real GitHub tar.gz
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
    const env     = {
      ...process.env,
      // ensure npm config picks up our fake prefix
      npm_config_prefix: tmpGlobal,
      NPM_CONFIG_PREFIX: tmpGlobal
    };

    // --- INSTALL ---
    const installStdout = cpSync(`node ${cli} install`, { cwd: tmpCwd, env }).toString();
    // Find the line: "✔ Installed inspectr to /some/path"
    const m = installStdout.match(/✔ Installed .* to (.+)$/m);
    expect(m).not.toBeNull();
    const dest = m[1].trim();

    // The binary must now exist at dest/<binName>
    const installedPath = path.join(dest, binName);
    expect(fs.existsSync(installedPath)).toBe(true);

    // --- UNINSTALL ---
    const uninstallStdout = cpSync(`node ${cli} uninstall`, { cwd: tmpCwd, env }).toString();
    // Optional: verify CLI reported removal
    expect(uninstallStdout).toMatch(/✔ Removed .* from /);

    // And the file must actually be gone
    expect(fs.existsSync(installedPath)).toBe(false);
  });
});
