const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  notifyReady: () => ipcRenderer.send('billworld:renderer-ready'),
  pickFiles: () => ipcRenderer.invoke('billworld:pick-files'),
  onOpenFiles: (callback) => {
    const listener = (_event, files) => callback(files);
    ipcRenderer.on('billworld:open-files', listener);
    ipcRenderer.send('billworld:renderer-ready');
    return () => ipcRenderer.removeListener('billworld:open-files', listener);
  },
});
