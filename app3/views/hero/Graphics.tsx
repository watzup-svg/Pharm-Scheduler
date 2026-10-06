// Small header graphics from the old app: licence rings and the paper stack.
export function LicenceRings({ total, or, wa }: { total: number; or: number; wa: number }) {
  const ring = (code: string, n: number) => {
    const r = 30, c = 2 * Math.PI * r, f = total ? n / total : 0;
    return (
      <svg key={code} viewBox="0 0 80 80" width={72} height={72} role="img" aria-label={`${n} of ${total} licensed in ${code}`}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="#6fb78d" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 40 40)" />
        <text x="40" y="39" textAnchor="middle" fontSize="15" fontWeight="700" fill="#f7f4ef">{code}</text>
        <text x="40" y="53" textAnchor="middle" fontSize="10" fill="#b9b1a3">{n}</text>
      </svg>
    );
  };
  return <div className="flex gap-2">{ring("OR", or)}{ring("WA", wa)}</div>;
}

export function PaperStack({ pages }: { pages: number }) {
  return (
    <div className="relative h-[84px] w-[70px]" role="img" aria-label={`${pages} pages`}>
      {[3, 2, 1].map((i) => <span key={i} aria-hidden className="absolute rounded-md bg-white/80 ring-1 ring-black/10" style={{ inset: 0, transform: `translate(${i * 3}px, ${i * 3}px)` }} />)}
      <span className="absolute inset-0 grid place-items-center rounded-md bg-white text-ink ring-1 ring-black/10"><span className="text-center leading-none"><b className="block text-2xl">{pages}</b><span className="text-[13px] tracking-wide">PAGES</span></span></span>
    </div>
  );
}
