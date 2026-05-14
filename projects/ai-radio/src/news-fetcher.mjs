const triggerWords = ["最新ニュース", "ニュース", "時事", "株価", "マーケット", "相場", "AIニュース"];

const feeds = [
  {
    category: "market",
    label: "マーケット",
    query: "株価 OR 日経平均 OR 米国株 OR 為替 OR ビットコイン"
  },
  {
    category: "ai",
    label: "AIニュース",
    query: "AI OR OpenAI OR Anthropic OR Google AI OR xAI"
  },
  {
    category: "current",
    label: "時事",
    query: "国内ニュース OR 時事 OR 沖縄 ニュース"
  }
];

export function shouldUseNews(theme = "") {
  return triggerWords.some((word) => String(theme).includes(word));
}

export function parseRss(xml, category) {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  return items.map((match) => {
    const itemXml = match[1];
    const title = readTag(itemXml, "title");
    const url = readTag(itemXml, "link");
    const source = readTag(itemXml, "source") || readTag(xml, "title") || "RSS";
    const publishedAt = readTag(itemXml, "pubDate");
    return {
      category,
      title,
      url,
      source,
      publishedAt
    };
  }).filter((item) => item.title && item.url);
}

export async function buildNewsContext({ settings, fetchImpl = fetch } = {}) {
  if (!shouldUseNews(settings?.theme)) {
    return {
      enabled: false,
      items: [],
      promptText: ""
    };
  }

  const selectedFeeds = selectFeeds(settings.theme);
  const results = await Promise.allSettled(selectedFeeds.map(async (feed) => {
    const response = await fetchImpl(feedUrl(feed.query));
    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status}`);
    }
    const xml = await response.text();
    return parseRss(xml, feed.category).slice(0, 3);
  }));

  const items = results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter(uniqueByUrl())
    .slice(0, 6);

  return {
    enabled: true,
    items,
    promptText: buildPromptText(items)
  };
}

function selectFeeds(theme = "") {
  const text = String(theme);
  if (/(株価|マーケット|相場|日経|米国株|為替|ビットコイン)/.test(text)) {
    return feeds.filter((feed) => ["market", "ai"].includes(feed.category));
  }
  if (/(AIニュース|OpenAI|Anthropic|xAI|Google AI)/i.test(text)) {
    return feeds.filter((feed) => ["ai", "current"].includes(feed.category));
  }
  return feeds;
}

function feedUrl(query) {
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=ja&gl=JP&ceid=JP:ja`;
}

function buildPromptText(items) {
  if (items.length === 0) {
    return "ニュース素材は取得できませんでした。ニュースを断定せず、通常の雑談として扱ってください。";
  }

  const lines = items.map((item) => `- [${item.category}] ${item.title} (${item.source}) ${item.url}`);
  return `${lines.join("\n")}

扱い方:
- この中から1〜2件だけ選んで、佐伯亮と比嘉の雑談に自然に混ぜる
- 株価や相場は投資助言ではなく、ニュース雑談として扱う
- URLや媒体名を参考にし、未確認の数字や断定を足さない
- 深刻な事件は茶化さず、軽く触れるだけにする`;
}

function readTag(xml, tagName) {
  const match = String(xml).match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXml(stripCdata(match[1])).trim() : "";
}

function stripCdata(value) {
  return String(value).replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function uniqueByUrl() {
  const seen = new Set();
  return (item) => {
    if (seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  };
}
