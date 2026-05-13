const speakerEl = document.querySelector("#speaker");
const lineEl = document.querySelector("#line");
const cornerEl = document.querySelector("#corner");
const statusEl = document.querySelector("#status");
const queueEl = document.querySelector("#queue");
const logEl = document.querySelector("#log");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");

let stopped = true;
let currentAudio = null;

async function fetchState() {
  const response = await fetch("/api/state");
  if (!response.ok) {
    throw new Error(`state failed: ${response.status}`);
  }
  return response.json();
}

function updateState(state) {
  statusEl.textContent = state.status;
  queueEl.textContent = String(state.queue.length);
  const block = state.queue[0];
  cornerEl.textContent = block?.corner || "-";
}

function appendLog(line) {
  const item = document.createElement("li");
  item.textContent = `${line.speakerName}: ${line.text}`;
  logEl.prepend(item);
  while (logEl.children.length > 20) {
    logEl.lastElementChild.remove();
  }
}

function playAudio(url) {
  return new Promise((resolve, reject) => {
    currentAudio = new Audio(url);
    currentAudio.addEventListener("ended", resolve, { once: true });
    currentAudio.addEventListener("error", reject, { once: true });
    currentAudio.play().catch(reject);
  });
}

async function completeBlock(blockId) {
  await fetch(`/api/complete/${encodeURIComponent(blockId)}`, { method: "POST" });
}

async function playLoop() {
  while (!stopped) {
    const state = await fetchState();
    updateState(state);
    const block = state.queue[0];

    if (!block) {
      speakerEl.textContent = "生成待ち";
      lineEl.textContent = "次のブロックを準備しています。";
      await new Promise((resolve) => setTimeout(resolve, 2500));
      continue;
    }

    for (const line of block.lines) {
      if (stopped) {
        break;
      }
      speakerEl.textContent = line.speakerName;
      lineEl.textContent = line.text;
      appendLog(line);
      await playAudio(line.audioUrl);
    }

    if (!stopped) {
      await completeBlock(block.id);
    }
  }
}

startButton.addEventListener("click", () => {
  if (!stopped) {
    return;
  }
  stopped = false;
  playLoop().catch((error) => {
    speakerEl.textContent = "エラー";
    lineEl.textContent = error.message;
    stopped = true;
  });
});

stopButton.addEventListener("click", () => {
  stopped = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
});

fetchState().then(updateState).catch((error) => {
  statusEl.textContent = "error";
  lineEl.textContent = error.message;
});
