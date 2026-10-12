export const LEVEL_OPTIONS = [
  "Band 2.0",
  "Band 2.5",
  "Band 3.0",
  "Band 3.5",
  "Band 4.0",
  "Band 4.5",
  "Band 5.0",
  "Band 5.5",
  "Band 6.0",
  "Band 6.5",
  "Band 7.0",
  "Band 7.5",
  "Band 8.0",
  "Band 8.5",
  "Band 9.0",
  "Foundation",
  "Giao tiếp",
];

/**
 * Extract the numeric band from a level string such as "Band 5.5".
 * Returns undefined for non-band values like "Foundation" or "Giao tiếp".
 */
export function levelToBand(value: string): number | undefined {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}
