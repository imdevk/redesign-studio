import path from 'node:path';

const flag = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};
const whole = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function loadConfig(env = process.env, cwd = process.cwd()) {
  return {
    port: whole(env.PORT, 3100),
    apiKey: (env.OPENAI_API_KEY || '').trim(),
    model: (env.OPENAI_MODEL || '').trim(),
    useScreenshot: flag(env.USE_SCREENSHOT, true),
    allowPrivate: flag(env.ALLOW_PRIVATE_URLS, false),
    maxOutputTokens: whole(env.MAX_OUTPUT_TOKENS, 16000),
    chromePath: (env.CHROME_PATH || '').trim(),
    dataDir: path.resolve(cwd, env.DATA_DIR || './data')
  };
}
