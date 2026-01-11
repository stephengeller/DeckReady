export type ProgressInfo = { raw: string; percent?: number; bytes?: number; total?: number };

// Create a stdout/stderr handler that parses simple k/M progress strings and forwards updates.
export function makeProgressHandler(
  enabled: boolean,
  onProgress?: (info: ProgressInfo) => void,
): ((chunk: string) => void) | undefined {
  if (!enabled) return undefined;
  let bytes = 0;
  let total = 0;
  return (chunk: string) => {
    const m = chunk.match(/(\d+(?:\.\d+)?)([kM])\/(\d+(?:\.\d+)?)([kM])/);
    let percent: number | undefined;
    if (m) {
      const v = (n: string, u: string) => Number(n) * (u === 'M' ? 1_000_000 : 1_000);
      bytes = v(m[1], m[2]);
      total = v(m[3], m[4]);
      percent =
        total > 0 ? Math.max(0, Math.min(100, Math.round((bytes / total) * 100))) : undefined;
    }
    if (onProgress) onProgress({ raw: chunk, percent, bytes, total });
  };
}
