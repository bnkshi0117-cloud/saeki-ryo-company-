/**
 * ASS字幕ファイル生成
 * タイミングはテキスト長から推定（約5文字/秒）
 */

function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

export function estimateDuration(text) {
  return Math.max(1.5, String(text).length / 5);
}

function escapeAss(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\n/g, "\\N");
}

export function buildAssSubtitles(lines, episodeTitle = "佐伯亮のAIゆんたくラジオ") {
  const durations = lines.map((l) => estimateDuration(l.text));
  const totalDuration = durations.reduce((a, b) => a + b, 0) + 2;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Noto Sans CJK JP,26,&H00B9B2A5,&H000000FF,&H00000000,&HA0000000,0,0,0,0,100,100,0,0,1,1,0,8,30,30,40,1
Style: Saeki,Noto Sans CJK JP,36,&H00F4B942,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,40,40,440,1
Style: Higa,Noto Sans CJK JP,36,&H005CC8A7,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,40,40,440,1
Style: Sub_Saeki,Noto Sans CJK JP,28,&H0042B9F4,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,540,1
Style: Sub_Higa,Noto Sans CJK JP,28,&H00A7C85C,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,540,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = [
    // タイトルは常時表示
    `Dialogue: 0,0:00:00.00,${toAssTime(totalDuration)},Title,,0,0,0,,${escapeAss(episodeTitle)}`
  ];

  let currentTime = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const duration = durations[i];
    const start = toAssTime(currentTime);
    const end = toAssTime(currentTime + duration);
    const isSaeki = line.speakerId === "saeki";
    const style = isSaeki ? "Saeki" : "Higa";
    const subStyle = isSaeki ? "Sub_Saeki" : "Sub_Higa";

    events.push(`Dialogue: 0,${start},${end},${style},,0,0,0,,${escapeAss(line.speakerName)}`);
    events.push(`Dialogue: 0,${start},${end},${subStyle},,0,0,0,,${escapeAss(line.text)}`);

    currentTime += duration;
  }

  return header + "\n" + events.join("\n") + "\n";
}
