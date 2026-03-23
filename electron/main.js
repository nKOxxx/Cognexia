/**
 * Cognexia Electron - Main Process
 * Handles app lifecycle, server spawning, and window management
 */

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');

// Configuration
const APP_NAME = 'Cognexia';
const SERVER_PORT = 10000;
const WINDOW_WIDTH = 1200;
const WINDOW_HEIGHT = 800;

// Track the server process
let serverProcess = null;
let mainWindow = null;

// Determine if we're in development or production
const isDev = !app.isPackaged;

/**
 * Start the Cognexia server
 */
function startServer() {
  return new Promise((resolve, reject) => {
    // Check if server is already running
    const checkPort = exec(`lsof -i :${SERVER_PORT} -sTCP:LISTEN`, (err, stdout) => {
      if (stdout.includes(`:${SERVER_PORT}`)) {
        console.log(`[Cognexia] Server already running on port ${SERVER_PORT}`);
        resolve(true);
        return;
      }

      // Start the server using the bundled server.js
      const serverPath = isDev 
        ? path.join(__dirname, '..', 'server.js')
        : path.join(process.resourcesPath, 'app', 'server.js');
      
      serverProcess = spawn('node', [serverPath], {
        env: { 
          ...process.env, 
          PORT: SERVER_PORT,
          ELECTRON_RUN: 'true'
        },
        stdio: 'pipe'
      });

      serverProcess.stdout.on('data', (data) => {
        console.log(`[Cognexia Server] ${data}`);
      });

      serverProcess.stderr.on('data', (data) => {
        console.error(`[Cognexia Server Error] ${data}`);
      });

      serverProcess.on('error', (err) => {
        console.error('[Cognexia] Failed to start server:', err);
        reject(err);
      });

      // Wait for server to be ready
      const maxWait = 10000;
      const startTime = Date.now();
      
      const waitForServer = () => {
        exec(`lsof -i :${SERVER_PORT} -sTCP:LISTEN`, (err, stdout) => {
          if (stdout.includes(`:${SERVER_PORT}`)) {
            console.log(`[Cognexia] Server ready on port ${SERVER_PORT}`);
            resolve(true);
          } else if (Date.now() - startTime < maxWait) {
            setTimeout(waitForServer, 100);
          } else {
            reject(new Error('Server startup timeout'));
          }
        });
      };

      waitForServer();
    });
  });
}

/**
 * Stop the Cognexia server
 */
function stopServer() {
  if (serverProcess) {
    console.log('[Cognexia] Stopping server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  
  // Also kill any node process on port 10000 (cleanup)
  exec(`lsof -ti :${SERVER_PORT} | xargs kill 2>/dev/null || true`, () => {});
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    backgroundColor: '#1a1a2e'
  });

  // Build application menu
  const menuTemplate = buildMenu();
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Load the app
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('[Cognexia] Window displayed');
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * Build the application menu
 */
function buildMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { label: `About ${APP_NAME}`, click: showAbout },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: `Quit ${APP_NAME}`, click: () => app.quit() }
      ]
    }] : []),
    
    // File menu
    {
      label: 'File',
      submenu: [
        { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { 
          label: 'Toggle Developer Tools', 
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools() 
        }
      ]
    },
    
    // Help menu
    {
      label: 'Help',
      submenu: [
        { label: `About ${APP_NAME}`, click: showAbout },
        { type: 'separator' },
        { 
          label: 'Documentation', 
          click: () => require('electron').shell.openExternal('https://github.com/nKOxxx/Cognexia') 
        }
      ]
    }
  ];

  return template;
}

/**
 * Show about dialog
 */
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail: `Version ${app.getVersion()}\n\nLong-term memory for AI agents.\nData Lake Edition with project-based isolation.`
  });
}

// App lifecycle events
app.whenReady().then(async () => {
  console.log('[Cognexia] Starting application...');
  
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('[Cognexia] Failed to start:', err);
    dialog.showErrorBox('Startup Error', `Failed to start Cognexia server: ${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopServer();
});

// IPC handlers for renderer process
ipcMain.handle('app:info', () => ({
  name: APP_NAME,
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch
}));

ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:minimize', () => mainWindow?.minimize());
ipcMain.handle('app:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('server:status', () => ({
  running: serverProcess !== null,
  port: SERVER_PORT
}));
