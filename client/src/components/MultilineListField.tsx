import { listToText, sanitizeList, textToList } from "../utils/listText";

/**
 * Textarea for editing a list of short entries, one per line.
 *
 * While the user types, the text is kept exactly as typed: every line is
 * preserved, including blank ones and trailing spaces. Entries are only
 * trimmed and emptied out on blur (and again on save), so pressing Enter or
 * typing a space mid-word can never be swallowed by a re-render.
 */
export function MultilineListField({
  label,
  values,
  onChange,
  rows = 4,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <textarea
        value={listToText(values)}
        onChange={(event) => onChange(textToList(event.target.value))}
        onBlur={() => onChange(sanitizeList(values))}
        rows={rows}
        className="resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      <span className="text-xs font-normal text-slate-500">{hint ?? "One entry per line."}</span>
    </label>
  );
}
