# Vertical Video Export

Create a 1080x1920 MP4 from the latest saved radio recording:

```bash
npm run video
```

The video is saved to `data/videos`.

Use a specific recording and title:

```bash
npm run video -- --input data/recordings/episode-1.mp3 --title "AI Yuntaku Radio"
```

The generated video uses:

- the saved MP3 audio
- a dark vertical background
- an animated waveform
- title text for SNS posting
