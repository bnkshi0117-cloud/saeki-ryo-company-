import test from "node:test";
import assert from "node:assert/strict";
import { shouldStopBgmAfterVoice } from "../public/bgm-policy.js";

test("BGM should stop whenever a voice line finishes", () => {
  assert.equal(shouldStopBgmAfterVoice(), true);
});
