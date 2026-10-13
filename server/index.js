import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { capturePage } from './capture.js';
import { generateDesign } from './generate.js';
import { renderPng } from './export.js';

const config = loadConfig();
await mkdir(config.dataDir, { recursive: true });
const store = createStore(config.dataDir);
await store.settleInterrupted();

const serve = process.argv.includes('--serve');
const app = createApp({
  config, store, capture: capturePage, generate: generateDesign, renderPng,
  staticDir: serve ? fileURLToPath(new URL('../dist/', import.meta.url)) : undefined
});

// 127.0.0.1 only: the tool is never reachable from other computers.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`\nRedesign Studio server is running on http://localhost:${config.port}`);
  console.log(serve ? `Open http://localhost:${config.port} in your browser.` : 'In development, open http://localhost:5173 in your browser.');
  if (!config.apiKey || !config.model) {
    console.log('\nSetup needed: add OPENAI_API_KEY and OPENAI_MODEL to .env (see .env.example), then restart.');
    console.log('You can still check pages without them; only designing needs the AI.');
  } else {
    console.log(`Using model ${config.model}${config.useScreenshot ? ' with page screenshots' : ' (text only)'}.`);
  }
  console.log(`Saved designs are kept in ${config.dataDir}\n`);
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set a different PORT in .env.` : `Server error: ${error.message}`);
  process.exit(1);
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
