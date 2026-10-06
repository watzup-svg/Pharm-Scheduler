// Realistic dataset: 16 stores, 60 pharmacists, 2 years of daily assignments, N change_log rows.
export function seed(db, { stores = 16, pharmacists = 60, days = 730, logRows = 50000, start = '2025-01-01' } = {}) {
  let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const st = db.prepare('INSERT INTO stores VALUES (?,?)');
  for (let i = 1; i <= stores; i++) st.run([i, 'Store ' + i]); st.free();
  const ph = db.prepare('INSERT INTO pharmacists VALUES (?,?,?)');
  for (let i = 1; i <= pharmacists; i++) ph.run([i, 'Pharmacist ' + i, 1 + (i % stores)]); ph.free();
  const as = db.prepare('INSERT INTO assignments VALUES (?,?,?,?)');
  const t0 = Date.parse(start); let n = 0;
  for (let d = 0; d < days; d++) {
    const day = new Date(t0 + d * 864e5).toISOString().slice(0, 10);
    for (let p = 1; p <= pharmacists; p++) {
      const r = rnd(); if (r < 0.28) continue; // days off
      as.run([day, p, r < 0.8 ? 1 + (p % stores) : 1 + Math.floor(rnd() * stores), r < 0.9 ? 'day' : 'late']); n++;
    }
  }
  as.free();
  const lg = db.prepare('INSERT INTO change_log(ts,actor,op,entity,entity_id,detail) VALUES (?,?,?,?,?,?)');
  for (let i = 0; i < logRows; i++) lg.run([new Date(t0 + i * 20000).toISOString(), 'user', 'assign', 'assignment', String(1 + (i % pharmacists)), JSON.stringify({ day: i % days, from: null, to: 1 + (i % stores) })]);
  lg.free();
  return { assignments: n, logRows };
}
