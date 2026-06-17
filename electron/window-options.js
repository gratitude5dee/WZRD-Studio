export function createMainWindowOptions({ preloadPath, iconPath } = {}) {
  return {
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: "WZRD Studio",
    backgroundColor: "#050506",
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: true,
    },
  };
}
