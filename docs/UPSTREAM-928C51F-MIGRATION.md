# Upstream and experimental-main migration

## Source classification

Treat `origin/main` commit `928c51fcf75e2e18edd327e65ee28bca9640028b` as an experimental
input tree. Do not merge it into Candidate 19.

The post-upstream experimental commits contain three behavior groups:

1. Native Wayland/Hyprland capture and session changes (`a772820`, `5310956`). These touch protected
   runtime surfaces and require reconstruction against the Candidate 19 capture and session tests.
2. Cross-distribution installer work (`32ffb3c`, `a1f3b01`). Audit its detection logic, then port
   useful cases into the proven KDE installers. Hyprland installation belongs to the future
   Omarchy repository.
3. Documentation and package helpers (`0adaff8`, `ed1c756`, `928c51f`). Reconcile useful content
   with the canonical continuity file; do not replace the established Linux contracts.

Upstream widget commit `56c74df` remains permanently excluded because it adds per-widget hotkey
editing. Later merges that contain that commit do not override the exclusion.

## Port order

1. Preserve and test the Linux contracts.
2. Port widget-only changes that do not alter capture, input, focus, configuration roots, or IPC.
3. Port installer detection for supported KDE distributions.
4. Introduce the multi-window preview behind its default-off gate.
5. Reconstruct any desired native Wayland behavior only after the XWayland migration passes.

Never advance the capture backend and the window architecture in the same field candidate. A test
failure must identify one changed behavior group.
