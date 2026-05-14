/**
 * Google Drive OAuthリフレッシュトークン取得スクリプト（1回だけ実行）
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-gdrive-token.mjs
 */

import { google } from "googleapis";
import readline from "node:readline";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("使い方: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-gdrive-token.mjs");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob"
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/drive.file"],
  prompt: "consent"
});

console.log("\n① 以下のURLをブラウザで開いてください:\n");
console.log(authUrl);
console.log("\n② Googleアカウントでログインして「許可」をクリック");
console.log("③ 表示された認証コードをここに貼り付けてEnter\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("認証コード: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log("\n✅ 取得成功！\n");
    console.log("━━━ GitHub Secretsに以下を追加してください ━━━");
    console.log(`GOOGLE_CLIENT_ID     = ${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET = ${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN = ${tokens.refresh_token}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (error) {
    console.error("❌ 失敗:", error.message);
  }
});
