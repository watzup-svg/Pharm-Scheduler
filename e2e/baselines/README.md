Baseline pictures for `node e2e/v3-visual.mjs` (practice month, 1366x800, fixed clock 6 Oct 2026, reduced motion, Chromium on Linux).

To change them on purpose: run `UPDATE_BASELINES=1 node e2e/v3-visual.mjs` (add `ONLY=wall` to redo just the shots whose name contains "wall"), look at each changed PNG, and commit the files. A failing run leaves the new picture, the old one and a red-on-grey diff in `test-logs/visual/`.
