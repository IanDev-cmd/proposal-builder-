const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { importRenderWorkspace } = require('./importRender');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ENGINE_PORT = 8765;
const ENGINE_ORIGIN = `http://127.0.0.1:${ENGINE_PORT}`;
const HEALTH_TIMEOUT_MS = 90000;

let engineProc = null;
let splash = null;
let mainWindow = null;
let quitting = false;
let pendingUpdate = null;

function nexusDir() {
  const base = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  const dir = path.join(base, 'WEOTT', 'Nexus');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logsDir() {
  const dir = path.join(nexusDir(), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rotateLog(file) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < 5 * 1024 * 1024) return;
    const oldest = `${file}.3`;
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
    for (let index = 2; index >= 1; index -= 1) {
      const current = `${file}.${index}`;
      if (fs.existsSync(current)) fs.renameSync(current, `${file}.${index + 1}`);
    }
    fs.renameSync(file, `${file}.1`);
  } catch (err) {
    console.error(err);
  }
}

function logLine(scope, message) {
  const line = `${new Date().toISOString()} ${scope} ${String(message).replace(/\r?\n$/, '')}\n`;
  try {
    const file = path.join(logsDir(), 'electron.log');
    rotateLog(file);
    fs.appendFileSync(file, line);
  } catch (err) {
    console.error(err);
  }
  process.stdout.write(line);
}

function readOrCreate(fileName, create) {
  const file = path.join(nexusDir(), fileName);
  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, 'utf8').trim();
    if (current) return current;
  }
  const value = create();
  fs.writeFileSync(file, value, 'utf8');
  return value;
}

function engineExecutable() {
  const packaged = path.join(process.resourcesPath, 'dist-engine', 'engine.exe');
  const dev = path.join(__dirname, '..', 'artifacts', 'pdf-engine', 'dist-engine', 'engine.exe');
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  if (fs.existsSync(dev)) return dev;
  if (fs.existsSync(packaged)) return packaged;
  return dev;
}

function spaDirectory() {
  const packaged = path.join(process.resourcesPath, 'spa');
  const dev = path.join(__dirname, '..', 'artifacts', 'workspace-suite', 'dist', 'public');
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  if (fs.existsSync(dev)) return dev;
  return packaged;
}

function randomSecret() {
  return require('crypto').randomBytes(24).toString('hex');
}

const DEFAULT_TEAM_PIN = '945762';

function localPin() {
  const file = path.join(nexusDir(), 'team-pin.txt');
  const freshInstall = !fs.existsSync(path.join(nexusDir(), 'workspace.sqlite'));
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  // Every new install gets 945762. The splash never shows it.
  if (freshInstall || !current) {
    fs.writeFileSync(file, DEFAULT_TEAM_PIN, 'utf8');
    return DEFAULT_TEAM_PIN;
  }
  return current;
}

function startEngine() {
  const exe = engineExecutable();
  if (!fs.existsSync(exe)) {
    throw new Error(`Proposal engine was not found at ${exe}`);
  }
  const dataDir = nexusDir();
  const pin = localPin();
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(ENGINE_PORT),
    WORKSPACE_STORE: 'sqlite',
    WORKSPACE_DATA_DIR: dataDir,
    WEOTT_SPA_DIR: spaDirectory(),
    NEXUS_DESKTOP: '1',
    NEXUS_TEAM_PASSWORD: pin,
    NEXUS_AUTH_SECRET: readOrCreate('auth-secret.txt', randomSecret),
    NEXUS_AUTH_TEST: '1',
  };
  logLine('engine', `spawn ${exe}`);
  engineProc = spawn(exe, [], {
    env,
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const writeEngine = (streamName, chunk) => {
    const text = chunk.toString();
    process[streamName].write(chunk);
    logLine(`engine.${streamName}`, text);
  };
  engineProc.stdout.on('data', (chunk) => writeEngine('stdout', chunk));
  engineProc.stderr.on('data', (chunk) => writeEngine('stderr', chunk));
  engineProc.on('exit', (code) => {
    logLine('engine', `exit ${code ?? 'unknown'}`);
    if (!quitting && splash && !splash.isDestroyed()) {
      splash.webContents.executeJavaScript(
        `window.setSplash && window.setSplash(100, ${JSON.stringify(`Engine stopped (${code ?? 'unknown'})`)})`,
      ).catch(() => {});
    }
  });
  return pin;
}

function stopEngine() {
  const proc = engineProc;
  engineProc = null;
  if (!proc || proc.killed) return;
  if (process.platform === 'win32' && proc.pid) {
    spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true });
    return;
  }
  proc.kill();
}

function getHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${ENGINE_ORIGIN}/`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.setTimeout(2000, () => {
      req.destroy(new Error('health timeout'));
    });
    req.on('error', reject);
  });
}

let lastSplashAt = 0;
let lastSplashLabel = '';
let splashQueue = Promise.resolve();

function splashProgress(percent, label) {
  if (!splash || splash.isDestroyed()) return;
  const now = Date.now();
  const sameLabel = label === lastSplashLabel;
  if (percent < 100 && sameLabel && now - lastSplashAt < 90) return;
  lastSplashAt = now;
  lastSplashLabel = label;
  const target = splash;
  const script = `window.setSplash && window.setSplash(${percent}, ${JSON.stringify(label)})`;
  splashQueue = splashQueue.then(() => {
    if (!target || target.isDestroyed()) return;
    return target.webContents.executeJavaScript(script);
  }).catch(() => {});
}

function readyLabel(imported, fallback) {
  const quotes = imported && Number(imported.quoteCount) > 0 ? Number(imported.quoteCount) : 0;
  const proposals = imported && Number(imported.proposalCount) > 0 ? Number(imported.proposalCount) : 0;
  if (quotes && proposals) return `Ready. ${quotes} quotes and ${proposals} proposals on this computer.`;
  if (quotes) return `Ready. ${quotes} quotes on this computer.`;
  if (proposals) return `Ready. ${proposals} proposals on this computer.`;
  return fallback;
}

async function waitForEngine() {
  const started = Date.now();
  let tick = 0;
  const firstInstall = !fs.existsSync(path.join(nexusDir(), 'workspace.sqlite'));
  while (Date.now() - started < HEALTH_TIMEOUT_MS) {
    tick += 1;
    const elapsed = Date.now() - started;
    // Boot has no byte count. Creep only until the engine answers, then real stages take over.
    const creep = Math.min(52, 8 + Math.round(elapsed / 700));
    splashProgress(creep, firstInstall ? 'Starting the proposal engine' : 'Opening proposal templates');
    try {
      const health = await getHealth();
      if (health && (health.status === 'ok' || health.status === 'degraded')) {
        logLine('health', `status=${health.status} warmup=${Boolean(health.profile_warmup && health.profile_warmup.ok)} templates=${health.templates ?? ''}`);
        const note = health.status === 'ok' ? 'Ready.' : 'Templates need attention.';
        splashProgress(64, 'Opening proposal templates');
        try {
          const imported = await importRenderWorkspace({
            origin: ENGINE_ORIGIN,
            pin: localPin(),
            app,
            onProgress: (percent, label) => splashProgress(percent, label),
          });
          if (imported && imported.skipped && imported.reason === 'local-already-has-quotes') {
            splashProgress(88, 'Opening proposals');
          }
          splashProgress(100, readyLabel(imported, note));
        } catch (err) {
          splashProgress(100, 'Quotes stayed online.');
          console.error(err);
        }
        return health;
      }
    } catch (err) {
      if (tick === 1 || tick % 20 === 0) logLine('health', err instanceof Error ? err.message : String(err));
      /* engine is still importing PyMuPDF and warming templates */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (tick > 400) break;
  }
  throw new Error('The proposal engine did not become ready.');
}

function openMain() {
  logLine('window', 'opening main window');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#102033',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once('ready-to-show', () => {
    logLine('window', 'main ready');
    if (splash && !splash.isDestroyed()) splash.close();
    mainWindow.show();
  });
  mainWindow.on('show', () => logLine('window', 'main shown'));
  mainWindow.on('minimize', () => logLine('window', 'main minimized'));
  mainWindow.on('restore', () => logLine('window', 'main restored'));
  mainWindow.on('close', () => logLine('window', 'main closing'));
  mainWindow.loadURL(`${ENGINE_ORIGIN}/ui/`);
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingUpdate) mainWindow.webContents.send('desktop:update-ready', pendingUpdate);
  });
}

function exportLogs() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const chosen = dialog.showSaveDialogSync({
    title: 'Export diagnostic logs',
    defaultPath: path.join(app.getPath('documents'), `WEOTT-Nexus-Logs-${stamp}.zip`),
    filters: [{ name: 'Zip archive', extensions: ['zip'] }],
  });
  if (!chosen) return { canceled: true };
  const source = logsDir();
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${source.replace(/'/g, "''")}\\*' -DestinationPath '${chosen.replace(/'/g, "''")}' -Force`],
    { windowsHide: true },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').toString();
    logLine('logs', `export failed ${detail}`);
    return { canceled: false, error: detail || 'Could not create the zip archive' };
  }
  logLine('logs', `exported ${chosen}`);
  return { canceled: false, filePath: chosen };
}

function setupAutoUpdater() {
  let autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    logLine('update', err instanceof Error ? err.message : String(err));
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (message) => logLine('update', message),
    warn: (message) => logLine('update', message),
    error: (message) => logLine('update', message),
  };
  autoUpdater.on('update-available', (info) => logLine('update', `available ${info && info.version}`));
  autoUpdater.on('update-downloaded', (info) => {
    logLine('update', `ready ${info && info.version}`);
    pendingUpdate = { version: info && info.version };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:update-ready', pendingUpdate);
    }
  });
  autoUpdater.on('error', (err) => logLine('update', err instanceof Error ? err.message : String(err)));
  if (!app.isPackaged) {
    logLine('update', 'check skipped until the app is installed');
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => logLine('update', err instanceof Error ? err.message : String(err)));
}

ipcMain.handle('desktop:export-logs', () => exportLogs());
ipcMain.handle('desktop:install-update', () => {
  logLine('update', 'quit and install');
  const { autoUpdater } = require('electron-updater');
  autoUpdater.quitAndInstall(false, true);
});

app.whenReady().then(async () => {
  splash = new BrowserWindow({
    width: 960,
    height: 639,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    backgroundColor: '#06101f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  logLine('window', 'splash created');
  await splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.show();
  setupAutoUpdater();
  try {
    const firstInstall = !fs.existsSync(path.join(nexusDir(), 'workspace.sqlite'));
    startEngine();
    splashProgress(8, firstInstall ? 'Starting the proposal engine' : 'Opening proposal templates');
    await waitForEngine();
    openMain();
  } catch (err) {
    splashProgress(100, err instanceof Error ? err.message : String(err));
  }
});

app.on('before-quit', () => {
  quitting = true;
  stopEngine();
});

app.on('window-all-closed', () => {
  quitting = true;
  stopEngine();
  app.quit();
});
