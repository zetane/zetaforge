// import { BrowserWindow, app, ipcMain, shell } from 'electron'
import { BrowserWindow, Menu, MenuItemConstructorOptions, app, ipcMain, shell } from 'electron';

import * as Sentry from "@sentry/electron";
import { createIPCHandler } from 'electron-trpc/main';
import { release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import "../../polyfill/crypto";
import { startExpressServer } from "../../server/express.mjs";
import { update } from './update';

Sentry.init({ dsn: "https://7fb18e8e487455a950298625457264f3@o1096443.ingest.us.sentry.io/4507031960223744" });


const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import { appRouter } from "../../server/router";

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.DIST_ELECTRON = join(__dirname, '../')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

const targetValue = '--is_dev'
const targetIndex = process.argv.indexOf(targetValue);
if (targetIndex !== -1) {
  const value = process.argv[targetIndex];
  process.env.VITE_ZETAFORGE_IS_DEV = 'True'
} else {
  process.env.VITE_ZETAFORGE_IS_DEV = 'False'
}

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.mjs')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(process.env.DIST, 'index.html')

const isMac = process.platform === 'darwin'
const menuTemplate: Electron.MenuItemConstructorOptions[] = [
  ...(isMac? 
    [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
      ] as MenuItemConstructorOptions[]
    }]
    : []
  ),
  {
    label: 'Edit',
    submenu: [
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'quit' },
    ],
  },
];

async function createWindow() {
  win = new BrowserWindow({
    title: 'ZetaForge',
    icon: join(process.env.VITE_PUBLIC, 'zetane.png'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      contextIsolation: true,
    },
  })

  createIPCHandler({ router: appRouter, windows: [win] });
 
  // Pass the menuTemplate
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  ipcMain.handle('get-path', (_, arg) => {
    return app.getPath(arg)
  })

  if (url) { // electron-vite-vue#298
    win.loadURL(url)
    // Open devTool if the app is not packaged
    //win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) { shell.openExternal(url) }
    return { action: 'deny' }
  })

  // Apply electron-updater
  update(win)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})


startExpressServer();
