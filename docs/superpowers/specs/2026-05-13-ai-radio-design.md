# Saeki Ryo AI Radio Design

## Goal

Build a local "Saeki Ryo AI Radio" MVP that starts from the command line, opens in a browser, and keeps generating and playing radio blocks with minimal manual control.

The first version targets a nearly automatic local radio experience. If it works well, the next phase is an OBS/YouTube Live-ready broadcast screen.

## Creative Direction

The show is an AI-generated talk radio program centered on Okinawa daily life and practical AI experiments.

The tone should feel closer to a late-night comedian radio show than a formal information program:

- Two-person banter with light jokes and natural tangents.
- Okinawa daily details such as weather, humidity, commuting, convenience stores, typhoons, local workday rhythm, and evening atmosphere.
- Practical AI topics such as ChatGPT, Codex, app development, small automations, and trial-and-error with AI tools.
- First-person, "I tried it and this happened" energy.
- No hype like "earn X yen with AI", no follower-count bragging, no attacks on others.

## Show Format

Each generated block should include a mix of these segments:

- Opening banter based on the current time of day.
- Okinawa daily-life talk.
- AI experiment talk.
- A random recurring corner.
- A fictional listener email and response.
- BGM or jingle break.

Recurring corner candidates:

- Today's AI Experiment Report
- Okinawa Everyday Life, AI Translation
- Side Hustle Dream Warning
- Listener AI Consultation Room
- This Week's Codex Reflection
- Today's Tiny Automation
- AI Line We Want to Hear

Version 1 uses AI-generated fictional listener emails. Real listener submissions can be added later through a form or external integration.

## Architecture

Place the app under `projects/ai-radio/`.

The app should be a Node.js local web application with these parts:

- `server`: serves the browser UI, exposes state and audio assets, and coordinates generation.
- `script generator`: uses Anthropic API to create structured radio blocks.
- `tts provider`: uses xAI Text to Speech to turn each line into audio.
- `queue manager`: keeps current and upcoming blocks ready for playback.
- `memory store`: records past topics and corners in a JSON file so blocks do not repeat too much.
- `browser player`: plays generated line audio and BGM while showing the current speaker, line, queue status, and generation status.

## Data Flow

1. On startup, the server loads `.env`, memory, BGM metadata, and show settings.
2. The server generates the first radio block with Anthropic.
3. The server sends each dialogue line to xAI TTS and saves MP3 files under `data/audio/`.
4. The browser fetches the initial queue and starts playback after the user presses start.
5. While the current block plays, the server prepares the next block in the background.
6. After a block finishes, its summary and topics are appended to `data/memory.json`.
7. The loop continues until the user stops the app.

## APIs And Secrets

Use existing root `.env` values:

- `ANTHROPIC_API_KEY` for script generation.
- `XAI_API_KEY` for xAI TTS.

Do not expose secret values in browser code or logs.

xAI TTS should be implemented behind a provider interface so it can be swapped later for OpenAI TTS, VOICEVOX, or a mock provider.

## Initial Files

Expected project layout:

```text
projects/ai-radio/
  package.json
  README.md
  .gitignore
  src/
    server.mjs
    config.mjs
    script-generator.mjs
    tts-xai.mjs
    queue-manager.mjs
    memory-store.mjs
  public/
    index.html
    styles.css
    app.js
  data/
    audio/
    bgm/
    memory.json
    show-config.json
```

## Browser UI

The UI should be a functional radio console, not a marketing page.

It should show:

- Program title.
- Current speaker.
- Current spoken line.
- Segment or corner name.
- Generation status.
- Current queue depth.
- Start and stop controls.
- A compact log of recently played lines.

The design should be polished but utilitarian. It should be readable on desktop first, with responsive behavior for mobile.

## Error Handling

The app should stay usable when one part fails:

- If Anthropic generation fails, retry once and then show an error state.
- If xAI TTS fails for one line, skip that line or use a mock fallback depending on configuration.
- If no BGM files exist, continue with talk-only radio.
- If memory is missing or invalid, recreate a clean memory file.
- If queue generation falls behind playback, show a buffering state instead of crashing.

## Testing And Verification

Minimum verification for v1:

- `npm install` succeeds in `projects/ai-radio/`.
- The app starts locally.
- Browser UI loads.
- A radio block is generated.
- xAI TTS creates at least one playable MP3.
- Start button plays a generated line.
- Memory updates after a block completes.
- No secrets appear in client-side files or console output.

## Later Phases

Phase 2:

- Add OBS-friendly broadcast screen.
- Add full program recording.
- Add real listener submission intake.
- Add richer BGM metadata and mood-based selection.
- Add news or RSS topics, if the show needs current events.

Phase 3:

- YouTube Live workflow with OBS.
- Long-running stability improvements.
- Better voice direction and character tuning.
