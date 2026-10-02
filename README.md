# Pharm-Scheduler

A single-user, offline, pharmacist-only month scheduler for the district manager of Hi-School Pharmacy (16 independent stores in Oregon and Washington). A person decides who covers every shift; the app shows holes, doubles, licence problems and what each choice would break, then prints a PDF packet the stores post. It ships as one self-contained HTML file.

All people and schedules in this repository are fictional sample data. Store names, addresses and phone numbers are the stores' public business details.

- **Reviewing this code?** Start with [REVIEW_GUIDE.md](REVIEW_GUIDE.md).
- **Where things live:** [ARCHITECTURE.md](ARCHITECTURE.md).
- **What changed, newest first:** [docs/WHATS_NEW.md](docs/WHATS_NEW.md).
- **Latest handoff notes:** [handoff/HANDOFF_CONTINUE_2026-10-02.md](handoff/HANDOFF_CONTINUE_2026-10-02.md).

## Run it
```
npm install
npm run dev          # http://localhost:3000
npm run check        # type check + unit tests (about 15 s)
npm run build:trial  # dist-spa/spa.html, opens on the sample month
```
`spa.html` in the repo root is an old v86 snapshot kept as the original baseline, not the current build. Build the current one with `npm run build:trial`.

Stack: React 19, TanStack Router (hash), Tailwind v4, Zustand, zod, jsPDF. No server, no network calls.
