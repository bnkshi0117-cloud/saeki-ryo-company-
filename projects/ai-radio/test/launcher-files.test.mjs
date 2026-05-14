import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Windows app launcher starts the Electron app", async () => {
  const launcher = await fs.readFile(path.join(projectDir, "AIラジオアプリ起動.bat"), "utf8");

  assert.match(launcher, /npm\.cmd run app/);
});

test("desktop shortcut creator points to the app launcher", async () => {
  const script = await fs.readFile(path.join(projectDir, "CreateDesktopShortcut.ps1"), "utf8");

  assert.match(script, /WScript\.Shell/);
  assert.match(script, /QUnjg6njgrjjgqrjgqLjg5fjg6rotbfli5UuYmF0/);
});
