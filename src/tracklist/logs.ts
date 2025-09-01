import fs from 'node:fs';
import path from 'node:path';

export function persistLastRunLogs(dir: string | null | undefined) {
  try {
    const repoLogsBase = path.join(process.cwd(), 'logs', 'last-run');
    fs.mkdirSync(repoLogsBase, { recursive: true });
    if (dir) {
      fs.writeFileSync(path.join(repoLogsBase, 'last-run-dir.txt'), dir);
      const nmSrc = path.join(dir, 'not-matched.log');
      const nfSrc = path.join(dir, 'not-found.log');
      if (fs.existsSync(nmSrc)) fs.copyFileSync(nmSrc, path.join(repoLogsBase, 'not-matched.log'));
      if (fs.existsSync(nfSrc)) fs.copyFileSync(nfSrc, path.join(repoLogsBase, 'not-found.log'));
    }
  } catch {
    // best-effort only
  }
}
