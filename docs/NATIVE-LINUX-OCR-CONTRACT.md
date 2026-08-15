# Native Linux OCR Contract

This document is a permanent compatibility requirement for ArchVerse native Linux builds.

## Required architecture

Native Linux screen reading is crop-only and feature-owned:

```text
bound Star Citizen frame
  ├─ Resource signature ROI ─ RapidOCR ─┐
  ├─ Fabricator ROI ──────── RapidOCR ──┤
  ├─ Mission ROI ─────────── RapidOCR ──┤
  ├─ Claim/context ROI ───── RapidOCR ──┤─> existing feature parsers/state
  └─ Refinery ROI ────────── RapidOCR ──┘
                              │
                              └─ on RapidOCR failure only -> Tesseract
```

## Invariants

1. Linux must never execute `Windows.Media.Ocr`, WinRT OCR, or PowerShell OCR.
2. RapidOCR/ONNX is the primary OCR backend whenever an enabled Linux feature needs screen text.
3. Tesseract is a failure-only fallback. An empty/no-match RapidOCR result is not itself a reason to run Tesseract.
4. Linux must not perform a full-screen OCR pass. OCR receives only a configured feature ROI cropped from the already-bound Star Citizen frame.
5. Each OCR consumer owns an independent normalized rectangle (`x`, `y`, `w`, `h`). Moving/resizing one ROI must not mutate another.
6. Required named ROIs are:
   - `resourceSignature`
   - `fabricator`
   - `mission`
   - `claimContext`
   - `refinery`
7. ROI geometry is normalized to the bound Star Citizen capture/display, not the full multi-monitor overlay canvas.
8. Every ROI must be user movable, resizable, resettable, hideable, and persisted in user config.
9. The previous mining `scanRegion` migrates only to `resourceSignature`; no other ROI inherits another feature's geometry.
10. Resource-signature OCR remains authoritative when the parsed signature is legal. Radar/glyph recognition remains secondary diagnostic/confirmation telemetry and may not gate the resource result.
11. F-key/hover interaction must never trigger OCR, wake an OCR loop, or change OCR cadence. Calibration boxes use the normal Linux interaction policy only for user editing.
12. Secondary mining telemetry must remain nonblocking.
13. Windows builds may retain the upstream Windows OCR implementation behind an explicit `process.platform === "win32"` execution gate.

## Packaging requirements

All native Linux package families must install both the Tesseract executable and English language data because Tesseract is the contractual fallback:

- Arch/CachyOS: `tesseract`, `tesseract-data-eng`
- Fedora/Nobara: `tesseract`, `tesseract-langpack-eng`
- Debian/Ubuntu: `tesseract-ocr`, `tesseract-ocr-eng`

The shared payload CI must fail closed if any invariant above disappears during a future upstream convergence.
