/**
 * Google Drive アップロード → Slack通知
 * Usage: node scripts/upload-gdrive.mjs
 *
 * 必要な環境変数:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  - サービスアカウントのJSON文字列
 *   GDRIVE_FOLDER_ID             - アップロード先のフォルダID
 *   SLACK_WEBHOOK_URL            - Slack通知用（任意）
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const thisFile = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(thisFile), "..");

async function sendSlack(webhookUrl, text) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
  } catch {
    console.warn("Slack通知に失敗しました（続行します）");
  }
}

async function main() {
  // 前ステップの出力を読み込む
  const outputFilePath = path.join(projectDir, "data", "run-output.json");
  let runOutput;
  try {
    runOutput = JSON.parse(await fsPromises.readFile(outputFilePath, "utf8"));
  } catch {
    console.log("⚠️ run-output.json が見つかりません。生成ステップが失敗した可能性があります。");
    process.exitCode = 1;
    return;
  }
  const { videoPath, episodePath, show, label, caption, dateStr } = runOutput;

  // MP4が存在しなければMP3をアップロード（MP4書き出し失敗時のフォールバック）
  let uploadPath = videoPath;
  let mimeType = "video/mp4";
  try {
    await fsPromises.access(videoPath);
  } catch {
    console.log(`⚠️ MP4が見つかりません。MP3をアップロードします: ${episodePath}`);
    uploadPath = episodePath;
    mimeType = "audio/mpeg";
  }

  // 認証
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません");

  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"]
  });

  const drive = google.drive({ version: "v3", auth });

  const folderId = process.env.GDRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GDRIVE_FOLDER_ID が設定されていません");

  const uploadFileName = path.basename(uploadPath);
  console.log(`📤 アップロード中: ${uploadFileName}`);

  // Google Drive にアップロード
  const response = await drive.files.create({
    requestBody: {
      name: uploadFileName,
      parents: [folderId]
    },
    media: {
      mimeType,
      body: fs.createReadStream(uploadPath)
    },
    fields: "id,webViewLink,name"
  });

  const fileUrl = response.data.webViewLink;
  const fileName = response.data.name;

  console.log(`✅ アップロード完了: ${fileName}`);
  console.log(`🔗 ${fileUrl}`);

  // Slack通知
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (webhookUrl) {
    const emoji = show === "morning" ? "☀️" : show === "afternoon" ? "🌺" : "🌙";
    const message = [
      `${emoji} *${label}が完成しました！* (${dateStr})`,
      `🎬 <${fileUrl}|Google Driveで開く>`,
      ``,
      `*キャプション案:*`,
      `\`\`\``,
      caption,
      `\`\`\``
    ].join("\n");

    await sendSlack(webhookUrl, message);
    console.log("✅ Slack通知送信");
  }
}

main().catch((error) => {
  console.error(`❌ 失敗: ${error.message}`);
  process.exitCode = 1;
});
