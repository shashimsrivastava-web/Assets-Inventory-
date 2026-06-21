export const DEVICE_TYPE_ORDER = [
  "PDA@OPS",
  "IPAD",
  "IPAD Mini (ALS)",
  "Ingenico POS",
  "Mobile Phone",
  "Hold Camera Phone",
  "BRS Scanner"
];

export function sortDeviceTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const indexA = DEVICE_TYPE_ORDER.indexOf(a);
    const indexB = DEVICE_TYPE_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}
