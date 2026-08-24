export function generateRunId(now: Date = new Date()): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `local-${y}${m}${d}-${hh}${mm}${ss}`;
}
