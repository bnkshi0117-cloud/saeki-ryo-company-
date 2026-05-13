import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings } from "../src/settings-store.mjs";

test("normalizeSettings keeps theme and allowed target minutes", () => {
  const settings = normalizeSettings({
    theme: "台風の日のAI自動化",
    targetMinutes: 10
  });

  assert.equal(settings.theme, "台風の日のAI自動化");
  assert.equal(settings.targetMinutes, 10);
});

test("normalizeSettings falls back for blank theme and unsupported minutes", () => {
  const settings = normalizeSettings({
    theme: "   ",
    targetMinutes: 99
  });

  assert.equal(settings.theme, "沖縄の日常とAI実験");
  assert.equal(settings.targetMinutes, 5);
});
