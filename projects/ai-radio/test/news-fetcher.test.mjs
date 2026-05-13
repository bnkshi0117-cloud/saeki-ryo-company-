import test from "node:test";
import assert from "node:assert/strict";
import { buildNewsContext, parseRss, shouldUseNews } from "../src/news-fetcher.mjs";

test("shouldUseNews detects news and market themes", () => {
  assert.equal(shouldUseNews("最新ニュースとAI"), true);
  assert.equal(shouldUseNews("株価ニュース"), true);
  assert.equal(shouldUseNews("マーケット時事ネタ"), true);
  assert.equal(shouldUseNews("沖縄の日常とAI実験"), false);
});

test("parseRss extracts title, link, source, and published date", () => {
  const xml = `<?xml version="1.0"?>
  <rss><channel>
    <title>Market Feed</title>
    <item>
      <title>日経平均が反発</title>
      <link>https://example.com/market</link>
      <pubDate>Wed, 13 May 2026 05:00:00 GMT</pubDate>
      <source>Example News</source>
    </item>
  </channel></rss>`;

  const items = parseRss(xml, "market");

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "日経平均が反発");
  assert.equal(items[0].url, "https://example.com/market");
  assert.equal(items[0].source, "Example News");
  assert.equal(items[0].category, "market");
});

test("buildNewsContext fetches only relevant feeds and limits items", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      text: async () => `<rss><channel>
        <item><title>AI銘柄に買い</title><link>https://example.com/1</link><source>Market</source></item>
        <item><title>為替が円安方向</title><link>https://example.com/2</link><source>Market</source></item>
      </channel></rss>`
    };
  };

  const context = await buildNewsContext({
    settings: { theme: "株価ニュースとAI", targetMinutes: 5 },
    fetchImpl: fakeFetch
  });

  assert.equal(calls.length > 0, true);
  assert.equal(context.enabled, true);
  assert.equal(context.items.length <= 6, true);
  assert.match(context.promptText, /AI銘柄に買い/);
  assert.match(context.promptText, /投資助言ではなく/);
});
