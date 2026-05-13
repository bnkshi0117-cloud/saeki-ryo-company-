import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.mjs";
import { loadMemory, appendMemory } from "./memory-store.mjs";
import { generateScriptBlock } from "./script-generator.mjs";
import { synthesizeBlock } from "./tts-xai.mjs";
import { createQueueManager } from "./queue-manager.mjs";
import { saveBlockRecording } from "./recording-store.mjs";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"]
]);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function serveFile(res, baseDir, requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(baseDir, safePath));
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": contentTypes.get(path.extname(filePath)) || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

export async function createServer() {
  const config = getConfig();
  const showConfig = await readJson(config.showConfigPath);

  const manager = createQueueManager({
    generateReadyBlock: async () => {
      const memory = await loadMemory(config.memoryPath);
      const scriptBlock = await generateScriptBlock({ config, showConfig, memory });
      return synthesizeBlock({ config, showConfig, block: scriptBlock });
    },
    onBlockCompleted: async (block) => {
      const recording = await saveBlockRecording({ config, block });
      await appendMemory(config.memoryPath, {
        id: block.id,
        summary: block.summary,
        topics: block.topics,
        corner: block.corner,
        recordingUrl: recording?.recordingUrl || null
      });
      manager.ensureQueue().catch(() => {});
      return recording;
    }
  });

  manager.ensureQueue().catch(() => {});

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/state") {
      await manager.ensureQueue().catch(() => {});
      sendJson(res, 200, manager.getState());
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/complete/")) {
      const blockId = decodeURIComponent(url.pathname.replace("/api/complete/", ""));
      await manager.completeBlock(blockId);
      sendJson(res, 200, manager.getState());
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/audio/")) {
      await serveFile(res, config.audioDir, url.pathname.replace("/audio", ""));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/recordings/")) {
      await serveFile(res, config.recordingsDir, url.pathname.replace("/recordings", ""));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/bgm/")) {
      await serveFile(res, config.bgmDir, url.pathname.replace("/bgm", ""));
      return;
    }

    if (req.method === "GET") {
      await serveFile(res, config.publicDir, url.pathname);
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  });

  return { server, config };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { server, config } = await createServer();
  server.listen(config.port, () => {
    console.log(`佐伯亮AIラジオ: http://localhost:${config.port}`);
  });
}
