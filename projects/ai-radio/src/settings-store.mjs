const allowedTargetMinutes = new Set([3, 5, 10, 15]);

export const defaultSettings = {
  theme: "沖縄の日常とAI実験",
  targetMinutes: 5
};

export function normalizeSettings(input = {}) {
  const theme = typeof input.theme === "string" && input.theme.trim()
    ? input.theme.trim().slice(0, 80)
    : defaultSettings.theme;

  const numericMinutes = Number(input.targetMinutes);
  const targetMinutes = allowedTargetMinutes.has(numericMinutes)
    ? numericMinutes
    : defaultSettings.targetMinutes;

  return {
    theme,
    targetMinutes
  };
}
