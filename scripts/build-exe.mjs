import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = path.join(root, 'artifacts', 'pdf-engine');
const python = path.join(engineDir, '.venv-desktop', 'Scripts', 'python.exe');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'inherit',
    // pnpm.cmd cannot be spawned without a shell on Windows.
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function ensureElectron() {
  const electronRoot = path.join(root, 'node_modules', 'electron');
  if (!fs.existsSync(electronRoot)) return;
  const realRoot = fs.realpathSync(electronRoot);
  const distDir = path.join(realRoot, 'dist');
  const exe = path.join(distDir, 'electron.exe');
  if (fs.existsSync(exe)) return;
  const download = spawnSync(process.execPath, ['-e', [
    "const {downloadArtifact}=require('@electron/get');",
    "const {version}=require('./package.json');",
    "downloadArtifact({version,artifactName:'electron',platform:'win32',arch:'x64',checksums:require('./checksums.json')})",
    ".then(p=>process.stdout.write(p)).catch(e=>{console.error(e);process.exit(1);});",
  ].join('')], { cwd: realRoot, encoding: 'utf8' });
  if (download.status !== 0) {
    console.error(download.stderr || 'Electron download failed');
    process.exit(download.status || 1);
  }
  const zip = (download.stdout || '').trim();
  fs.mkdirSync(distDir, { recursive: true });
  // extract-zip stops after the first entry on this Node version. tar extracts the archive.
  run('tar', ['-xf', zip, '-C', distDir]);
  fs.writeFileSync(path.join(realRoot, 'path.txt'), 'electron.exe');
}

if (!fs.existsSync(python)) {
  console.error(`Missing ${python}. Create the desktop venv and install requirements-desktop.txt first.`);
  process.exit(1);
}

console.log('Building the PDF engine');
run(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--distpath', '.', '--workpath', 'build-engine', 'engine.spec'], {
  cwd: engineDir,
});

const engineExe = path.join(engineDir, 'dist-engine', 'engine.exe');
if (!fs.existsSync(engineExe)) {
  console.error(`PyInstaller did not write ${engineExe}`);
  process.exit(1);
}

console.log('Building the React app');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
// The repo preinstall script calls sh, which is not present on a stock Windows install.
run(pnpm, ['install', '--ignore-scripts'], { cwd: root });
ensureElectron();
run(pnpm, ['--filter', '@workspace/workspace-suite', 'exec', 'vite', 'build', '--config', 'vite.config.ts'], {
  cwd: root,
  env: {
    VITE_DESKTOP: '1',
    BASE_PATH: '/ui/',
  },
});

console.log('Packaging the Windows installer');
run(pnpm, ['exec', 'electron-builder', '--win', 'nsis', '--x64'], { cwd: root });

const installer = path.join(root, 'dist', 'WEOTT-Quote-Builder-Setup.exe');
if (!fs.existsSync(installer)) {
  console.error(`Installer was not written to ${installer}`);
  process.exit(1);
}
console.log(`Wrote ${installer}`);
