export const ORG_ID = "org_summit";

export function ts(daysAgo: number, hour = 10, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}
