import { buildMeetingPrompt, REQUIRED_SECTIONS } from "./prompt-template.mjs";

export function extractMarkdownFromAnthropicResponse(responseJson) {
  const textParts = responseJson?.content
    ?.filter((part) => part.type === "text" && typeof part.text === "string")
    ?.map((part) => part.text.trim()) || [];

  const markdown = textParts.join("\n\n").trim();
  if (!markdown) {
    throw new Error("Anthropic response did not include text content.");
  }
  return markdown;
}

export function validateMeetingMarkdown(markdown) {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error("Meeting markdown is empty.");
  }
  if (!markdown.startsWith("# AI役員会:")) {
    throw new Error("Meeting markdown must start with '# AI役員会:'.");
  }
  const lines = markdown.split(/\r?\n/);
  if (lines.some((line) => line.trimStart().startsWith("```"))) {
    throw new Error("Meeting markdown must not contain code fences.");
  }
  const headingLines = new Set(lines.map((line) => line.trimEnd()));
  for (const section of REQUIRED_SECTIONS) {
    if (!headingLines.has(`## ${section}`)) {
      throw new Error(`Missing required meeting section: ${section}`);
    }
  }
  return markdown;
}

export async function generateMeetingLog({ config, input, fetchImpl = fetch, now = new Date() }) {
  const prompt = buildMeetingPrompt({ ...input, now });
  const response = await fetchImpl(config.anthropicEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 5000,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${response.status}`);
  }

  const responseJson = await response.json();
  return validateMeetingMarkdown(extractMarkdownFromAnthropicResponse(responseJson));
}
