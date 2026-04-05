import { execSync, exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// FFmpegのパス（wingetでインストール済み）
const FFMPEG = "C:\\Users\\bnksh\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe";
const FFPROBE = FFMPEG.replace("ffmpeg.exe", "ffprobe.exe");

// 最新のスクリプトJSONを読み込む
function loadLatestScript() {
  const outDir = path.join(ROOT, "output");
  const files = fs.readdirSync(outDir)
    .filter(f => f.endsWith("-script.json"))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error("スクリプトファイルが見つかりません。先にnpm run fetchを実行してください。");
  const filePath = path.join(outDir, files[0]);
  console.log(`  📄 スクリプト読み込み: ${files[0]}`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// Windows標準TTSで音声生成（Microsoft Haruka Desktop / ja-JP）
async function generateAudio(text, outputPath) {
  const wavPath = outputPath.replace(/\.mp3$/, ".wav");
  const psScriptPath = outputPath.replace(/\.mp3$/, ".ps1");

  // テキストをUTF-8ファイルに書き出してPowerShellから読み込む
  const textFilePath = outputPath.replace(/\.mp3$/, ".txt");
  fs.writeFileSync(textFilePath, text, "utf-8");

  const ps = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Haruka Desktop')
$synth.Rate = 1
$wavPath = '${wavPath.replace(/\\/g, "\\\\")}'
$textPath = '${textFilePath.replace(/\\/g, "\\\\")}'
$text = [System.IO.File]::ReadAllText($textPath, [System.Text.Encoding]::UTF8)
$synth.SetOutputToWaveFile($wavPath)
$synth.Speak($text)
$synth.Dispose()
`.trim();

  fs.writeFileSync(psScriptPath, ps, "utf-8");
  await execAsync(`powershell.exe -ExecutionPolicy Bypass -File "${psScriptPath}"`);

  // 後片付け
  fs.unlinkSync(psScriptPath);
  fs.unlinkSync(textFilePath);

  // WAV → MP3変換
  await execAsync(`"${FFMPEG}" -y -i "${wavPath}" -b:a 128k "${outputPath}"`);
  fs.unlinkSync(wavPath);
}

// 音声の長さを取得（秒）
async function getAudioDuration(audioPath) {
  const { stdout } = await execAsync(
    `"${FFPROBE}" -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
  );
  return parseFloat(stdout.trim());
}

// FFmpegで動画生成
async function generateVideo(script, audioPath, outputPath) {
  const duration = await getAudioDuration(audioPath);
  const totalDuration = duration + 1.5; // 末尾に余白

  // 色コード
  const BG_COLOR = "1a1a1a";       // 背景（ほぼ黒）
  const ACCENT_COLOR = "e63329";   // 赤（自民党カラー）
  const TEXT_COLOR = "ffffff";     // 白テロップ
  const SUB_COLOR = "cccccc";      // サブテキスト

  // フォント（Windowsシステムフォント）
  const fontPath = "C\\:/Windows/Fonts/meiryo.ttc";

  // テキストのエスケープ（FFmpeg用）
  function escText(t) {
    return t
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\u2019")
      .replace(/:/g, "\\:")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  const hook = escText(script.hook);
  const points = script.points.map(escText);
  const thumbText = escText(script.thumbnail_text || "");
  const newsTitle = escText(script.news_title?.slice(0, 30) || "政治ニュース");

  // シーン秒数の割り当て
  const hookDur = 3.0;
  const pointDur = (duration - hookDur - 2.5) / 3;
  const ctaDur = 2.5;

  // ポイント表示タイミング
  const p1Start = hookDur;
  const p2Start = hookDur + pointDur;
  const p3Start = hookDur + pointDur * 2;
  const ctaStart = totalDuration - ctaDur;

  const filters = [
    // 背景
    `color=c=#${BG_COLOR}:size=1080x1920:duration=${totalDuration}[bg]`,

    // 赤いアクセントライン（上部）
    `[bg]drawbox=x=0:y=0:w=1080:h=12:color=#${ACCENT_COLOR}:t=fill[bg1]`,

    // 赤いアクセントライン（下部）
    `[bg1]drawbox=x=0:y=1908:w=1080:h=12:color=#${ACCENT_COLOR}:t=fill[bg2]`,

    // チャンネル名（上部）
    `[bg2]drawtext=fontfile='${fontPath}':text='政治ニュース速報':fontsize=36:fontcolor=#${ACCENT_COLOR}:x=(w-text_w)/2:y=40[bg3]`,

    // ニュースタイトル（小さめ）
    `[bg3]drawtext=fontfile='${fontPath}':text='${newsTitle}':fontsize=32:fontcolor=#${SUB_COLOR}:x=(w-text_w)/2:y=100:enable='between(t,0,${totalDuration})'[bg4]`,

    // フック（冒頭3秒、大きく）
    `[bg4]drawtext=fontfile='${fontPath}':text='${hook}':fontsize=72:fontcolor=#${TEXT_COLOR}:x=(w-text_w)/2:y=(h-text_h)/2-80:enable='between(t,0,${hookDur})':shadowcolor=black:shadowx=3:shadowy=3[bg5]`,

    // ポイント1
    `[bg5]drawtext=fontfile='${fontPath}':text='▶ ${points[0] || ""}':fontsize=56:fontcolor=#${TEXT_COLOR}:x=80:y=700:enable='between(t,${p1Start},${p2Start})':shadowcolor=black:shadowx=2:shadowy=2[bg6]`,

    // ポイント2
    `[bg6]drawtext=fontfile='${fontPath}':text='▶ ${points[1] || ""}':fontsize=56:fontcolor=#${TEXT_COLOR}:x=80:y=700:enable='between(t,${p2Start},${p3Start})':shadowcolor=black:shadowx=2:shadowy=2[bg7]`,

    // ポイント3
    `[bg7]drawtext=fontfile='${fontPath}':text='▶ ${points[2] || ""}':fontsize=56:fontcolor=#${TEXT_COLOR}:x=80:y=700:enable='between(t,${p3Start},${ctaStart})':shadowcolor=black:shadowx=2:shadowy=2[bg8]`,

    // CTA
    `[bg8]drawtext=fontfile='${fontPath}':text='👍 チャンネル登録お願いします！':fontsize=48:fontcolor=#${ACCENT_COLOR}:x=(w-text_w)/2:y=1700:enable='between(t,${ctaStart},${totalDuration})':shadowcolor=black:shadowx=2:shadowy=2[out]`,
  ];

  const filterStr = filters.join(";");

  const cmd = [
    `"${FFMPEG}" -y`,
    `-f lavfi -i "color=c=#${BG_COLOR}:size=1080x1920:duration=${totalDuration}"`,
    `-i "${audioPath}"`,
    `-filter_complex "${filterStr}"`,
    `-map "[out]" -map 1:a`,
    `-c:v libx264 -preset fast -crf 23`,
    `-c:a aac -b:a 128k`,
    `-pix_fmt yuv420p`,
    `-shortest`,
    `"${outputPath}"`,
  ].join(" ");

  console.log("  🎬 FFmpeg実行中...");
  await execAsync(cmd);
}

// メイン
const today = new Date().toISOString().split("T")[0];
const audioPath = path.join(ROOT, "output", `${today}-audio.mp3`);
const videoPath = path.join(ROOT, "output", `${today}-shorts.mp4`);

console.log("📹 動画生成開始");

const script = loadLatestScript();

console.log("🎙️  音声生成中...");
await generateAudio(script.narration, audioPath);
console.log(`  ✅ 音声保存: ${audioPath}`);

console.log("🎬 動画合成中...");
await generateVideo(script, audioPath, videoPath);
console.log(`  ✅ 動画保存: ${videoPath}`);

console.log(`\n🎉 完成！`);
console.log(`  動画: ${videoPath}`);
console.log(`  サムネ用テキスト: ${script.thumbnail_text}`);
