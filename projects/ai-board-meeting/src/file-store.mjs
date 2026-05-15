import fs from "node:fs/promises";
import path from "node:path";

export function createMeetingFilename({ title, now = new Date() }) {
  const date = now.toISOString().slice(0, 10);
  const withoutPrefix = String(title || "")
    .replace(/^#?\s*AI役員会[:：]\s*/u, "")
    .replace(/[\\/:*?"<>|]/g, " ")
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

export async function saveMeetingLog({ meetingLogDir, markdown, now = new Date() }) {
  await fs.mkdir(meetingLogDir, { recursive: true });
  const title = extractTitle(markdown);
  const filename = createMeetingFilename({ title, now });
  const filePath = path.join(meetingLogDir, filename);
  await fs.writeFile(filePath, markdown, "utf8");
  return { filePath, filename };
}
