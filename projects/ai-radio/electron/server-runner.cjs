const { spawn } = require("node:child_process");

function createServerProcessOptions({ projectDir, port = 4173, env = process.env }) {
  return {
    command: env.npm_node_execpath || process.execPath,
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
