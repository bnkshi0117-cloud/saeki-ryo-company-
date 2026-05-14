import { createPlaybackSessionManager } from "./playback-session.js";
import { playbackStatusText } from "./playback-status.js";
import { shouldStopBgmAfterVoice } from "./bgm-policy.js";

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
const settingsButton = settingsForm.querySelector("button[type='submit']");
const settingsFeedbackEl = document.querySelector("#settings-feedback");
const themeInput = document.querySelector("#theme");
const targetMinutesInput = document.querySelector("#target-minutes");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const bgmSelect = document.querySelector("#bgm-select");
const bgmVolumeInput = document.querySelector("#bgm-volume");

let stopped = true;
let currentAudio = null;
let bgmAudio = null;
const playbackSession = createPlaybackSessionManager();

async function loadBgmList() {
  try {
    const res = await fetch("/api/bgm-list");
    const { files } = await res.json();
    for (const file of files) {
      const option = document.createElement("option");
      option.value = file;
      option.textContent = file;
      bgmSelect.append(option);
    }
  } catch {}
}

function applyBgmVolume() {
  if (bgmAudio) {
    bgmAudio.volume = bgmVolumeInput.value / 100;
  }
}

function startBgm() {
  const file = bgmSelect.value;
  if (!file || bgmAudio) return;
  bgmAudio = new Audio(`/bgm/${encodeURIComponent(file)}`);
  bgmAudio.loop = true;
  bgmAudio.volume = bgmVolumeInput.value / 100;
  bgmAudio.play().catch(() => {});
}

function stopBgm() {
  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio = null;
  }
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio.load();
    currentAudio = null;
  }
}

function showPlaybackStatus(status) {
  const text = playbackStatusText(status);
  speakerEl.textContent = text.speaker;
  lineEl.textContent = text.line;
}

bgmSelect.addEventListener("change", () => {
  stopBgm();
  if (!stopped) startBgm();
});

bgmVolumeInput.addEventListener("input", applyBgmVolume);

loadBgmList();

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

  if (state.status === "generating") {
    settingsFeedbackEl.textContent = "台本と音声を生成中です...";
  } else if (state.status === "ready") {
    settingsFeedbackEl.textContent = "準備できました。開始できます。";
  } else if (state.status === "error") {
    settingsFeedbackEl.textContent = state.lastError ? `生成エラー: ${state.lastError}` : "生成エラーが発生しました。";
  }
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
    let startedAt = 0;
    let settled = false;
    const finish = (seconds) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(seconds);
    };
    currentAudio.addEventListener("play", () => {
      startedAt = performance.now();
    }, { once: true });
    currentAudio.addEventListener("ended", () => {
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      if (Number.isFinite(elapsedSeconds) && elapsedSeconds > 0) {
        finish(elapsedSeconds);
        return;
      }
      finish(Number.isFinite(currentAudio.duration) ? currentAudio.duration : 0);
    }, { once: true });
    currentAudio.addEventListener("pause", () => {
      if (!settled && stopped) {
        finish(0);
      }
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
    const state = await response.json();
    updateState(state);
    return state;
  }
  throw new Error(`complete failed: ${response.status}`);
}

async function saveSettings(event) {
  event.preventDefault();
  playbackSession.stop();
  stopped = true;
  stopCurrentAudio();
  stopBgm();
  settingsButton.disabled = true;
  settingsFeedbackEl.textContent = "次の番組を反映しました。台本と音声を生成しています...";
  statusEl.textContent = "generating";
  speakerEl.textContent = "生成中";
  lineEl.textContent = "準備ができると生成状況が ready になります。ready になってから開始してください。";

  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        theme: themeInput.value,
        targetMinutes: Number(targetMinutesInput.value)
      })
    });
    if (!response.ok) {
      throw new Error(`settings failed: ${response.status}`);
    }
    updateState(await response.json());
  } catch (error) {
    settingsFeedbackEl.textContent = `反映に失敗しました: ${error.message}`;
    statusEl.textContent = "error";
  } finally {
    settingsButton.disabled = false;
  }
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

async function playLoop(sessionId) {
  while (!stopped && playbackSession.isCurrent(sessionId)) {
    const state = await fetchState();
    if (!playbackSession.isCurrent(sessionId)) {
      break;
    }
    updateState(state);
    const block = state.queue[0];

    if (state.episode?.complete) {
      showPlaybackStatus("complete");
      stopped = true;
      playbackSession.finish(sessionId);
      stopBgm();
      break;
    }

    if (!block) {
      stopBgm();
      showPlaybackStatus("waiting");
      await new Promise((resolve) => setTimeout(resolve, 2500));
      continue;
    }

    let playedSeconds = 0;
    const playableLines = block.lines.filter((line) => line.audioUrl);
    if (playableLines.length === 0) {
      throw new Error("readyですが、再生できる音声ファイルがありません。もう一度「次の番組に反映」を押してください。");
    }

    for (const line of playableLines) {
      if (stopped || !playbackSession.isCurrent(sessionId)) {
        break;
      }
      startBgm();
      speakerEl.textContent = line.speakerName;
      lineEl.textContent = line.text;
      appendLog(line);
      try {
        playedSeconds += await playAudio(line.audioUrl);
      } finally {
        if (shouldStopBgmAfterVoice()) {
          stopBgm();
        }
      }
    }

    if (!stopped) {
      const nextState = await completeBlock(block.id, playedSeconds);
      if (nextState?.episode?.complete) {
        showPlaybackStatus("complete");
        stopped = true;
        playbackSession.finish(sessionId);
        stopCurrentAudio();
        stopBgm();
        break;
      }
      if (!nextState?.queue?.length) {
        stopBgm();
        showPlaybackStatus("waiting");
      }
    }
  }
}

startButton.addEventListener("click", () => {
  const session = playbackSession.start();
  if (!session.started) {
    return;
  }
  stopped = false;
  startButton.disabled = true;
  playLoop(session.id).catch((error) => {
    speakerEl.textContent = "エラー";
    lineEl.textContent = error.message;
    stopped = true;
    stopBgm();
  }).finally(() => {
    playbackSession.finish(session.id);
    startButton.disabled = false;
  });
});

stopButton.addEventListener("click", () => {
  playbackSession.stop();
  stopped = true;
  stopCurrentAudio();
  stopBgm();
});

settingsForm.addEventListener("submit", saveSettings);

fetchState().then(updateState).catch((error) => {
  statusEl.textContent = "error";
  lineEl.textContent = error.message;
});

setInterval(() => {
  if (!stopped) {
    return;
  }
  if (document.activeElement === themeInput || document.activeElement === targetMinutesInput) {
    return;
  }
  fetchState().then(updateState).catch(() => {});
}, 2500);
