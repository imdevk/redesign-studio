# Redesign Studio

[![Tests](https://github.com/imdevk/redesign-studio/actions/workflows/test.yml/badge.svg)](https://github.com/imdevk/redesign-studio/actions/workflows/test.yml)
![Node 22+](https://img.shields.io/badge/node-22%2B-3c873a) ![License MIT](https://img.shields.io/badge/license-MIT-blue)

Enter a web page address (or upload screenshots), answer a few questions, and get a responsive redesign concept as one HTML file. Runs only on your computer; you bring your own OpenAI key.

**Stack:** React 19, Tailwind 4, Vite, Express 5, Playwright, sharp, cheerio, OpenAI API. Tests use Node's built-in runner.

**Docs:** [How it works](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [License](LICENSE)

> A redesign is a concept. It reuses the original business's name and wording, so share it with them directly and do not publish it as client work. Only use the tool on pages you have the right to work with.

A tool that runs on your own computer. You give it a web page address, it reads that page, asks you a few questions, and creates a responsive redesign as a single HTML file. Picture spots become placeholders in the site's own colours.

Nothing is hosted. The server listens on `127.0.0.1` only, and your OpenAI key stays in a local `.env` file.

## What it does

1. **Check the page.** Opens the address in a real browser and reads the headings, text, navigation, colours, fonts, contact details and where the pictures are. No AI is used and nothing is charged.
2. **Ask questions.** Business type, what visitors should do, look and feel, colours (keep the site's, fresh, or your own), sections, and free notes.
3. **Create the design.** Sends the page content and a screenshot to OpenAI and gets back one HTML page.
4. **Preview.** Redesign, Original, or Side by side, at Desktop, Tablet or Phone width.
5. **Export.** Download the HTML (one self-contained file that opens anywhere), save a full-page PNG for desktop or phone, or open it in a new tab.

Responsiveness is required in the instructions the AI receives and you can check it with the Phone and Tablet switch. Pictures are never copied from the original site. Each spot becomes a placeholder tinted from the theme colour.

## When a page will not open: screenshots

Some pages block automated visits or sit behind a login. Use the **Screenshot** tab instead of the address:

- Take a full-page screenshot in your own browser, then drop it in, click to choose it, or paste it from the clipboard. Up to 4 PNG, JPG or WebP pictures, 6 MB each, in page order from the top.
- Long pictures are cut into readable pieces automatically. Nothing is read from a web page, so the AI reads the wording, layout, colours and picture spots from the images.
- This needs `USE_SCREENSHOT=true` and a model that accepts images. It does not need the browser downloaded by `npm run setup`.
- You can give the business a name; it is only used as a label.
- Screenshots are saved on this computer and sent to OpenAI when you create the design. Do not upload anything private you would not want sent there.

## Colours and fonts without the AI

Under every finished design there is a **Colours and fonts** panel. It shows which colours and fonts the design uses and where (accent, background, cards, text, soft text; headings and body text). You can:

- Pick a ready-made palette (including two dark ones) or change any single colour.
- Pick another font for headings and for body text from 13 options, each shown in its own typeface.
- Go **Back to original** at any time.

This only changes CSS variables, so it is instant, uses no AI and costs nothing. The chosen fonts are embedded in the exported HTML, so they look the same on any computer. Your original design is never overwritten; "Create again" starts fresh.

It works because the AI is told to write every colour and font as a variable. If a model ignores that, the panel says how many colours are fixed in the page and will not change; use Create again.

## Setup

You need Node.js 22 or newer and an OpenAI API key with credit.

```
npm install
npm run setup        # downloads the browser used to read pages
cp .env.example .env # then edit .env
```

In `.env` set `OPENAI_API_KEY` and `OPENAI_MODEL`. The model name is yours to choose; use one that accepts images if you keep `USE_SCREENSHOT=true`, otherwise set it to `false`.

Run it:

```
npm run dev     # open http://localhost:5173
npm start       # builds, then open http://localhost:3100
```

Checking pages works without a key; only "Create design" needs the AI.

If `npm run setup` cannot download a browser, set `CHROME_PATH` in `.env` to an installed Chrome or Chromium.

## Settings (`.env`)

| Name                 | Default  | Meaning                                                             |
| -------------------- | -------- | ------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | none     | Your key. Never leave this machine.                                 |
| `OPENAI_MODEL`       | none     | Model used for designs.                                             |
| `USE_SCREENSHOT`     | `true`   | Send a screenshot as well as the text. Better results, more tokens. |
| `MAX_OUTPUT_TOKENS`  | `16000`  | Upper limit on the length of a design.                              |
| `PORT`               | `3100`   | Server port.                                                        |
| `ALLOW_PRIVATE_URLS` | `false`  | Allow addresses like `localhost` or `192.168.x.x`.                  |
| `CHROME_PATH`        | auto     | Use your own Chrome or Chromium.                                    |
| `DATA_DIR`           | `./data` | Where designs are saved.                                            |

## Cost

One design is one OpenAI request: the page text, plus a screenshot, plus a design of roughly 5,000 to 12,000 tokens back. The token counts of each design are shown above the preview so you can work out the cost with your model's price. "Create again" is a new request.

## Safety

- Only the address you type is opened. Private and local addresses are refused unless you allow them.
- The AI's output is cleaned before it is shown: scripts, frames, forms that submit, external links and remote files are removed. The preview runs in a sandboxed frame and exports are rendered with scripts and network off.
- Requests from other websites to the local server are rejected.

## Limits

- Pages that build themselves with JavaScript after a login, or that block automated browsers, may come back with little content. The tool warns you when that happens.
- Only one page is read, not the whole site.
- A redesign is a concept. It reuses the other business's name and wording, so share it with them directly and do not publish it as your own client work.
- Facts such as prices and opening hours are only used when they were found on the page.

## Tests

```
npm test
```

The browser tests are skipped if no Chromium can start. Set `CHROME_PATH` to run them.

## Contributing

Issues and pull requests are welcome. Run `npm test` before opening one; the tests need no API key. Please do not commit `.env` or anything from `data/`.

## License

MIT. See [LICENSE](LICENSE).
