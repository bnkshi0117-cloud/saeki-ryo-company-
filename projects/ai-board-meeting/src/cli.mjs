import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.mjs";
import { generateMeetingLog } from "./meeting-generator.mjs";
import { saveMeetingLog } from "./file-store.mjs";

export function parseArgs(argv) {
  const result = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`値がありません: ${arg}`);
      }
      result[key] = value;
      index += 1;
    } else {
      positional.push(arg);
    }
  }

  if (!result.theme && positional.length > 0) {
    result.theme = positional.join(" ");
  }

  return result;
}

export function createInputFromArgs(args) {
  const theme = args.theme?.trim();
  if (!theme) {
    throw new Error("テーマを指定してください。例: npm start -- \"AIラジオの次の可能性\"");
  }

  const input = { theme };
  for (const key of ["purpose", "constraints", "channels"]) {
    const value = args[key]?.trim();
    if (value) {
      input[key] = value;
    }
  }
  return input;
}

export async function runCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  getConfigImpl = getConfig,
  generateMeetingLogImpl = generateMeetingLog,
  saveMeetingLogImpl = saveMeetingLog,
  setExitCode = (code) => { process.exitCode = code; }
} = {}) {
  let markdown;
  try {
    const args = parseArgs(argv);
    const input = createInputFromArgs(args);
    const config = getConfigImpl();
    markdown = await generateMeetingLogImpl({ config, input });
    const saved = await saveMeetingLogImpl({ meetingLogDir: config.meetingLogDir, markdown });
    stdout.write(`AI役員会ログを保存しました: ${saved.filePath}\n`);
    return saved;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    if (typeof markdown === "string") {
      stderr.write(`保存に失敗しました。生成本文を出力します。\n--- 生成本文 ---\n${markdown}\n`);
    }
    setExitCode(1);
    return null;
  }
}

export function isCliEntrypoint(metaUrl, argvPath) {
  if (!argvPath) {
    return false;
  }
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(argvPath);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  await runCli();
}
