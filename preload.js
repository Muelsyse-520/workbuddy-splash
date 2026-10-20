'use strict';
/**
 * preload —— 把最小的宿主接口暴露给开屏页面（页面靠它驱动整条转场）。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashHost', {
  firstPaint: () => ipcRenderer.send('splash:first-paint'),
  done: () => ipcRenderer.send('splash:done'),
  skip: () => ipcRenderer.send('splash:skip')
});
