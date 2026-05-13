export function createQueueManager({ generateReadyBlock, onBlockCompleted }) {
  const queue = [];
  let status = "idle";
  let lastError = null;
  let inflight = null;

  async function ensureQueue() {
    if (queue.length > 0 || inflight) {
      return inflight;
    }

    status = "generating";
    lastError = null;
    inflight = generateReadyBlock()
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

  async function completeBlock(blockId) {
    const index = queue.findIndex((block) => block.id === blockId);
    if (index === -1) {
      return;
    }
    const [block] = queue.splice(index, 1);
    await onBlockCompleted(block);
  }

  function getState() {
    return {
      status,
      lastError,
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
    getState
  };
}
