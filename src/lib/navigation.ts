export function navigationPly(key: string, cursor: number, length: number): number | undefined {
  const next = { ArrowUp: 0, Home: 0, ArrowLeft: cursor - 1, ArrowRight: cursor + 1, ArrowDown: length, End: length }[key];
  return next === undefined ? undefined : Math.max(0, Math.min(length, next));
}
