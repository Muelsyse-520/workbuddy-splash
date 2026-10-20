'use strict';
/**
 * WorkBuddy 开屏特效 —— 通用 Electron 外壳
 *
 * 流程：
 *   1. 全屏无边框窗口播放开屏动画（海洋 → 蓝色光刃擦除 → 启屏页）
 *   2. 落到启屏页 → 点击「进入」或超时 → 整窗平滑淡出并退出
 *   3. 可选：config.target 指向一个可执行文件，首帧时并行拉起它（开屏结束后即露出）
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch {
  cfg = {};
}

const TARGET = cfg.target || '';
const WINDOWED = process.argv.includes('--windowed');
let win = null;
let quitting = false;
let spawned = false;

function createWindow() {
  const full = !WINDOWED && cfg.fullscreen !== false;
  const area = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    x: full ? area.x : undefined,
    y: full ? area.y : undefined,
    width: full ? area.width : (cfg.width || 1280),
    height: full ? area.height : (cfg.height || 720),
    frame: false,
    resizable: false,
    movable: !full,
    show: false,
    backgroundColor: '#000000',
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setMenu(null);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'splash-html', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.on('closed', () => { win = null; });
}

function spawnTarget() {
  if (spawned || !TARGET) return;
  if (!fs.existsSync(TARGET)) {
    console.warn('[splash] target not found:', TARGET);
    return;
  }
  spawned = true;
  try {
    const child = spawn(TARGET, [], { cwd: path.dirname(TARGET), detached: true, stdio: 'ignore' });
    child.unref();
    console.log('[splash] spawned target:', TARGET);
  } catch (e) {
    console.warn('[splash] spawn failed:', e && e.message);
  }
}

/* 平滑淡出后退出（≈470ms），避免开屏与真实界面硬切 */
function finish() {
  if (quitting) return;
  quitting = true;
  if (!win || win.isDestroyed()) return quitNow();

  let o = 1;
  const t = setInterval(() => {
    o -= 0.06;
    if (o <= 0 || !win || win.isDestroyed()) { clearInterval(t); quitNow(); return; }
    try { win.setOpacity(o); } catch { clearInterval(t); quitNow(); }
  }, 28);
}

function quitNow() {
  try { app.exit(0); } catch { process.exit(0); }
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.exit(0);

ipcMain.on('splash:first-paint', () => spawnTarget());
ipcMain.on('splash:done', () => finish());
ipcMain.on('splash:skip', () => { if (!spawned) spawnTarget(); finish(); });

app.whenReady().then(() => {
  createWindow();
  // 兜底：无论页面如何，最长存活时间后强制收尾，绝不永久驻留
  setTimeout(() => { if (!quitting) finish(); }, cfg.maxWaitMs || 60000);
});

app.on('window-all-closed', () => quitNow());
