# Architecture

```
React UI (Vite, :5173 in dev)  --/api-->  Express server (127.0.0.1:3100)
                                            |-- Playwright / Chromium  (read page, screenshots, PNG export)
                                            |-- sharp                  (resize and slice uploaded screenshots)
                                            |-- data/<run id>/         (run.json, screenshots, design.html)
                                            '-- OpenAI chat completions (the only paid step)
```

## Flow
1. **Check** (`POST /api/runs`): a background job opens the page, scrolls it, collects headings, text, nav, colours, fonts and picture spots, and saves three screenshots. No AI.
2. **Questions**: the UI shows what was found and asks for business type, goal, style, colours, extra sections and notes.
3. **Create** (`POST /api/runs/:id/generate`): `prompt.js` builds the messages, `generate.js` calls OpenAI and validates the answer, `sanitize.js` cleans the HTML.
4. **Preview and tweak**: the design is served with a sandbox CSP. Colour and font changes are CSS variables injected at serve time (`theme.js`); the AI is not called again.
5. **Export**: download HTML, or render PNGs with scripts and network off.
Screenshot-only runs (`POST /api/runs/upload`) skip step 1 and send the pictures to the model instead.

## Server files
| File | Job |
|---|---|
| `app.js` | Routes, middleware, background jobs, one job at a time |
| `capture.js` | Playwright page reader |
| `urlSafety.js` | SSRF checks |
| `prompt.js`, `generate.js` | Prompt building and the OpenAI call |
| `sanitize.js` | Cleans AI HTML |
| `theme.js` | Palettes, fonts, CSS-variable overrides |
| `uploads.js` | Screenshot uploads |
| `store.js` | Run folders on disk |
| `export.js` | PNG export |

`createApp()` takes its dependencies (capture, generate, renderPng, store) as arguments, which is how the tests run without a browser or the network.
