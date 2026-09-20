# ArchVerse Alpha23 Candidate 15

Version: 0.1.47-r31.alpha23.candidate15. Internal field candidate, not a release.

Candidate 15 starts from packaged-verified Candidate 14. It keeps the field-working normal KDE
portal capture, direct Gamescope PipeWire capture, Mining and Hauling behavior, Linux input, and
widget contracts. It changes only the refinery/background OCR behavior and RapidOCR recovery.

The refinery reader now accepts day and `HH:MM:SS` timers, tolerates common OCR damage in the
Refinement Center and Time Remaining labels, and accepts timer values on the label line, beside it,
or below it. When Game.log retains stale ship authority, one refinery-only probe is allowed every
15 seconds after 12 seconds without a Resource Signature. Other auxiliary OCR remains deferred.

The Electron log now records bounded `[ocr-refinery]` lines with the crop, OCR engine, text sample,
result, job count, and rejection reason. A native RapidOCR request error recycles the isolated
worker so one OpenCV failure cannot poison every later frame.

## Test

1. Close ArchVerse, extract this archive, and run `./bin/sc-blueprint-tracker`.
2. Launch Star Citizen normally without Gamescope and approve its window once if KDE asks.
3. Open a refinery terminal with at least one active PROCESSING order.
4. Keep the terminal visible for 20 seconds. Confirm the job appears in the Mining widget.
5. Check `electron.log` for `[ocr-refinery] ... result=refinery jobs=1 reason=accepted`.
6. Scan several Mining signatures and confirm recognition remains responsive.
7. Test Gamescope separately and confirm its source remains `gamescope-pipewire`.

If the refinery job does not appear, preserve the complete Electron and sidecar logs and provide an
uncropped screenshot of the terminal. The new diagnostic line will identify whether the crop missed
the title, label, duration, or only the expected layout.
