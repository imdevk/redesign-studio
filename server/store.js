import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// Every design lives in its own folder: data/runs/<id>/ with run.json, site.json, screenshots and design.html.
// Plain files keep the tool easy to inspect, back up and delete.

export const ID_PATTERN = /^[a-f0-9]{12}$/;
const FILES = new Set(['original-desktop.jpg', 'original-phone.jpg', 'ai-view.jpg', 'design.html', 'export-desktop.png', 'export-phone.png', ...Array.from({ length: 6 }, (_, i) => `upload-${i + 1}.jpg`)]);

export function createStore(dataDir) {
  const root = path.join(dataDir, 'runs');
  const dir = id => {
    if (!ID_PATTERN.test(String(id))) throw Object.assign(new Error('Invalid design ID.'), { status: 400, expose: true });
    return path.join(root, id);
  };
  async function writeJson(file, value) {
    const temp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2));
    await rename(temp, file);
  }
  async function readJson(file) {
    try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  return {
    async create(fields) {
      const id = randomBytes(6).toString('hex');
      const now = new Date().toISOString();
      const run = { id, status: 'capturing', stage: '', error: '', warnings: [], answers: null, usage: null, model: null, createdAt: now, updatedAt: now, ...fields };
      await mkdir(dir(id), { recursive: true });
      await writeJson(path.join(dir(id), 'run.json'), run);
      return run;
    },
    async get(id) { return readJson(path.join(dir(id), 'run.json')); },
    async update(id, patch) {
      const run = await readJson(path.join(dir(id), 'run.json'));
      if (!run) return null;
      const next = { ...run, ...patch, updatedAt: new Date().toISOString() };
      await writeJson(path.join(dir(id), 'run.json'), next);
      return next;
    },
    async list() {
      let names = [];
      try { names = await readdir(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const runs = [];
      for (const name of names.filter(n => ID_PATTERN.test(n))) {
        const run = await readJson(path.join(root, name, 'run.json')).catch(() => null);
        if (run) runs.push(run);
      }
      return runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async saveSite(id, site) { await writeJson(path.join(dir(id), 'site.json'), site); },
    async getSite(id) { return readJson(path.join(dir(id), 'site.json')); },
    async saveFile(id, name, data) {
      if (!FILES.has(name)) throw new Error('Unknown file name.');
      await writeFile(path.join(dir(id), name), data);
    },
    async readFile(id, name) {
      if (!FILES.has(name)) return null;
      try { return await readFile(path.join(dir(id), name)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async removeFile(id, name) { if (FILES.has(name)) await rm(path.join(dir(id), name), { force: true }); },
    async remove(id) { await rm(dir(id), { recursive: true, force: true }); },
    // After a crash or restart a run can be left "capturing" or "generating" forever; settle those.
    async settleInterrupted() {
      for (const run of await this.list()) {
        if (run.status === 'capturing' || run.status === 'generating') {
          await this.update(run.id, { status: 'failed', stage: '', error: 'This run was interrupted. Please try again.' });
        }
      }
    }
  };
}
