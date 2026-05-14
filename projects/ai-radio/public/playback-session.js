export function createPlaybackSessionManager() {
  let activeId = 0;
  let running = false;

  function start() {
    if (running) {
      return { started: false, id: activeId };
    }
    activeId += 1;
    running = true;
    return { started: true, id: activeId };
  }

  function stop() {
    activeId += 1;
    running = false;
  }

  function finish(id) {
    if (id === activeId) {
      running = false;
    }
  }

  function isCurrent(id) {
    return running && id === activeId;
  }

  return {
    start,
    stop,
    finish,
    isCurrent
  };
}
