export function measuredPlaybackSeconds({ startedAtMs, endedAtMs, metadataDurationSeconds }) {
  const elapsedSeconds = (Number(endedAtMs) - Number(startedAtMs)) / 1000;
  if (Number.isFinite(elapsedSeconds) && elapsedSeconds > 0) {
    return elapsedSeconds;
  }

  return Number.isFinite(metadataDurationSeconds) && metadataDurationSeconds > 0
    ? metadataDurationSeconds
    : 0;
}
