const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { syncRenderWorkspace, localChangeSignature, login, requestJson } = require('./importRender');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const ENGINE_PORT = 8765;
const ENGINE_ORIGIN = `http://127.0.0.1:${ENGINE_PORT}`;
const HEALTH_PULSE_URL = 'https://electron-y515.onrender.com/api/desktop-health';
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
  // Postgres wins whenever this variable is present. The installed app keeps SQLite.
  delete env.DATABASE_URL;
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
    const req = http.get(`${ENGINE_ORIGIN}/health`, (res) => {
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
    req.setTimeout(700, () => {
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

function engineIsUp(health) {
  const status = health && health.status;
  return status === 'ok' || status === 'degraded' || status === 'warming';
}

let syncingWorkspace = false;
let lastWorkspaceSignature = '';
let lastSyncLabel = 'waiting';
let syncTimer = null;
let watchTimer = null;
let changeTimer = null;

async function readLocalSignature() {
  const token = await login(ENGINE_ORIGIN, localPin());
  const headers = { Authorization: `Bearer ${token}` };
  const quotes = await requestJson(`${ENGINE_ORIGIN}/workspace/quotes`, { headers });
  const proposals = await requestJson(`${ENGINE_ORIGIN}/workspace/proposals`, { headers });
  return localChangeSignature(
    quotes.json && quotes.json.quotes,
    proposals.json && proposals.json.proposals,
  );
}

function runWorkspaceSync(reason) {
  if (syncingWorkspace || quitting) return;
  syncingWorkspace = true;
  logLine('sync', `start ${reason}`);
  void syncRenderWorkspace({
    origin: ENGINE_ORIGIN,
    pin: localPin(),
    app,
  }).then((result) => {
    lastSyncLabel = result && result.skipped ? `skipped ${result.reason || ''}` : `ok ${reason}`;
    logLine('sync', `${reason} ${JSON.stringify(result)}`);
  }).catch((err) => {
    lastSyncLabel = 'failed';
    logLine('sync', err instanceof Error ? err.message : String(err));
  }).finally(() => {
    syncingWorkspace = false;
  });
}

function installId() {
  const file = path.join(nexusDir(), 'install-id.txt');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;
  } catch { /* first launch */ }
  const created = crypto.randomBytes(12).toString('hex');
  fs.mkdirSync(nexusDir(), { recursive: true });
  fs.writeFileSync(file, created, 'utf8');
  return created;
}

function postJson(url, body) {
  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify(body));
    const target = new URL(url);
    const req = https.request({
      hostname: target.hostname,
      path: target.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
      timeout: 8000,
    }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end(payload);
  });
}

async function reportDesktopHealth() {
  let engine = 'down';
  let quoteCount = 0;
  let proposalCount = 0;
  let databaseStatus = 'down';
  try {
    const health = await getHealth();
    engine = health && health.status ? health.status : 'down';
  } catch { /* engine still starting */ }
  try {
    const token = await login(ENGINE_ORIGIN, localPin());
    const headers = { Authorization: `Bearer ${token}` };
    const quotes = await requestJson(`${ENGINE_ORIGIN}/workspace/quotes`, { headers });
    const proposals = await requestJson(`${ENGINE_ORIGIN}/workspace/proposals`, { headers });
    quoteCount = quotes.json && Array.isArray(quotes.json.quotes) ? quotes.json.quotes.length : 0;
    proposalCount = proposals.json && Array.isArray(proposals.json.proposals) ? proposals.json.proposals.length : 0;
    databaseStatus = quotes.status === 200 && proposals.status === 200 ? 'ok' : 'degraded';
  } catch {
    databaseStatus = 'down';
  }
  const ux = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
    ? 'ready'
    : (splash && !splash.isDestroyed() ? 'opening' : 'background');
  const status = engine === 'ok' && databaseStatus === 'ok' && ux === 'ready' ? 'ok' : 'degraded';
  const code = await postJson(HEALTH_PULSE_URL, {
    installId: installId(),
    computerName: os.hostname(),
    appVersion: app.getVersion(),
    platform: `${process.platform} ${os.release()}`,
    ux,
    engine,
    quoteCount,
    proposalCount,
    databaseStatus,
    lastSync: lastSyncLabel,
    status,
  });
  logLine('fleet', `pulse ${code} ux=${ux} engine=${engine} db=${databaseStatus}`);
}

function startWorkspaceSyncLoop() {
  if (syncTimer) return;
  runWorkspaceSync('session');
  syncTimer = setInterval(() => runWorkspaceSync('interval'), 90_000);
  watchTimer = setInterval(() => {
    void readLocalSignature().then((signature) => {
      if (lastWorkspaceSignature && signature !== lastWorkspaceSignature) {
        clearTimeout(changeTimer);
        changeTimer = setTimeout(() => runWorkspaceSync('local-change'), 4000);
      }
      lastWorkspaceSignature = signature;
    }).catch((err) => {
      logLine('sync', err instanceof Error ? err.message : String(err));
    });
  }, 20_000);
}

let healthTimer = null;

function startHealthReports() {
  if (healthTimer) return;
  void reportDesktopHealth();
  healthTimer = setInterval(() => {
    void reportDesktopHealth();
  }, 30_000);
}

async function waitForEngine() {
  const started = Date.now();
  let tick = 0;
  while (Date.now() - started < HEALTH_TIMEOUT_MS) {
    tick += 1;
    const elapsed = Date.now() - started;
    const creep = Math.min(92, 18 + Math.round(elapsed / 70));
    splashProgress(creep, 'Opening Nexus');
    try {
      const health = await getHealth();
      if (engineIsUp(health)) {
        logLine('health', `status=${health.status} warmup=${Boolean(health.profile_warmup && health.profile_warmup.ok)} templates=${health.templates ?? ''}`);
        splashProgress(100, health.status === 'degraded' ? 'Templates need attention.' : 'Ready.');
        return health;
      }
    } catch (err) {
      if (tick === 1 || tick % 40 === 0) logLine('health', err instanceof Error ? err.message : String(err));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
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
  let bootError = null;
  try {
    startEngine();
  } catch (err) {
    bootError = err;
    logLine('engine', err instanceof Error ? err.message : String(err));
  }
  splash = new BrowserWindow({
    width: 1080,
    height: 608,
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
  splashProgress(18, 'Opening Nexus');
  startHealthReports();
  setupAutoUpdater();
  if (bootError) {
    splashProgress(100, bootError instanceof Error ? bootError.message : String(bootError));
    return;
  }
  try {
    await waitForEngine();
    openMain();
    startWorkspaceSyncLoop();
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
