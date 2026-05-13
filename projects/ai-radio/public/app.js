const speakerEl = document.querySelector("#speaker");
const lineEl = document.querySelector("#line");
const cornerEl = document.querySelector("#corner");
const statusEl = document.querySelector("#status");
const queueEl = document.querySelector("#queue");
const episodeTimeEl = document.querySelector("#episode-time");
const newsPanelEl = document.querySelector("#news-panel");
const newsListEl = document.querySelector("#news-list");
const logEl = document.querySelector("#log");
const recordingsEl = document.querySelector("#recordings");
const settingsForm = document.querySelector("#settings-form");
const themeInput = document.querySelector("#theme");
const targetMinutesInput = document.querySelector("#target-minutes");
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
  renderNews(block?.newsItems || []);

  if (state.settings) {
    themeInput.value = state.settings.theme;
    targetMinutesInput.value = String(state.settings.targetMinutes);
  }

  if (state.episode) {
    episodeTimeEl.textContent = `${formatSeconds(state.episode.playedSeconds)} / ${formatSeconds(state.episode.targetSeconds)}`;
  }

  renderRecordings(state.completed || [], state.episode);
}

function appendLog(line) {
  const item = document.createElement("li");
  item.textContent = `${line.speakerName}: ${line.text}`;
  logEl.prepend(item);
  while (logEl.children.length > 20) {
    logEl.lastElementChild.remove();
  }
}

function renderNews(items) {
  newsListEl.replaceChildren();
  newsPanelEl.hidden = items.length === 0;

  for (const item of items) {
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${item.title} (${item.source})`;
    row.append(link);
    newsListEl.append(row);
  }
}

function playAudio(url) {
  return new Promise((resolve, reject) => {
    currentAudio = new Audio(url);
    currentAudio.addEventListener("ended", () => {
      resolve(Number.isFinite(currentAudio.duration) ? currentAudio.duration : 0);
    }, { once: true });
    currentAudio.addEventListener("error", reject, { once: true });
    currentAudio.play().catch(reject);
  });
}

async function completeBlock(blockId, playedSeconds) {
  const response = await fetch(`/api/complete/${encodeURIComponent(blockId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playedSeconds })
  });
  if (response.ok) {
    updateState(await response.json());
  }
}

async function saveSettings(event) {
  event.preventDefault();
  stopped = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      theme: themeInput.value,
      targetMinutes: Number(targetMinutesInput.value)
    })
  });
  updateState(await response.json());
}

function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function renderRecordings(recordings, episode) {
  recordingsEl.replaceChildren();

  if (episode?.recordingUrl) {
    recordingsEl.append(createRecordingLink("番組全体の録音", episode.recordingUrl));
  }

  for (const recording of recordings) {
    if (recording.recordingUrl) {
      recordingsEl.append(createRecordingLink(`ブロック録音: ${recording.title}`, recording.recordingUrl));
    }
  }
}

function createRecordingLink(label, url) {
  const link = document.createElement("a");
  link.className = "recording-link";
  link.href = url;
  link.textContent = label;
  link.target = "_blank";
  link.rel = "noreferrer";
  return link;
}

async function playLoop() {
  while (!stopped) {
    const state = await fetchState();
    updateState(state);
    const block = state.queue[0];

    if (state.episode?.complete) {
      speakerEl.textContent = "番組終了";
      lineEl.textContent = "指定した長さまで再生しました。録音リンクからMP3を開けます。";
      stopped = true;
      break;
    }

    if (!block) {
      speakerEl.textContent = "生成待ち";
      lineEl.textContent = "次のブロックを準備しています。";
      await new Promise((resolve) => setTimeout(resolve, 2500));
      continue;
    }

    let playedSeconds = 0;
    for (const line of block.lines) {
      if (stopped) {
        break;
      }
      speakerEl.textContent = line.speakerName;
      lineEl.textContent = line.text;
      appendLog(line);
      playedSeconds += await playAudio(line.audioUrl);
    }

    if (!stopped) {
      await completeBlock(block.id, playedSeconds);
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

settingsForm.addEventListener("submit", saveSettings);

fetchState().then(updateState).catch((error) => {
  statusEl.textContent = "error";
  lineEl.textContent = error.message;
});
