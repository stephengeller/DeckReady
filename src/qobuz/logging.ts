import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeRunLog(
  directory: string | undefined,
  filenameBase: string,
  cmd: string,
  stdout: string,
  stderr: string,
): Promise<string | null> {
  try {
    const repoRoot = process.cwd();
    const baseName = directory ? path.basename(directory) || 'downloads' : 'downloads';
    const logDir = path.join(repoRoot, 'logs', 'qobuz-dl', baseName);
    await fs.mkdir(logDir, { recursive: true });
    const file = path.join(logDir, `${filenameBase}.log`);
    const content = `CMD: ${cmd}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n`;
    await fs.writeFile(file, content, 'utf8');
    return file;
  } catch (e) {
    console.error('Failed to write qobuz-dl log:', e);
    return null;
  }
}

export async function writeSidecarText(paths: string[], text: string) {
  await Promise.all(
    paths.map(async (p) => {
      try {
        await fs.writeFile(`${p}.search.txt`, text, 'utf8');
      } catch (err) {
        console.error('Failed to write sidecar file:', err);
      }
    }),
  );
}
