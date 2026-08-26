const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const { WatchPartyServer } = require('./core/watchPartyServer');
const { WatchPartyClient } = require('./core/watchPartyClient');

nativeTheme.themeSource = 'dark';

let mainWindow = null;
let pipWindow = null;
let watchServer = null;
let watchClient = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '../assets/icons/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pipWindow) { pipWindow.close(); pipWindow = null; }
    if (watchServer) { watchServer.stop(); watchServer = null; }
    if (watchClient) { watchClient.disconnect(); watchClient = null; }
  });
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => { if (!mainWindow) createMainWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Window Controls ──────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ── Open File Dialog ─────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Media File',
    filters: [
      { name: 'Video Files', extensions: ['mp4','mkv','avi','mov','wmv','flv','webm','m4v','ts','3gp','ogv'] },
      { name: 'Audio Files', extensions: ['mp3','flac','wav','aac','ogg','opus','m4a','wma'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });
  return result.canceled ? [] : result.filePaths;
});

// ── PiP Window ───────────────────────────────────────────────────
ipcMain.on('pip-open', (_, { src, title }) => {
  if (pipWindow) { pipWindow.focus(); return; }
  pipWindow = new BrowserWindow({
    width: 400,
    height: 240,
    minWidth: 280,
    minHeight: 180,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#000000',
    resizable: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  });
  pipWindow.loadFile(path.join(__dirname, 'renderer/pip.html'));
  pipWindow.once('ready-to-show', () => {
    pipWindow.show();
    pipWindow.webContents.send('pip-init', { src, title });
  });
  pipWindow.on('closed', () => {
    pipWindow = null;
    mainWindow?.webContents.send('pip-closed');
  });
});

ipcMain.on('pip-close', () => { pipWindow?.close(); pipWindow = null; });
ipcMain.on('pip-sync', (_, data) => pipWindow?.webContents.send('pip-sync', data));

// ── Watch Party ──────────────────────────────────────────────────
ipcMain.handle('watch-party-host', async (_, port) => {
  try {
    watchServer = new WatchPartyServer(port || 8765);
    watchServer.on('guest-joined', (info) => mainWindow?.webContents.send('watch-guest-joined', info));
    watchServer.on('chat-msg', (msg) => mainWindow?.webContents.send('watch-chat-msg', msg));
    watchServer.on('sync-request', (data) => mainWindow?.webContents.send('watch-sync-request', data));
    await watchServer.start();
    return { success: true, port: watchServer.port, code: watchServer.getRoomCode() };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('watch-party-join', async (_, { host, port }) => {
  try {
    watchClient = new WatchPartyClient();
    watchClient.on('sync', (data) => mainWindow?.webContents.send('watch-sync', data));
    watchClient.on('chat-msg', (msg) => mainWindow?.webContents.send('watch-chat-msg', msg));
    await watchClient.connect(host, port || 8765);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.on('watch-party-broadcast', (_, data) => {
  if (watchServer) watchServer.broadcast(data);
  else if (watchClient) watchClient.send(data);
});

ipcMain.on('watch-party-stop', () => {
  watchServer?.stop(); watchServer = null;
  watchClient?.disconnect(); watchClient = null;
});
