# AIゆんたくラジオ Electron App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `projects/ai-radio` を `npm run app` で起動できるWindows向けElectronデスクトップアプリにする。

**Architecture:** Electronのメインプロセスから既存の `src/server.mjs` を子プロセスとして起動し、準備できたら専用ウィンドウでローカルURLを開く。既存のWeb UI、API、録音、ニュース取得、TTS処理は作り替えずに再利用する。

**Tech Stack:** Node.js ESM, Electron, 既存HTTPサーバー, node:test

---

## File Structure

- Create: `projects/ai-radio/electron/server-runner.cjs`
  - `src/server.mjs` を子プロセス起動する。
  - 起動コマンド、URL、停止処理を管理する。

- Create: `projects/ai-radio/electron/main.cjs`
  - Electronのメインプロセス。
  - `server-runner.cjs` を使って内部サーバーを起動し、BrowserWindowを開く。

- Create: `projects/ai-radio/test/electron-server-runner.test.mjs`
  - 子プロセス起動設定と停止処理をテストする。

- Modify: `projects/ai-radio/package.json`
  - `app` スクリプトと `electron` devDependencyを追加する。

- Modify: `projects/ai-radio/package-lock.json`
  - `npm install` によって更新する。

---

### Task 1: Add Server Runner

**Files:**
- Create: `projects/ai-radio/electron/server-runner.cjs`
- Test: `projects/ai-radio/test/electron-server-runner.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `projects/ai-radio/test/electron-server-runner.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServerProcessOptions } from "../electron/server-runner.cjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("createServerProcessOptions starts the existing server module", () => {
  const options = createServerProcessOptions({ projectDir, port: 49173 });

  assert.equal(options.command, process.execPath);
  assert.deepEqual(options.args, ["src/server.mjs"]);
  assert.equal(options.cwd, projectDir);
  assert.equal(options.env.AI_RADIO_PORT, "49173");
  assert.equal(options.url, "http://127.0.0.1:49173");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd projects/ai-radio
npm.cmd test -- test/electron-server-runner.test.mjs
```

Expected: FAIL with module not found for `electron/server-runner.cjs`.

- [ ] **Step 3: Implement minimal server runner**

Create `projects/ai-radio/electron/server-runner.cjs`:

```js
const { spawn } = require("node:child_process");

function createServerProcessOptions({ projectDir, port = 4173, env = process.env }) {
  return {
    command: process.execPath,
    args: ["src/server.mjs"],
    cwd: projectDir,
    env: {
      ...env,
      AI_RADIO_PORT: String(port)
    },
    url: `http://127.0.0.1:${port}`
  };
}

function startServer(options) {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "pipe",
    windowsHide: true
  });

  return {
    child,
    url: options.url,
    stop() {
      if (!child.killed) {
        child.kill();
      }
    }
  };
}

module.exports = {
  createServerProcessOptions,
  startServer
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd projects/ai-radio
npm.cmd test -- test/electron-server-runner.test.mjs
```

Expected: PASS.

---

### Task 2: Add Electron Main Process

**Files:**
- Create: `projects/ai-radio/electron/main.cjs`
- Modify: `projects/ai-radio/package.json`

- [ ] **Step 1: Add Electron dependency and app script**

Run:

```powershell
cd projects/ai-radio
npm.cmd install --save-dev electron
```

Then modify `projects/ai-radio/package.json` scripts:

```json
{
  "scripts": {
    "start": "node src/server.mjs",
    "test": "node --test",
    "app": "electron electron/main.cjs"
  }
}
```

- [ ] **Step 2: Create Electron main process**

Create `projects/ai-radio/electron/main.cjs`:

```js
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
    const options = createServerProcessOptions({ projectDir, port: Number(process.env.AI_RADIO_PORT || 4173) });
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
```

- [ ] **Step 3: Check syntax**

Run:

```powershell
cd projects/ai-radio
node --check electron\main.cjs
node --check electron\server-runner.cjs
```

Expected: no output and exit code 0.

---

### Task 3: Verify App Launch

**Files:**
- No code changes expected unless verification finds a bug.

- [ ] **Step 1: Run all automated tests**

Run:

```powershell
cd projects/ai-radio
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 2: Launch Electron app**

Run:

```powershell
cd projects/ai-radio
npm.cmd run app
```

Expected:

- A desktop window opens.
- The title is `佐伯亮のAIゆんたくラジオ`.
- The existing radio UI appears.
- No separate `npm start` terminal is needed.

- [ ] **Step 3: Close the Electron window**

Close the window.

Expected:

- The app exits.
- No extra Node server keeps using port `4173`.

Check with:

```powershell
netstat -ano | findstr :4173
```

Expected: no active listener for `:4173`.

---

### Task 4: Commit Electron App Scaffold

**Files:**
- `projects/ai-radio/electron/server-runner.cjs`
- `projects/ai-radio/electron/main.cjs`
- `projects/ai-radio/test/electron-server-runner.test.mjs`
- `projects/ai-radio/package.json`
- `projects/ai-radio/package-lock.json`

- [ ] **Step 1: Review diff**

Run:

```powershell
git diff -- projects/ai-radio/electron projects/ai-radio/test/electron-server-runner.test.mjs projects/ai-radio/package.json projects/ai-radio/package-lock.json
```

Expected: only Electron app scaffold changes are shown.

- [ ] **Step 2: Stage files**

Run:

```powershell
git add projects/ai-radio/electron projects/ai-radio/test/electron-server-runner.test.mjs projects/ai-radio/package.json projects/ai-radio/package-lock.json
```

- [ ] **Step 3: Commit**

Run:

```powershell
git commit -m "feat: add Electron launcher for AI radio"
```

Expected: commit succeeds.
