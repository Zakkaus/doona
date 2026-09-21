// One naming for every export: `<prefix>-<UTC time to the second>.<ext>`, sortable and free of characters
// file systems reject.
export function exportName(prefix: string, ext: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
}
// Hands the browser a file to save; the URL is released once the click has been dispatched.
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvLine(values: Array<string | number | null | undefined>): string {
  return values.map(value => (value == null ? '' : /[",\n]/.test(String(value)) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value))).join(',');
}
