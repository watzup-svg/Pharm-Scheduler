# Browser checks

Quick end-to-end checks that drive the built app in Chromium: every page for script errors, sideways scroll and
accessibility (axe), plus the Time off and Print flows.

1. `npx vite build -c vite.spa.config.ts`, then serve `dist-spa/` (for example `python3 -m http.server 3002 -d dist-spa`).
2. `npm run e2e` (set `BASE` and `CHROME` if the app or Chromium live elsewhere).

The logic behind the schedule has its own fast tests: `npm run test:schedule`.

The copy for real use has its own short check: `npm run build:real`, serve `dist-real/` on port 3003
(`python3 -m http.server 3003 -d dist-real`), then `npm run e2e:real` (set `REAL_BASE` if it lives elsewhere).
