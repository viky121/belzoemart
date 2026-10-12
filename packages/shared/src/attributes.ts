/** Trimmed value of the first attribute whose key (case-insensitive) is one of `keys`, else ''. */
export function pickAttr(
  attrs: Record<string, string> | null | undefined,
  ...keys: string[]
): string {
  const found = Object.entries(attrs ?? {}).find(([k]) => keys.includes(k.toLowerCase()));
  return found?.[1]?.trim() ?? '';
}
