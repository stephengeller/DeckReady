export type Colorize = (s: string) => string;

let enabled = typeof process !== 'undefined' && !!process.stdout && !!process.stdout.isTTY;

export function setColorEnabled(v: boolean) {
  enabled = v;
}

function wrap(code: number): Colorize {
  return (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
}

export const green = wrap(32);
export const yellow = wrap(33);
export const red = wrap(31);
export const magenta = wrap(35);
export const cyan = wrap(36);
export const dim = wrap(2);
export const bold = wrap(1);

export function isTTY() {
  return typeof process !== 'undefined' && !!process.stdout && !!process.stdout.isTTY;
}
