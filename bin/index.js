#!/usr/bin/env node
"use strict";

const fs          = require('fs');
const path        = require('path');
const zlib        = require('zlib');
const tar         = require('tar');
const mkdirp      = require('mkdirp');
const { exec }    = require('child_process');
const { pipeline }= require('stream/promises');
const { Readable }= require('stream/web');

// Map Node’s process.arch → Go ARCH
const ARCH_MAPPING = {
  ia32:   '386',
  x64:    'amd64',
  arm:    'arm',
  arm64:  'arm64'
};

// Map Node’s process.platform → Go OS (only darwin, linux, win32)
const PLATFORM_MAPPING = {
  darwin: 'darwin',
  linux:  'linux',
  win32:  'windows'
};

/**
 * Determine the global npm “bin” directory:
 *  • On Windows: `npm config get prefix` itself is the bin folder.
 *  • On macOS/Linux: prefix + '/bin'.
 */
function getInstallDir() {
  return new Promise((resolve, reject) => {
    exec('npm config get prefix', (err, stdout) => {
      if (err) return reject(err);
      const prefix = stdout.trim();
      const dir = process.platform === 'win32'
        ? prefix
        : path.join(prefix, 'bin');
      mkdirp.sync(dir);
      resolve(dir);
    });
  });
}

/** Ensure your package.json has version + goBinary.{name,path,url} */
function validateConfiguration(pkg) {
  if (!pkg.version)                       throw new Error('`version` is required');
  if (!pkg.goBinary || typeof pkg.goBinary !== 'object')
                                          throw new Error('`goBinary` must be an object');
  for (let f of ['name','path','url']) {
    if (!pkg.goBinary[f])                 throw new Error(`goBinary.${f} is required`);
  }
}

/** Read & interpolate package.json → { binName, binPath, url } */
function parsePackageJson() {
  if (!(process.arch in ARCH_MAPPING))     throw new Error(`Unsupported arch: ${process.arch}`);
  if (!(process.platform in PLATFORM_MAPPING))
                                           throw new Error(`Unsupported platform: ${process.platform}`);

  const pjPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(pjPath))             throw new Error('Cannot find package.json in cwd');
  const pkg = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
  validateConfiguration(pkg);

  let { name, path: binPath, url } = pkg.goBinary;
  let version = pkg.version.replace(/^v/, '');
  if (process.platform === 'win32') name += '.exe';

  return {
    binName: name,
    binPath,
    url: url
      .replace(/{{arch}}/g, ARCH_MAPPING[process.arch])
      .replace(/{{platform}}/g, PLATFORM_MAPPING[process.platform])
      .replace(/{{version}}/g, version)
      .replace(/{{bin_name}}/g, name)
  };
}

/** Download → stream → gunzip → untar → verify → move */
async function install() {
  const { binName, binPath, url } = parsePackageJson();
  mkdirp.sync(binPath);

  console.log(`Downloading ${url}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  // Stream through gunzip + tar extractor
  await pipeline(
    Readable.toNode(res.body),
    zlib.createGunzip(),
    tar.x({ cwd: binPath, strip: 1 })
  );

  // Verify the binary exists
  const extracted = path.join(binPath, binName);
  if (!fs.existsSync(extracted)) {
    throw new Error(`Archive missing expected binary: ${binName}`);
  }

  // Move into global npm bin
  const dest = await getInstallDir();
  fs.renameSync(extracted, path.join(dest, binName));
  console.log(`✔ Installed ${binName} to ${dest}`);
}

/** Remove the installed binary */
async function uninstall() {
  const { binName } = parsePackageJson();
  const dest = await getInstallDir();
  const target = path.join(dest, binName);

  try {
    fs.unlinkSync(target);
    console.log(`✔ Removed ${binName} from ${dest}`);
  } catch {
    console.warn(`⚠️  ${binName} not found in ${dest}`);
  }
}

(async () => {
  try {
    const cmd = process.argv[2];
    if      (cmd === 'install')   await install();
    else if (cmd === 'uninstall') await uninstall();
    else                           throw new Error('Usage: go-npm [install|uninstall]');
    process.exit(0);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();
