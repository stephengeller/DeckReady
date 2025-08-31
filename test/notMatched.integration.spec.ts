import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseLog, writeOutputs } from '../src/lib/notMatched';

describe('notMatched integration', () => {
  test('writes multiple outputs with all items', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'not-matched-'));
    const logPath = path.join(tmp, 'not-matched.log');
    const lines = [
      'query="Virus Syndicate \"When I\'m On\"" expected="Virus Syndicate - When I\'m On" found="Rikas - It’s a Beautiful World (When I’m on My Own)"',
      'query="Skrillex \"Goin\' Hard\" Mix \"Goin\' In\"" expected="Skrillex \"Goin\' Hard\" Mix - Goin\' In" found="Birdy Nam Nam - Goin\' In (Skrillex \"Goin\' Hard\" Remix)"',
      'query="Flux Pavilion \"I Can\'t Stop\"" expected="Flux Pavilion - I Can\'t Stop" found="Flux Pavilion - I Can\'t Stop (Ekali Tribute)"',
    ];
    await fs.writeFile(logPath, lines.join('\n') + '\n', 'utf8');

    const raw = await fs.readFile(logPath, 'utf8');
    const items = parseLog(raw);
    expect(items.length).toBe(3);

    const outPrefix = path.join(tmp, 'out');
    await writeOutputs(items, outPrefix, 'all');

    const urls = await fs.readFile(outPrefix + '.urls.txt', 'utf8');
    expect(urls.trim().split(/\r?\n/).length).toBe(3);
    const txt = await fs.readFile(outPrefix + '.txt', 'utf8');
    expect(txt).toMatch(/Virus Syndicate - When I\'m On/);
    expect(txt).toMatch(/Skrillex/);
    expect(txt).toMatch(/Flux Pavilion/);
  });
});
