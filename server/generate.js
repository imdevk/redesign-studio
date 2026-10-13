import { UserError } from './errors.js';
import { buildMessages } from './prompt.js';
import { sanitizeDocument } from './sanitize.js';

function openAiMessage(status, body, sentImage) {
  const code = body?.error?.code || body?.error?.type || '';
  const detail = String(body?.error?.message || '');
  if (status === 401) return 'OpenAI rejected the API key. Check OPENAI_API_KEY in .env.';
  if (status === 429 && /quota|billing|credit/i.test(`${code} ${detail}`)) return 'OpenAI reports no remaining credits or quota on this API key.';
  if (status === 429) return 'OpenAI is rate limiting requests. Wait a minute and try again.';
  if ((status === 400 || status === 404) && sentImage && /image|vision|multimodal/i.test(detail)) {
    return 'This model did not accept the screenshot. Set USE_SCREENSHOT=false in .env, or choose a model that accepts images.';
  }
  if (status === 400 || status === 404) return `OpenAI could not run this request: ${detail.slice(0, 200) || 'bad request'}`;
  return 'OpenAI is having problems right now. Please try again shortly.';
}

/** Calls the OpenAI Chat Completions API. Returns the raw text plus token usage. */
export async function callOpenAI({ apiKey, model, messages, maxOutputTokens, sentImage = false, timeoutMs = 240_000, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_completion_tokens: maxOutputTokens }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new UserError('The AI took too long to respond. Please try again.', 504);
    throw new UserError('Could not reach OpenAI. Check your internet connection.', 502);
  }
  let body = null;
  try { body = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new UserError(openAiMessage(response.status, body, sentImage), 502);
  const choice = body?.choices?.[0];
  if (!choice?.message?.content) throw new UserError('The AI returned an empty response. Please try again.', 502);
  if (choice.finish_reason === 'length') throw new UserError('The design was cut off because it ran too long. Raise MAX_OUTPUT_TOKENS in .env or pick a simpler style.', 502);
  return {
    content: choice.message.content,
    model: body.model || model,
    usage: { input: body.usage?.prompt_tokens ?? null, output: body.usage?.completion_tokens ?? null }
  };
}

/** Builds the prompt from the captured page and the answers, calls the AI, and returns a safe HTML document. */
export async function generateDesign({ config, site, answers, screenshot, screenshots = [], call = callOpenAI }) {
  const shots = (screenshots.length ? screenshots : screenshot ? [screenshot] : []).filter(Boolean);
  const useImage = Boolean(config.useScreenshot && shots.length);
  if (site.source === 'screenshot' && !useImage) {
    throw new UserError('Designing from screenshots needs USE_SCREENSHOT=true in .env and a model that accepts images.', 409);
  }
  const messages = buildMessages({ site, answers, screenshots: useImage ? shots : [] });
  const result = await call({ apiKey: config.apiKey, model: config.model, messages, maxOutputTokens: config.maxOutputTokens, sentImage: useImage });
  const brand = answers.colorMode === 'custom' ? answers.customColor : answers.colorMode === 'keep' && site.colors?.accents?.[0] ? site.colors.accents[0] : '#4f46e5';
  return { html: sanitizeDocument(result.content, { brand }), model: result.model, usage: result.usage };
}
