/**
 * Helpers for editing a list of short entries as one-per-line text.
 *
 * `listToText` and `textToList` are lossless inverses: text typed into a
 * textarea survives a round trip through the list state unchanged, including
 * blank lines and trailing spaces. `sanitizeList` is the destructive step and
 * is applied only when the user leaves the field or saves.
 */

export function listToText(values: string[]): string {
  return values.join("\n");
}

export function textToList(value: string): string[] {
  return value.split("\n");
}

export function sanitizeList(values: string[]): string[] {
  return values.map((item) => item.trim()).filter(Boolean);
}
