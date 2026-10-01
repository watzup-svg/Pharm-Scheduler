You are a senior product designer and UX researcher with strong front-end engineering judgment. Review the attached app in depth. Do not start by editing code: this is an analysis task. Only change files if I ask afterward.

START: read `handoff/README.md` (what the app is, who uses it, how it works, file map, known gaps). Then open `dist-spa/spa.html` in a browser if you can run one (load the sample from the welcome screen or open `artifacts/HiSchool_Pharmacy_October_2026_DEMO.hisp.json`); otherwise study `handoff/screens/` and the source. Use `artifacts/COPY_GUIDE.md` for wording standards and treat `artifacts/STYLE_GUIDE.md` as partly outdated. `artifacts/history/` is old context only.

GOAL: tell me what is worth doing, in priority order, to make this the best possible tool for one non-technical district manager who schedules pharmacists on a phone and a laptop. Focus first on UTILITY and FUNCTIONALITY, then on look and feel.

Review from each of these perspectives, separately, with concrete evidence (screen, component, file, or a step-by-step flow), not generalities:
1. The district manager, first run: can she understand what to do within a minute? Where does she hesitate?
2. The district manager, monthly routine: build next month, find and fix holes, handle a sick call at 6 am on a phone, handle a time-off request, print the packet. Count taps/screens for each and name the slowest steps.
3. Information architecture: are the 5 tabs, the breadcrumb, the Setup switcher, the day panel and File menu the right organization? What is hidden that should show, or shown that should hide? Is anything duplicated or in two places?
4. Readability and comprehension: hierarchy, density, labels, wording, icon meaning (does the Icon guide need to exist, or are icons still unclear?), color/shape cues for hole, double, time off, cover.
5. Trust and error safety: can she make an expensive mistake? Undo, press-and-hold, print gating, "no coverage" wording, what happens with bad or missing data.
6. Visual design: style guide, palette, contrast, typography scale, spacing, borders, radius, shadows, button styles and sizes, consistency across pages, brand fit. Cite specific inconsistencies.
7. Motion and interaction polish: animations, transitions, press feedback, hold fill, glow on tap-to-place, loading and empty states, reduced-motion.
8. Responsive and touch: phone (390x844) vs laptop (1366x900), target sizes, thumb reach, sticky bars, inner scrolling, calendars at small sizes.
9. Accessibility: keyboard, focus, screen reader names, contrast, Larger text and High contrast modes.
10. Missing capabilities a real pharmacy scheduler would expect (but respect the product rules: pharmacists only, human decides, offline, no AI, no auto-fill).
11. Code health that affects the above: oversized components (`day-sheet.tsx`, `district-screen.tsx`, `print-screen.tsx`, `overview.tsx`), dead code, duplicated logic, risk areas.

Constraints to respect: it is a rules-driven app; `src/lib/schedule` is the source of truth and should be called, not rewritten. No auto-assigning, no solver, no technicians/cashiers, no network. Do not report items listed under "Known gaps" in the README as new discoveries, but do say if they matter.

Be a critical reviewer: say what is weak, not just what is good. Challenge assumptions in the design. Label each claim as OBSERVED (you saw it), INFERRED, or GUESS, and give confidence.

DELIVERABLE (in this order):
A. Verdict: 5 sentences max. Is it intuitive, does it flow, is it organized well?
B. Scorecard table: each perspective above, score 1-10, one-line reason.
C. Top findings table: ID, perspective, finding, evidence (screen/file), severity (blocker/high/medium/low), effort (S/M/L), risk to stability (low/med/high).
D. The prioritized to-do list: group as "Do first" (high value, low effort/risk), "Do next", "Consider", and "Skip (and why)". For each: the change in 2-3 sentences, expected benefit, how to verify it.
E. A short list of 5 questions I should answer with the district manager (or watch her do) to test your conclusions.
F. Quick wins I could ship in one afternoon.

Lead with the answer. Keep prose tight; use tables for comparisons.
