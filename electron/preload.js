const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('weottDesktop', {
  exportLogs: () => ipcRenderer.invoke('desktop:export-logs'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
  onUpdateReady: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('desktop:update-ready', listener);
    return () => ipcRenderer.removeListener('desktop:update-ready', listener);
  },
});
