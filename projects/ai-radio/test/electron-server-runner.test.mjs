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

test("createServerProcessOptions prefers npm node path when launched from Electron", () => {
  const nodePath = "C:\\custom-node\\node.exe";
  const options = createServerProcessOptions({
    projectDir,
    port: 49174,
    env: { npm_node_execpath: nodePath }
  });

  assert.equal(options.command, nodePath);
});
