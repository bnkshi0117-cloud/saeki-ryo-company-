import test from "node:test";
import assert from "node:assert/strict";
import { spokenTextForTts } from "../src/tts-xai.mjs";

test("spokenTextForTts prevents xAI from misreading 相方", () => {
  assert.equal(spokenTextForTts("相方の比嘉です。"), "あいかたの比嘉です。");
  assert.equal(spokenTextForTts("今日の相方、テンション高いですね。"), "今日のあいかた、テンション高いですね。");
});
