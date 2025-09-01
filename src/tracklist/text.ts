export function indent(s: string | undefined | null, n = 2) {
  const pad = ' '.repeat(n);
  return (s || '')
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}
