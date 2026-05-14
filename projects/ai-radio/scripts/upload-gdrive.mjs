/**
 * Google Drive アップロード → Slack通知
 * Usage: node scripts/upload-gdrive.mjs
 *
 * 必要な環境変数:
 *   GOOGLE_CLIENT_ID     - OAuthクライアントID
 *   GOOGLE_CLIENT_SECRET - OAuthクライアントシークレット
 *   GOOGLE_REFRESH_TOKEN - OAuthリフレッシュトークン
 *   GDRIVE_FOLDER_ID     - アップロード先のフォルダID
 *   SLACK_WEBHOOK_URL    - Slack通知用（任意）
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

  // OAuth認証（個人Googleアカウント対応）
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN が設定されていません");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

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
