export function hasChanged(prev: string[], curr: string[]): boolean {
  if (prev.length !== curr.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== curr[i]) return true;
  }
  return false;
}
