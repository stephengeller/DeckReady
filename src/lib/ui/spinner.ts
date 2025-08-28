import { dim } from './colors';

export type Spinner = {
  start: (text?: string) => void;
  stop: () => void;
};

export function createSpinner(enabled: boolean, intervalMs = 80): Spinner {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIdx = 0;
  let timer: NodeJS.Timeout | null = null;
  let lastText = 'downloading';

  const start = (text?: string) => {
    if (!enabled || timer) return;
    if (text) lastText = text;
    timer = setInterval(() => {
      const txt = dim(`  ${frames[frameIdx]} ${lastText}`);
      frameIdx = (frameIdx + 1) % frames.length;
      process.stdout.write(`\r${txt}`);
    }, intervalMs);
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (enabled) process.stdout.write('\r\x1b[2K');
  };

  return { start, stop };
}
