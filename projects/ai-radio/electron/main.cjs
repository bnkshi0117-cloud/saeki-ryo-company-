const path = require("node:path");
const { app, BrowserWindow, dialog } = require("electron");
const { createServerProcessOptions, startServer } = require("./server-runner.cjs");

const projectDir = path.resolve(__dirname, "..");
let serverHandle = null;
let mainWindow = null;

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: "佐伯亮のAIゆんたくラジオ",
    backgroundColor: "#141414",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(url);
}

app.whenReady().then(() => {
  try {
    const options = createServerProcessOptions({
      projectDir,
      port: Number(process.env.AI_RADIO_PORT || 4173)
    });
    serverHandle = startServer(options);
    setTimeout(() => createWindow(serverHandle.url), 1200);
  } catch (error) {
    dialog.showErrorBox("AIラジオを起動できませんでした", error.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (serverHandle) {
    serverHandle.stop();
    serverHandle = null;
  }
  app.quit();
});
