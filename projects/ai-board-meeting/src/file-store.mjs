import fs from "node:fs/promises";
import path from "node:path";

export function formatDateForFilename(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function createMeetingFilename({ title, now = new Date() }) {
  const date = formatDateForFilename(now);
  const withoutPrefix = String(title || "")
    .replace(/^#?\s*AI役員会[:：]\s*/u, "")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const slug = withoutPrefix || "ai-board-meeting";
  return `${date}-${slug}.md`;
}

export function extractTitle(markdown) {
  const heading = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  if (!heading) {
    return "AI役員会";
  }
  return heading.replace(/^#\s+/, "").trim();
}

function addFilenameSuffix(filename, suffix) {
  const extension = path.extname(filename);
  const basename = filename.slice(0, -extension.length);
  return `${basename}-${suffix}${extension}`;
}

export async function saveMeetingLog({ meetingLogDir, markdown, now = new Date() }) {
  await fs.mkdir(meetingLogDir, { recursive: true });
  const title = extractTitle(markdown);
  const filename = createMeetingFilename({ title, now });

  for (let attempt = 1; ; attempt += 1) {
    const candidate = attempt === 1 ? filename : addFilenameSuffix(filename, attempt);
    const filePath = path.join(meetingLogDir, candidate);

    try {
      await fs.writeFile(filePath, markdown, { encoding: "utf8", flag: "wx" });
      return { filePath, filename: candidate };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }
  }
}
