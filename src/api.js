export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) })
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the local server. Start it with "npm run dev" and keep that terminal open.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The local server sent an unexpected reply.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.status = response.status;
    throw error;
  }
  return data;
}
