// Sync clients (Google Drive for desktop, OneDrive, Dropbox) keep both versions when two machines save at once, as a copy with a
// changed name. We cannot see inside the sync client, so this only looks at file names in the folder and warns. The wording the
// real Google Drive client uses was NOT verified in this spike; the pattern is deliberately broad.
export function findConflictCopies(names: readonly string[], fileName: string): string[] {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const copy = new RegExp(`^${esc(base)}(?: \\(\\d+\\)| - .*[Cc]onflict.*| \\(.*conflict.*\\)| \\[.*conflict.*\\]| - Copy| \\(copy\\)| copy)${esc(ext)}$`);
  return names.filter((n) => n !== fileName && copy.test(n)).sort();
}
