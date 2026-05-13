import { defaultSettings, normalizeSettings } from "./settings-store.mjs";

export function createQueueManager({
  generateReadyBlock,
  onBlockCompleted,
  onEpisodeCompleted = async () => null,
  initialSettings = defaultSettings
}) {
  const queue = [];
  let status = "idle";
  let lastError = null;
  let inflight = null;
  let settings = normalizeSettings(initialSettings);
  let episodeCounter = 1;
  let episode = createEpisode(settings, episodeCounter);
  const completed = [];

  async function ensureQueue() {
    if (episode.complete || queue.length > 0 || inflight) {
      return inflight;
    }

    status = "generating";
    lastError = null;
    inflight = generateReadyBlock(settings)
      .then((block) => {
        queue.push(block);
        status = "ready";
        return block;
      })
      .catch((error) => {
        status = "error";
        lastError = error.message;
        throw error;
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  }

  async function completeBlock(blockId, { playedSeconds = 0 } = {}) {
    const index = queue.findIndex((block) => block.id === blockId);
    if (index === -1) {
      return;
    }
    const [block] = queue.splice(index, 1);
    const completion = await onBlockCompleted(block);
    episode.playedSeconds += Math.max(0, Number(playedSeconds) || 0);
    if (completion) {
      completed.unshift({
        id: block.id,
        title: block.title,
        corner: block.corner,
        recordingUrl: completion.recordingUrl
      });
      completed.splice(5);
      episode.recordings.push(completion);
    }
    if (episode.playedSeconds >= episode.targetSeconds) {
      episode.complete = true;
      const recording = await onEpisodeCompleted(episode);
      episode.recordingUrl = recording?.recordingUrl || null;
      status = "complete";
    } else {
      await ensureQueue();
    }
  }

  function updateSettings(input) {
    settings = normalizeSettings(input);
    queue.splice(0);
    completed.splice(0);
    episodeCounter += 1;
    episode = createEpisode(settings, episodeCounter);
    status = "idle";
    lastError = null;
  }

  function getState() {
    return {
      status,
      lastError,
      settings,
      episode: {
        id: episode.id,
        playedSeconds: episode.playedSeconds,
        targetSeconds: episode.targetSeconds,
        complete: episode.complete,
        recordingUrl: episode.recordingUrl
      },
      completed,
      queue: queue.map((block) => ({
        id: block.id,
        title: block.title,
        corner: block.corner,
        summary: block.summary,
        topics: block.topics,
        lines: block.lines.map((line) => ({
          speakerId: line.speakerId,
          speakerName: line.speakerName,
          text: line.text,
          segment: line.segment,
          audioUrl: line.audioUrl
        }))
      }))
    };
  }

  return {
    ensureQueue,
    completeBlock,
    updateSettings,
    getState
  };
}

function createEpisode(settings, counter) {
  return {
    id: `episode-${counter}`,
    targetSeconds: settings.targetMinutes * 60,
    playedSeconds: 0,
    complete: false,
    recordingUrl: null,
    recordings: []
  };
}
