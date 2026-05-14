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
  let finalBlock = null;
  let finalInflight = null;
  let settings = normalizeSettings(initialSettings);
  let episodeCounter = 1;
  let episode = createEpisode(settings, episodeCounter);
  const completed = [];

  async function ensureQueue({ maxQueue = 2 } = {}) {
    if (episode.complete || queue.length >= maxQueue || inflight) {
      return inflight;
    }

    status = "generating";
    lastError = null;
    const isFirstBlock = episode.blockCount === 0;
    const isFinalBlock = episode.closingStarted === true;
    inflight = generateReadyBlock(settings, { isFirstBlock, isFinalBlock })
      .then((block) => {
        assertPlayableBlock(block);
        episode.blockCount += 1;
        queue.push(block);
        status = "ready";
        if (!isFinalBlock && episode.blockCount === 1) {
          primeFinalBlock();
        }
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

  function primeFinalBlock() {
    if (episode.complete || episode.closingStarted || finalBlock || finalInflight) {
      return finalInflight;
    }

    finalInflight = generateReadyBlock(settings, { isFirstBlock: false, isFinalBlock: true })
      .then((block) => {
        assertPlayableBlock(block);
        finalBlock = { ...block, isFinalBlock: true };
        return finalBlock;
      })
      .catch(() => null)
      .finally(() => {
        finalInflight = null;
      });

    return finalInflight;
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
    if (block.isFinalBlock) {
      episode.complete = true;
      const recording = await onEpisodeCompleted(episode);
      episode.recordingUrl = recording?.recordingUrl || null;
      status = "complete";
    } else if (episode.playedSeconds >= episode.targetSeconds) {
      episode.closingStarted = true;
      queue.splice(0);
      if (finalBlock) {
        queue.push(finalBlock);
        finalBlock = null;
        status = "ready";
      } else {
        await finalInflight;
        if (finalBlock) {
          queue.push(finalBlock);
          finalBlock = null;
          status = "ready";
        } else {
          await ensureQueue();
        }
      }
    } else {
      await ensureQueue();
    }
  }

  function updateSettings(input) {
    settings = normalizeSettings(input);
    queue.splice(0);
    finalBlock = null;
    finalInflight = null;
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
        newsItems: block.newsItems || [],
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
    preload: () => ensureQueue({ maxQueue: 3 }),
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
    recordings: [],
    blockCount: 0,
    closingStarted: false
  };
}

function assertPlayableBlock(block) {
  const lines = Array.isArray(block?.lines) ? block.lines : [];
  const playableLines = lines.filter((line) => typeof line.audioUrl === "string" && line.audioUrl.trim() !== "");
  if (playableLines.length === 0) {
    throw new Error("Ready block requires playable audio lines.");
  }
}
