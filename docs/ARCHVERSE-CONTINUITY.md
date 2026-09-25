# ArchVerse development continuity

This file is the canonical human-maintained project handoff. Update it whenever the verified
baseline, current target, field result, open problem, or next step changes.

## Evidence labels

- **Automated verified:** Repository checks or CI completed successfully.
- **Packaged verified:** The artifact exists and its checksum was verified.
- **Field verified:** Gabe ran the build with Star Citizen and supplied observations or a runtime log.
- **Unverified:** The behavior or artifact has not passed the required evidence level.

Do not convert one label into another without new evidence.

## Alpha23 public Linux release — September 24, 2026

### Candidate 19 source checkpoint — September 24, 2026

Work branch: `agent/alpha23-candidate19-upstream-stability`, based on Candidate 18
`970eaa59b1c176ee1211c6c287ea03fac569b42c`. Gabe approved the post-v0.1.47 trade filters,
Ledger audit, location corrections, log-sharing repairs, and test improvements, but permanently
excluded per-widget hotkey editing from official Linux builds. The imported upstream commits are
`370da99`, `8eea9f6`, `403e7d8`, `d2a8576`, `54a7450`, `e8c25b0`, `8897aed`, and `1a8ead3`.
Upstream editor commit `56c74df` is intentionally excluded, not deferred for automatic import.

The source build locks existing per-widget Settings capture/clear controls and strips widget
hotkey changes from Linux config POSTs while preserving existing startup configuration. The build
rejects known upstream editor entry points. Source tests include negative controls and non-Linux
positive controls. The contract and widget handoff record the permanent exclusion.

Candidate 19 source CI run `35963406730` passed. The package step is staged from the checksum-pinned
public Candidate 18 Arch package. It selectively replaces only the five approved sidecar module
bodies plus the hauling trade UI, refusing wholesale replacement of the package-only Mining and
refinery repairs. Linux Settings, config POSTs, and all five Electron hotkey-editing IPC handlers
reject per-widget hotkey changes; startup registration and held-F behavior remain unchanged.

Local packaged static and regression checks pass through Gamescope/normal capture separation,
Mining cadence, refinery OCR, keyboard authority, pointer behavior, and preload capture. The local
live config check is blocked by the execution sandbox's `uv_interface_addresses` restriction.
GitHub CI run `36188508887` passed the full source suite, pinned-baseline verification, packaged
regressions, real Electron checks, config check, age-band controls, and widget/sidecar integration.

The CI field artifact is `10887299449`. Its outer artifact ZIP SHA-256 is
`04528d41ab3f368b6fdf26d0b43e20982feded119f4fdb0f4fb550913c612a6c`; the contained
`ArchVerse-Native-0.1.47-r31.alpha23.candidate19.tar.gz` SHA-256 is
`ff45d22c84606b94ce7aed79f84b56ea236de2f04a1334d6a6d35c2fb3ed4475`. Independent download
verification passed all 1,659 internal manifest entries. Candidate 19 remains unverified in the
field and is not a public release.

Next: field-test Candidate 19 on Arch KDE and Nobara KDE in both normal and Gamescope launch modes.
Candidate 18 remains the public rollback baseline; do not publish Candidate 19 before those field
results.

Public prerelease tag `v0.1.47-r31-alpha.23` points to release-approval commit
`3c11045011014004903113c8f4f213e6c98dd8f0` on
`agent/alpha23-candidate18-nobara-keyboard`. Publication workflow `35946226335` passed. It
downloaded the exact checksum-pinned Candidate 18 package artifacts from CI run `35937512246`,
verified their outer ZIP and native package hashes, inserted the current installer README, rebuilt
the two public downloads, and verified their complete internal manifests before publication.

Public assets:

- `ArchVerse-Linux-0.1.47-r31-alpha23-Arch-KDE.zip`, SHA-256
  `ad1ec28773fe8127248d50b8672137ac4638d703721e22ea4ca2f1f30072559c`;
- `ArchVerse-Linux-0.1.47-r31-alpha23-Fedora-Nobara-KDE.zip`, SHA-256
  `85df473a884c64ac3e47697974d1ea232584693980470335933e19d7837f0326`; and
- public `SHA256SUMS`, SHA-256
  `d04a0513d46fda48077f8e10181a707feed1fb59066368c737b2e6671251eebc`.

The public ZIPs retain the CI-built Arch package SHA-256
`8543c675437173761a04712e2e0c50468ec0261d92216f847162f950e140bc17` and Fedora/Nobara RPM
SHA-256 `556571aae92ae9471e2e30c84e08e52f8474a8bb7c2737e363cef5378021b2a0`.
The release README includes the KDE Plasma long-press alternate-character warning required for
normal held-key gameplay under Gamescope.

## Alpha23 Candidate 18 Nobara keyboard authority repair — September 23, 2026

Branch: `agent/alpha23-candidate18-nobara-keyboard`, based on packaged-verified Candidate 17
artifact `10733032746` and native archive SHA-256
`90b75e9ceb4c075eadd205284128d01a17cac2489fac8697dde32310995aab06`. Upstream remains
frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

Gabe's Candidate 17 Nobara Electron log is 17,906 bytes, SHA-256
`04b50dd74826f8be34898ffb9dcc00c4dc7813a714f298d38bfe1fef342816a8`. It proves the held-`F`
failure occurs before pointer, widget, or focus logic. uIOhook reported
`XkbGetKeyboard failed to locate a valid keyboard`; evdev opened the Logitech G300s mouse's
auxiliary keyboard endpoint; and the physical SINO WEALTH keyboard failed with `EACCES` on
`/dev/input/event5`. The runtime nevertheless declared evdev authoritative and suppressed all
uIOhook transitions. No `F` down, held, released, or focus-latch event appears in the log. Star
Citizen PID binding, KDE portal PipeWire capture, widget-region publication, and OCR remained
active, so capture and session routing are not causal.

Candidate 18 keeps uIOhook active until a non-pointer physical keyboard stream successfully opens.
It groups aliases by event node, rejects mouse/trackball/touchpad-labeled auxiliary keyboard
endpoints, exposes dynamic evdev authority, restores uIOhook if the keyboard disappears, and logs
an actionable permission error. The native packages install a systemd-udev `uaccess` rule for
keyboard event devices. This grants raw-key access to the active local desktop session without
adding the user to the broad `input` group. The doctor verifies that at least one physical keyboard
endpoint is readable.

The Candidate 16 checksum-pinned Arch, Fedora/Nobara, and Debian installer work is merged into the
Candidate 18 branch and advanced to the Candidate 18 payload. The local installer detects its own
package directory automatically. Candidate 18 uses a deterministic native archive so all three
package definitions can pin SHA-256
`1c5bb72be177704ff1dc18788d9d65457e6d9965ddf68b7c8bdee6201c66495f`.

**Automated verified locally:** the exact field failure regression passes; mouse auxiliary alias
deduplication, permission denial, fallback retention, physical-keyboard promotion, and main-process
authority markers pass. All inherited static capture, session, cadence, Gamescope pointer,
normal-pointer, window-class, refinery, RapidOCR, renderer/IPC, Linux bridge, main-startup, cargo,
encoder, portal, and preload checks pass. Installer detection reports seven passing platform cases;
package definitions and workflow YAML pass; JavaScript and shell syntax and `git diff --check` pass.
The local config E2E test was blocked by this execution environment's
`uv_interface_addresses returned Unknown system error 1`; the clean CI runner passed that unchanged
test.

**Automated verified in packaged CI:** workflow `35937512246` passed against remote commit
`a645c545e599622abf7f58a752161d41910542d1`, exact tree
`7589a779a02993f27f5c7bd9431f16f121eea027`. Both the complete application job and package job are
green. Source gates, all inherited packaged regressions, the Candidate 18 keyboard failure test,
real Electron encoding, configuration and age-band controls, widget/sidecar integration, and the
deterministic native checksum passed. Debian `apt`, Arch package construction, and Fedora 44 `dnf`
dependency transactions passed. Cross-package comparison verified that the Arch, RPM, and Debian
packages preserve every native payload file and symlink.

**Packaged verified:** native artifact `10783523641`, digest
`d958ff9a33e406ae1601ebdc135a1b706206e71bb35953f908050a94745dc37a`, contains native archive
SHA-256 `1c5bb72be177704ff1dc18788d9d65457e6d9965ddf68b7c8bdee6201c66495f`.
Arch artifact `10783683341` has ZIP digest
`6d2a8a48170458b0258b961e807958a7379a0742fb2cc5848ca7592e56da17e5`; Fedora/Nobara artifact
`10784067281` has ZIP digest
`cb440ceaeac9bbf5d38549fc61a8e64d0c4ab82ecf51b828c013b78c42165ce5`; Debian artifact
`10783444428` has ZIP digest
`2ac430d0393f181740cabc7b489aa7672db2efedb078545c64e5d413c96e2c54`.

Independent download verification passed for the Fedora/Nobara artifact: ZIP integrity and digest,
its internal manifest, and RPM SHA-256
`556571aae92ae9471e2e30c84e08e52f8474a8bb7c2737e363cef5378021b2a0` all match. Both in-game
launch-mode gates were still **unverified** at the package-verification checkpoint.

**Field verified on Nobara 44 KDE:** Gabe installed Candidate 18 and completed both normal
Wine/XWayland and Gamescope sessions. `archverse-doctor` reported every runtime dependency, the KDE
portal, the Candidate 18 payload, and one readable physical keyboard as `[OK]`. The normal launch
opened the SINO WEALTH physical keyboard through evdev, rejected the Logitech G300s mouse's
auxiliary keyboard endpoint, and delivered every tested `F` down and release transition. With Star
Citizen running, held-`F` widget interaction worked.

The Gamescope run bound the exact `StarCitizen.exe` PID to its Gamescope ancestor and retained a
direct BGRx 1920x1080 PipeWire stream. Steady capture completed in 5–11 ms, Mining processing
averaged about 42–54 ms, and IPC failures remained zero. Held `F` entered the Mining widget and
panel, verified the host-pointer handoff, pinned the compositor mouse stream, and restored hard
click-through after leaving the widgets. The Star Citizen session released cleanly at game exit.
No ArchVerse crash, capture restart, permission failure, or lost keyboard stream occurred.

The only observed interruption was KDE Plasma's optional long-press alternate-character feature,
which consumes held letter keys and displays a character-selection popup. Disabling **System
Settings → Keyboard → On-Screen Keyboard → Alternate characters — Show popup when holding a key**
restores normal Gamescope gameplay. This is documented in the public installer README and is not an
ArchVerse defect.

Candidate 18 is therefore the **field-verified Nobara KDE release baseline** for both normal
Wine/XWayland and Gamescope. The Arch-family package contains the byte-identical native application
payload already proven on Arch/CachyOS through Candidate 16 and passed Candidate 18's complete
packaged regression and package-identity gates.

## Alpha23 Candidate 17 Nobara window-class repair — September 23, 2026

Branch: `agent/alpha23-candidate17-nobara-window-class`, based on packaged-verified Candidate 16
artifact `10598690018` and native archive SHA-256
`244c4da008883a3bff8143078bda85c2a4f23450e11a459f2e5cc3c303483091`. Upstream remains
frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

Gabe's Nobara 44 field run produced a core dump from
`xdotool getwindowclassname 2097152`. The stack terminates in Fedora's `libxdo`
`xdo_get_window_classname` and `XFree`. ArchVerse remained open because the failed `xdotool`
instance was a child process. Candidate 16 calls that operation from two focus-ownership lookups,
so each abort can create a coredump and return an empty window class to one ownership decision.

Candidate 17 reads `WM_CLASS` through `xprop -id <XID> WM_CLASS`, matching the established normal
capture probe. A stale or vanished XID becomes an empty lookup result. The KDE portal capture,
direct Gamescope PipeWire capture, session binding, pointer sampling, focus handoff, OCR, and
widgets are unchanged. A regression verifies the exact `xprop` argument vector, invalid-XID
rejection, vanished-window handling, and removal of `xdotool getwindowclassname` from the focus
controller.

Remote repair commit `974f816f6754512362b4f5cf3c9a56e54b6e4ec0` has exact tree
`9effb01078ddf073d8acad4afdd23eae71a693d1`. Workflow run `35820400137` passed the complete
source, packaged capture/input, Electron, refinery, RapidOCR, configuration, age-band, and widget
integration gates. Artifact `10733032746` produced
`ArchVerse-Native-0.1.47-r31.alpha23.candidate17.tar.gz`, SHA-256
`90b75e9ceb4c075eadd205284128d01a17cac2489fac8697dde32310995aab06`. Independent verification
passed the artifact ZIP digest, archive checksum, and all 1,658 internal manifest entries.
Packaging is **verified**. Gabe reports that Candidate 17 no longer produces the Nobara
`xdotool getwindowclassname` crash, so that repair is **field verified**.

Gabe preserved the Nobara coredump report for PID `23113`, command
`xdotool getwindowclassname 2097152`, boot ID
`d62889cd920f4bc3be813ab1e83b475f`, and timestamp September 22 at 21:44:01 PDT
(September 23 at 04:44:01 UTC). Repeated pasted sections are the same event: PID, boot ID, command,
and timestamp all match. The crash predates the Candidate 17 repair commit at 04:56:50 UTC, so it
is Candidate 16 evidence and does not test Candidate 17.

The accompanying `sidecar(20260923-063728).log` is 11 lines, 1,102 bytes, SHA-256
`1bb1ef74c2c1dace60872edcb0ffed79b186ec552b41e1ae75c9ee9bbeb14286`. It shows successful
economy, Hauling, localization, rotated-log replay, and live `Game.log` watcher startup. The two
optional emote providers returned HTTP 404; chat explicitly continued without those emotes. The
log contains no capture, OCR, Mining, refinery, scanner, process, or fatal error. It also contains
no held-`F` input diagnostics.

The later held-`F` diagnosis and Candidate 18 repair are recorded above.

## Alpha23 Candidate 16 pointer-mode isolation — field verified September 22, 2026

Branch: `agent/alpha23-candidate16-pointer-mode-isolation`, based on packaged-verified Candidate 15
artifact `10596449945` and native archive SHA-256
`5d2e130648131faa03f9688f850bf306b5c7e39ff925971233fc735f2965da61`. Upstream remains
frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

**Candidate 15 repaired and field-confirmed the refinery timer, but its normal-launch pointer path
failed.** Gabe supplied a complete Electron log and sidecar log with SHA-256
`bd47d9c85aa5e3f6b73c772ae665a69a74c6f5b0bd064e321c0c3934ff082c86` and
`fa2da1a835204df3d5c5447927c58df1bd37740eeb84e1829254ff3c63699532`. Normal native KDE
capture restored its prior portal approval without another chooser, delivered frames in 29–35ms,
and accepted one Lindinium refinery job four times. That confirms the portal restore token,
selected Star Citizen stream, normal capture, and Candidate 15 refinery parser all worked.

The same log proves a separate input-mode defect. The exact session binder reported a direct,
non-Gamescope Star Citizen PID, but held `F` still queried `gamescope-display`. The controller read
the normal Wine/XWayland host `DISPLAY` at 3840x2160 and scaled its point onto the 6360x2160 overlay.
It classified `5722,2077` as a widget, focused ArchVerse, and pinned its compositor mouse stream,
while the native click arrived at `3335,1288`. Because `F` is Star Citizen's ordinary interaction
key, this false coordinate domain made Star Citizen and ArchVerse appear to fight over the cursor.

Candidate 16 makes a verified Gamescope PID mandatory before reading or scaling a process display
as a nested pointer source. Normal Wine/XWayland sessions fall through to the existing host uIOhook
or X root pointer without scaling. Switching to a normal session clears cached Gamescope display
state. The existing focus handoff, held-`F` widget ownership, physical button forwarding, and direct
Gamescope behavior remain unchanged. A regression covers normal refusal, real Gamescope mapping,
and Gamescope-to-normal cache disposal.

Remote source commit `4f9f94c2907470fc095859ee659c465173e647e2` has exact tree
`65b213b50c2ae138754806741789f0b20441b0f5`. Workflow run `35488559407` passed the complete
source, packaged Electron, capture, pointer, refinery, RapidOCR, configuration, age-band, and widget
integration gates. Artifact `10598690018` produced
`ArchVerse-Native-0.1.47-r31.alpha23.candidate16.tar.gz`, SHA-256
`244c4da008883a3bff8143078bda85c2a4f23450e11a459f2e5cc3c303483091`. Independent streaming
verification passed all 1,657 internal manifest entries. The Candidate 15-to-16 comparison found
only the intended pointer controller, package/provenance/field-guide changes, the updated inherited
pointer test, and the new mode-isolation test; all other files and all five symlinks match. Packaging
is **verified**.

**Both launch-mode field gates are now verified.** Gabe first reported that Candidate 16's normal
Wine/XWayland run worked without an observed issue. The supplied normal Electron and sidecar logs
confirmed that the native KDE portal stream, refinery reader, widget interaction, and host-coordinate
pointer path operated together without the Candidate 15 cursor fight.

Gabe then completed a roughly 91-minute Gamescope run and reported no observed issue. The complete
Gamescope Electron log, SHA-256
`46a1a7857fc9a979c917254c01d4346658ccbba69377292a5ba879356f21f059`, and sidecar log,
SHA-256 `a4227cafd7a4a831a7174af78313adaae4016c5fcf454a8229b51d3ba1016d58`, show:

- exact Star Citizen PID binding to its Gamescope ancestor and direct `gamescope-pipewire` capture
  from PipeWire node 143 throughout active play;
- 353 capture heartbeat samples at 9 ms minimum, 62 ms median, 69 ms p95, and 79 ms maximum;
- 1,066 Mining OCR observations at 23 ms minimum, 189 ms median, 315 ms p95, and 453 ms maximum;
- 354 Mining heartbeats with zero pending or failed IPC, 265 signature detections, 159 commit
  submissions, 154 acknowledgements, and no rejected commit;
- 141 sidecar Mining signature events admitted by Game.log vehicle authority plus an exact Resource
  Signature value;
- four accepted refinery reads at LEVSKI with a decreasing timer;
- successful held-`F` interaction with Mining, Hauling, Notepad, Battaglia, Twitch chat, and generic
  widgets, followed by focus and click-through restoration; and
- successful Gamescope Location Sync to Crusader.

Non-blocking recovery evidence remains visible and must not be hidden: five bounded vehicle-gate
GET timeouts retained the last confirmed state and recovered; one RapidOCR native error recycled the
worker and used Tesseract fallback; and a final Mining commit timeout retained the newest result while
the game was quitting. After the main Star Citizen PID exited, Wine briefly exposed a transient
replacement PID outside the prior Gamescope ancestry. That exit-time race attempted one normal portal
session, which was denied, and briefly captured a fallback desktop frame before the PID disappeared.
It did not affect active gameplay, but session-shutdown cleanup is a future hardening item. The
sidecar also received four `400 bad_size` responses while trying to share a rotated 4 MiB Game.log;
local readers continued normally, so this is a separate cloud log-share defect.

Candidate 16 is therefore the **field-verified Linux integration baseline** for normal KDE
Wine/XWayland and Gamescope. It is not yet a current Arch KDE or Nobara KDE distribution release.
Fresh distro packages must still pass dependency, installation, launch, portal, direct Gamescope,
widget, and upgrade/rollback checks. Widget development may now continue from Candidate 16 under
`docs/LINUX-WIDGET-DEVELOPER-HANDOFF.md` without freezing ordinary widget UI and feature work.

## Alpha23 Candidate 15 refinery reader repair — September 20, 2026

Branch: `agent/alpha23-candidate15-refinery-reader`, based on packaged-verified Candidate 14
artifact `10592371411` and native archive SHA-256
`4b822d196d9769d67bd872732f9ca52cb59367a285eb040765fe7a6b367`. Upstream remains
frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

**Candidate 14 normal KDE field capture passed, but the refinery reader failed.** Gabe supplied a
complete normal X11/XWayland Electron log and sidecar log with SHA-256
`2b5d1f166ca104ba946973610c1e82ade079609ae12a110ffb64f4706ee24615` and
`2c04bd2fcdae0267b3ce363555754d02121cc41d30d8b8d8b6f2e80864e0bc5a`. The native KDE
portal retained the selected 6270x2160 Star Citizen stream, normalized its 3786x2160 center game
view to 3840x2160, and normally delivered frames in 28–37ms. Mining and Hauling worked in the same
run. The refinery lane completed one logged slow read in 2912ms but produced no refinery result,
job, state change, or widget event. A completed OCR request therefore reached the classifier, but
the strict title/label/timer geometry did not create a job.

Gabe then supplied the exact 2048x1180 refinery frame, SHA-256
`788582f14018936d5622e1460c84b5735ca9c9d37fb937565c01bc12e022e0fa`. Candidate 14's
RapidOCR reads the default refinery crop as `REFINEMENT CENTER CURRENTBALANCE: 10.O53,914 AUEC`
and merges the countdown into `TIME REMAINING 56m 43s`. That proves the primary failure: the old
classifier rejected a duration on the label's own OCR line because it searched only a different
line to the right. The crop also trims `LEVSKI` to `KI`; Candidate 15 rejects that truncated
two-letter station instead of assigning a misleading location. The exact field OCR output is now a
regression fixture and produces a 3403-second Lindinium job.

Gabe also supplied a Candidate 14 Gamescope Electron log and sidecar log with SHA-256
`77e4327ac4cbbfe6fb9bb2dc3b30bbf3150e92e462f4fdc098ff47140b60eb39` and
`c65ad57a481756a6b7b702da5badd16235fe474159c0dd67792db666bd26d831`. Direct Gamescope
PipeWire capture remained healthy at 58–72ms. The refinery lane completed repeatedly every about
18 seconds in 2493–3176ms but never produced a job. This independently locates the Gamescope
failure after capture in the same shared refinery classifier. Candidate 15 therefore keeps the
protected Gamescope helper unchanged and applies the parser repair to both launch modes.

The existing parser required nearly exact `Refinement Center` and `Time Remaining` text, then
required an h/m/s duration on the same row, to the right, and within 560 pixels. It did not accept
days, `HH:MM:SS`, a timer merged into the label line, or a timer below the label. After 00:27:49Z,
Game.log also retained active Prospector ship-channel authority, which suppressed every auxiliary
OCR lane, including refinery, for the rest of the session. Separately, the Resource Signature
worker returned 5001 RapidOCR native errors between 01:51:21Z and 02:38:42Z. Tesseract kept Mining
functional, but the live worker was reused after each identical OpenCV function-signature error.

Candidate 15 changes only the refinery/background OCR behavior, bundled sidecar classifier, and
isolated RapidOCR client:

- Refinery titles and Time Remaining labels tolerate common OCR substitutions.
- Timers may be on the label line, beside it, or below it. Days and `HH:MM:SS` are accepted.
- A stale active vehicle state permits one refinery-only probe every 15 seconds after 12 seconds
  without a Resource Signature. An active signature lock still keeps Mining exclusive, and all
  other auxiliary readers remain deferred.
- Bounded `[ocr-refinery]` diagnostics report the engine, actual pixel region, line count, result,
  job count, rejection reason, and a capped OCR sample.
- A native RapidOCR request error discards the still-live worker. The next frame starts a clean
  worker instead of repeating one poisoned native state indefinitely.

**Automated verified locally:** TypeScript, source duration/refinery fixtures, packaged Candidate 15
refinery API and rejection diagnostics, active-authority scheduling markers, RapidOCR worker
recycling and next-frame recovery, Candidate 11 cargo rejection, Candidate 13 native portal, and
Candidate 14 portal-reply/Gamescope-isolation regressions. JavaScript syntax, workflow YAML, and Git
whitespace checks pass.

**Automated verified in packaged CI:** run `35485882713` passed against source commit
`294c05da3277722e680d722de52011ee922defb2`, exact tree
`8b761958bc98a6c7a98a712bc62eff665bde99c6`. The verified Candidate 14 archive gate, upstream
checks, inherited capture/session/cadence regressions, real Electron checks, renderer/IPC audits,
Linux bridge and main startup, configuration and age-band controls, Candidate 15 regressions, and
the complete staged widget/sidecar integration all passed.

**Packaged verified:** artifact `10596449945`, `ArchVerse-Alpha23-Candidate15-field-test`.
Artifact ZIP SHA-256 `ce68d3ef8a5cda7b03b590ece4fa805882e200875987a61b3c39c10b537376d3`.
Native `ArchVerse-Native-0.1.47-r31.alpha23.candidate15.tar.gz` SHA-256
`5d2e130648131faa03f9688f850bf306b5c7e39ff925971233fc735f2965da61`.
Independent streaming verification passed all 1656 internal file hashes. Comparison with Candidate
14 found 1646 unchanged files and five unchanged symlinks; only the eight intended refinery/OCR,
version, provenance, and field-guide files plus two Candidate 15 tests differ. Both in-game
launch-mode gates remain **unverified**.

## Alpha23 Candidate 14 KDE session-handle repair — September 19, 2026

Branch: `agent/alpha23-candidate14-kde-session-handle`, pinned to packaged-verified Candidate 13
artifact `10588907705` and native archive SHA-256
`64c5a5752e7d4a70790ddb7e967a570a153f03c77982dcec8406fe0dd6f49093`. Upstream remains
frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

**Candidate 13 normal KDE field gate failed before window selection.** Gabe supplied separate
normal and Gamescope Electron/sidecar logs. Their SHA-256 values are normal Electron
`2851bafb42d896da7e01856ff25bc3e91bb31b9db861a87f159f2a1d86f849d5`, Gamescope Electron
`0db2a19ef34e8e256adfd7bfc789ba075c8afef5b8029c1212b61d2acf97f493`, normal sidecar
`9475c48f9f9f778c2b3d3c88e2d54f83c02f0cbc881190ede09f5a76aedfa0e4`, and Gamescope sidecar
`37fd6f257ffdead92632572b0e9e9b0a5552be13009da302f266d9f0e465e84b`.
The normal helper bound Star Citizen PID 51528, called `CreateSession`, and exited 119ms later with
`CreateSession returned no session_handle`; it never reached portal `Start`, so KDE had no reason
to show its chooser. The fallback then hit the known X11 MIT-SHM BadMatch and used Spectacle at a
2571ms median capture time across 46 heartbeat samples. Mining still committed four signatures.

The failure is an exact D-Bus type mismatch. XDG ScreenCast specifies `session_handle` as type `s`
for historical compatibility, although its contents are an object path. Candidate 13 requested
only type `o` from GLib, so a valid KDE string reply looked absent. Candidate 14 accepts the
required string representation, defensively accepts an object-path-typed representation, and
validates the contents with GLib's object-path validator. Missing, incorrectly typed, and malformed
portal replies now report the actual D-Bus type where available. A compiled helper self-test covers
the specification string, object-path compatibility, wrong type, malformed path, and missing value.
Real cancellation, stream termination, and one-attempt-per-game quarantine remain unchanged.

**Candidate 13 Gamescope field capture passed:** the direct Gamescope PipeWire path captured at a
61ms median across 56 heartbeat samples and committed 27 Mining signatures. Candidate 14 does not
modify either Gamescope helper, the capture router, OCR workers, input, sidecar, widgets, or
configuration. The static Candidate 14 gate retains exact hashes for both Gamescope implementations.
Normal KDE chooser appearance and native capture cadence remain **unverified in game** until Gabe
tests the packaged Candidate 14 archive. Distro publication remains disabled.

**Automated verified locally:** JavaScript syntax for the staging script and the Candidate 14
source regression, including the specification-required string lookup, content validation,
diagnostics, and Gamescope hash guards. This workspace lacks `pkg-config` and native development
headers, so strict C compilation and the executable self-test are delegated to the pinned CI job.

**Automated verified in packaged CI:** run `35468978412` passed against source commit
`8144ae7dc8df92b093f18fed9cfc1738ae351824`, exact tree
`31a9b48cd727851f0832e2a1d4349c6c4903205f`. The strict native C build and executable portal
reply self-test passed first, followed by the pinned Candidate 13 archive and manifest gate,
upstream checks, all inherited capture/session/cadence regressions, real Electron raw-frame tests,
renderer/IPC audits, Linux bridge and main startup, configuration and age-band controls, and the
complete staged widget/sidecar integration.

**Packaged verified:** artifact `10592371411`, `ArchVerse-Alpha23-Candidate14-field-test`.
Artifact ZIP SHA-256 `d4632d56cf375b2e6c1b4bf7e2e0e5b2834f5a6ed9d634a00fb2bd5e93b9808b`.
Native `ArchVerse-Native-0.1.47-r31.alpha23.candidate14.tar.gz` SHA-256
`4b822d196d9769d67e2d67bd872732f9ca52cb59367a285eb040765fe7a6b367`.
Independent streaming verification passed all 1654 internal manifest entries, 23 protected hashes,
and five symlinks without relying on the host's unreliable large-file extraction. Comparison with
Candidate 13 found only the native helper/source, Candidate 14 regression, version/provenance,
checksums, and field guide changed. Both Gamescope implementations match their protected hashes.
Normal KDE chooser appearance and native capture cadence remain **unverified in game**.

## Alpha23 Candidate 13 native normal portal capture — September 19, 2026

Branch: `agent/alpha23-candidate13-native-portal-pipewire`, based on packaged-verified Candidate 12
artifact `10532024821` and native archive SHA-256
`c7d83050f1b28299f20880f182c5acba8a3ac93993d34eb6ed28ed78f7c54d46`. Upstream remains
frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

Gabe chose not to field-test Candidate 12's remaining Electron canvas/PNG path and authorized the
recommended native normal-capture replacement. Candidate 13 keeps Gamescope byte-for-byte separate.
For a normal KDE Wayland session, a small native helper requests one WINDOW through the XDG
ScreenCast portal, opens only the returned restricted PipeWire remote file descriptor, and consumes
the selected node through GStreamer `pipewiresrc`. The helper retains the approved session, stores
the portal's rotating restore token in the canonical config directory, and emits bounded raw BGRA
snapshots. A display request is cropped before raw transfer when the source geometry is known;
Location Sync still requests the complete canvas before its top-right crop. The Electron canvas,
PNG encoder, XComposite, and Spectacle do not participate in the normal steady-state path. True X11
retains its isolated Electron/X11 stream as a separate fallback.

The method remains `portal-pipewire-window`, exact Star Citizen PID/start-time binding remains, a
failed/cancelled/ended helper is still quarantined for that game process, and one live KDE chooser
still pauses screenshot fallbacks. The direct Gamescope helper, input, OCR workers, Mining catalog,
sidecar, configuration API, and widgets are unchanged.

**Automated verified:** Candidate 12 archive ZIP and internal manifest; strict `-Werror` native C
compilation; linked GStreamer element self-test; JavaScript syntax; native-helper selection and
arguments; exact raw BGRA byte/size validation; real Electron BGRA bitmap decoding; pre-transfer
display crop request; XID churn retention; PID/start rebind; all inherited capture/session/cadence
regressions; renderer/IPC audit; Linux bridge; Electron main startup; configuration controls; and
widget/sidecar integration. CI run `35459389538` passed. Tested source commit
`aa32610932c358e6730da618410210a969756320` has tree
`a61f236ef61bb318a092d3e071170f6833358266`.

**Packaged verified:** artifact `10588907705`, `ArchVerse-Alpha23-Candidate13-field-test`.
ZIP SHA-256 `de44dd018c9b322d372d908428edb0c1b61c3ca256ab01a757398d383eac7e88`.
Native `ArchVerse-Native-0.1.47-r31.alpha23.candidate13.tar.gz` SHA-256
`64c5a5752e7d4a70790ddb7e967a570a153f03c77982dcec8406fe0dd6f49093`.
All 1653 internal manifest entries and 23 protected hashes passed. Independent Candidate 12
comparison found only the intended capture files, native helper/source, raw decoder, tests,
version/provenance, checksums, and field guide. Both Gamescope helpers are byte-identical to
Candidate 12. The later Candidate 13 field result and Candidate 14 repair are recorded above.

## Alpha23 Candidate 12 normal portal latency — September 18, 2026

Branch: `agent/alpha23-candidate12-lossless-portal`, pinned to packaged Candidate 11 artifact
`10477397738` and native archive SHA-256 `60406e891af0bf881b8c041de455c087192e23608a499fc49439d0cff652bf47`.
Upstream target stays frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

**Candidate 11 normal capture field gate failed.** Gabe supplied a long mixed-launch Electron
log and sidecar log with SHA-256 `126b6d04df8ad6fc5499ef695a1a774c74deda9098b24c674f46804d496571da`
and `1429f3b439174884e864844ec94497e93cf569ce7febf7d125ad6480b17b95a4`.
The Gamescope session bound PID 27064 to Gamescope PID 26566 and retained direct
`gamescope-pipewire`: 371 heartbeat samples have median capture 63ms and median tick average
370ms. The sidecar logged 21 confirmed signature events across the run, including repeated values.
Normal launches bound
PIDs 215757 and 220359 separately; KDE approved one portal stream for each, with chooser waits
around 25s and 40s. There is no evidence of repeated chooser requests for the same PID or a
competing Spectacle request before each approval. The first stream ended immediately before that
game session was released. The second remained approved but its detailed-scene nativeImage PNG encode had median
862ms (393 summaries) against a 700ms caller deadline. 326 deadlines sent capture to slow
Spectacle; 255 Spectacle heartbeat samples had median capture 2524ms and median tick average
3067ms. The portal captured usable frames with live tracks in between. XID capture returned
MIT-SHM BadMatch and cooled down. The sidecar confirmed signatures during normal capture, while
an unrelated rotated Game.log upload repeatedly returned `bad_size` at 4194316 bytes.

Candidate 12 changes only the isolated normal portal encoder and its caller deadline. Encode the
complete RGBA canvas in a standards-compliant lossless PNG with filter None and stored DEFLATE
blocks; no scene-dependent nativeImage PNG compression or libvips inside the renderer. Use a
1400ms soft deadline to retain occasional slower approved frames; keep the eight-second hard
stall quarantine and PID/start-time session binding. No Gamescope helper, input, OCR crop,
Mining catalog, sidecar, configuration or release behavior changes. Both launch modes still
require separate field tests; Candidate 12 remains quarantined pending field verification.

**Automated verified:** full Candidate 11 archive SHA and 1647-file manifest, protected
file hashes, staged Candidate 12, exact PNG RGBA/CRC and a 900ms delayed frame that now reaches
the caller, inherited chooser/session regression, renderer/IPC audit, Linux bridge and main
startup. CI run `35308592319` passed upstream checks, pinned baseline and protected-file gates,
packaged regressions, real Electron pixel decoding, configuration controls and widget integration.
Remote source commit `42e73c9f83a44a70e8efa9ee2324eb9f85d090c2` has tree
`dad5d252d1c95ed48c55fa56aacac6ca7eacbe68` (a documentation-only follow-up may advance
the branch without changing this tested source tree).

**Packaged verified:** artifact `10532024821`, `ArchVerse-Alpha23-Candidate12-field-test`.
ZIP SHA-256 `7b7c3c010ed33ba753aa35cb94d755b497368f0a3df42f93e438610f41578eba`.
Native `ArchVerse-Native-0.1.47-r31.alpha23.candidate12.tar.gz` SHA-256
`c7d83050f1b28299f20880f182c5acba8a3ac93993d34eb6ed28ed78f7c54d46`.
The 1648-entry internal manifest passed. Independent Candidate 11 comparison found only the
normal portal encoder and caller, package version/provenance, release text, checksum manifest,
and regression tests changed. A temporary Electron extraction file in the baseline comparison
directory was not a packaged file. Gamescope capture, Mining sidecar and overlay input match
Candidate 11. The first local tar extraction truncated Electron; streaming that single file
from the original tar recovered the expected manifest hash. In-game chooser appearance and actual
normal-capture cadence remain unverified; capture and signature timing must be measured in both
launch modes independently before release.

## Alpha23 Candidate 11 portal and cargo repair — September 17, 2026

Branch: `agent/alpha23-candidate11-portal-and-cargo`, based on packaged-verified Candidate 10
commit `282e7ca3b07d691309a3b231f50aafd38d2ae4b5`, artifact `10427872184`, native SHA-256
`0983ef18d0b56a0e5a1ebe8e92f641055af7cc072b962d9cd1d1f38ee2b4a8fc`. Upstream stays
frozen at v0.1.47 `e482c1ce3d461b390079486115293535be9b2ab7`.

**Candidate 10 normal-capture field gate failed.** Gabe supplied two complete Electron logs and
one short sidecar log with SHA-256 `2eb6b00322a64cd06e759d0f718955fdc1e1e515b01f05d690dcc97f2e6aba68`,
`d38ad876492a3968598ad3df2c09fc42a015002647854047653fc0b8c1b48ab7`, and
`f352a0380ec2ffba5d8d083464dfaf6bc11d69c648c40c87f3674172c4428979` respectively.
KDE portal reported a ready 3840x1322 window in both runs. Concurrent Spectacle fallback could
open a competing chooser before the portal approval finished. The first portal frame emitted a
sharp/libvips C++ assertion inside the Electron renderer; each log then recorded one 700ms frame
deadline and an outstanding frame request for the remainder of the run (184 and 314 fallback
messages). Spectacle remained functional at median 2466/2557ms capture, yielding median full
scanner ticks of 2803/2907ms; OCR medians were 162/168ms. Mining acknowledged 9 and 2 signatures
respectively with no Mining IPC failures. No direct `gamescope-pipewire` frame is in these two logs,
so Gamescope is not field-verified at Candidate 10. The second run also admitted cargo text
`EXODUS | Volume:6066000uScU | X 16,000` twice as RS 16000 while Game.log vehicle authority was
active. The exact catalog and distinct-frame guard alone cannot reject a repeated item quantity.

Candidate 11 changes only the isolated normal-window helper/parent/preload encoder, normal capture
selection handling, and mirrored local/sidecar Mining cargo admission:
- A pending KDE WINDOW selection pauses normal capture and Location Sync fallbacks. Spectacle
  cannot obscure the chooser. Failure/denial retains the existing one-attempt-per-game rule.
- The helper uses Electron `nativeImage` to encode the full RGBA canvas as PNG, converting BGRA
  explicitly without sharp/libvips in the renderer. A real packaged Electron preload test must
  run this encoder; Node-only testing was inadequate in Candidate 10.
- A crashed renderer reports a terminal error. A frame that never replies is quarantined after an
  eight-second hard deadline. Slow frames within the deadline still retain approved sessions and
  late-frame reuse; no automatic re-prompt occurs for that Star Citizen PID/start identity.
- OCR crops containing `Volume:` or SCU units cannot authorize RS values, even if the value is
  split onto another OCR line. Both local admission and the sidecar parser reject the exact field
  text. Genuine 21350 and 2000 scan examples remain admitted, with exact catalog and Game.log
  authority unchanged.
- The normal portal's successful frame uses the stream's 1600ms distinct-frame window. The
  Gamescope direct PipeWire helper, overlay input, OCR workers, widgets, and configuration are
  protected unchanged.

**Automated verified:** local chooser/stall/mode, cargo parity, encoder channel-order/budget,
preload, inherited cadence and capture/session suites. The full Candidate 11 CI run
`35173315499` passed upstream checks, pinned Candidate 10 verification, packaged regressions,
real Electron encoder and renderer checks, configuration and age-band controls, and widget
integration. Source commit `02959227ce5bd96daf6efad1bd0666f6f0f5c2c7` has exact tree
`d589ddcf886052a7271692c80fb415893270cc6d`.

**Packaged verified:** artifact `10477397738`, `ArchVerse-Alpha23-Candidate11-field-test`.
Artifact ZIP SHA-256 `e7cf113edb401c721f1b766677a0e3f1f67c9b1405c7794c79173721e80cf8e5`.
Native `ArchVerse-Native-0.1.47-r31.alpha23.candidate11.tar.gz` SHA-256
`60406e891af0bf881b8c041de455c087192e23608a499fc49439d0cff652bf47`.
Independent archive verification passed the full 1647-entry internal hash manifest and all
20 protected-file hashes. Only the intended capture, Mining admission, sidecar parser,
version/provenance and test files differ from Candidate 10. The direct Gamescope helper,
Electron runtime, OCR workers and input files match Candidate 10. This workspace initially
truncated the large Electron executable during extraction; direct archive streaming matched
its expected SHA-256, and re-extraction of that file made the full manifest pass. Provide
smaller download parts with a reconstruction checksum to address the earlier corrupt-file warning.

Candidate 11 in-game logs arrived September 18. Gamescope direct capture and Mining confirmation
worked; normal KDE capture remains too slow. See Candidate 12 above. Publication remains disabled.

## Alpha23 Candidate 10 capture cadence — September 16, 2026

Branch: `agent/alpha23-candidate10-capture-cadence`. Upstream remains v0.1.47,
`e482c1ce3d461b390079486115293535be9b2ab7`. Start from packaged-verified Candidate 9,
source `11cbca49ca9a92f17927463b544b0d0cf37b06de`, artifact `10425834446`,
archive SHA-256 `fff229eac04f64de84fa51f8ffacd9f296131b13fbfbfa391a6f80398afb83b9`.
Candidate 9 source/handoff checkpoint is `2a62056e5141d7b034f9e3f7387ee803744a88c2`.

**Candidate 9 field gate failed.** Gabe supplied normal and Gamescope Electron logs and the
fresh Gamescope sidecar log. Normal KDE approval remains latched; the approved 3840x1642 live
track spends about 1087 ms in canvas PNG encoding, repeatedly missing the 700 ms frame deadline.
Normal capture consequently uses slow Spectacle, although Mining can confirm signatures there.
Gamescope direct PipeWire is alive: node 219, 6270x2160 canvas, display crop 3786x2160, roughly
58–64 ms capture. In the mixed-mode log, complete scanner ticks take roughly 8.1–8.45 seconds,
so the existing distinct-frame fast confirmation expires before each matching read. After the wait
clears, matching frames 218 ms apart confirm. The separate fresh Gamescope log has inactive
vehicle authority (`source=none`) and no numeric OCR. Its sidecar log contains watcher/seed
messages only. Gabe subsequently supplied game(3).log, covering 01:56:55–02:02:17 UTC.
The actual packaged parser recognizes exactly one vehicle event: local MISC_Hull_B control release
at 01:59:03.158, with zero ship-channel joins or later control grants in this snapshot. The actual
packaged sidecar replay, explicitly watching this uploaded path with sync/sharing disabled, returns
active=false/source=none. This is consistent with the fresh gate; it does not prove physical on-foot
status, and the snapshot ends before the fresh Gamescope app begins at 02:02:43. A Janus maximum
publishers error is present, but its role in missing channel joins is unproven. Startup already
replays live vehicle-control and ship-channel events. Never substitute radar pixels or signature
vocabulary for Game.log authority.

Candidate 7→8 changed normal exact-XID capture to bounded MIT-SHM retry/cooldown, fixed the
portal renderer to use a trusted local file origin, and accepted the one user-approved Wayland
window source. Candidate 8→9
changed only the normal portal parent/helper/preload: stable PID/start binding, approved-session
retention and frame diagnostics. The direct Gamescope helper remained byte-identical throughout.
The eight-second remote Fabricator have-list await existed in Candidate 7 too; failed requests
left the retry timestamp stale, exposing the same wait on every scanner tick when Fabricator is
armed. Capture backend/coordinate state also leaked between normal and Gamescope game sessions.

Candidate 10 repairs this capture/cadence behavior group:
- Remote Fabricator catalogue refresh is asynchronous to the capture tick, shared with the upload
  drain, single-flight, and retried after 30 seconds on failure. Last confirmed catalogue survives.
- Exact game PID/start/Gamescope identity resets capture backend, coordinate size and probe state.
  Late probes from older sessions are discarded. Gamescope fallback upgrades try direct PipeWire
  first; normal portal/XID sources stay outside Gamescope Mining and Location Sync routes.
- Only normal-window preload encoding changes: canvas RGBA readback goes through the existing
  packaged sharp library in the isolated portal helper, lossless PNG compression level 0, one
  native worker, disabled native cache, 16-million-pixel budget and three rotating private files.
  Full canvas/coordinates, approved stream retention and distinct video-time tokens remain. Frame
  age starts at canvas readback rather than after encoding.

**Automated verified locally:** stalled remote refresh/single-flight/cooldown/cache tests; actual
capture function exercised across both mode transitions, PID reuse, Gamescope fallbacks and direct
upgrade; actual preload busy/repeated-frame/full-canvas/encoding error/track-ended tests; native
PNG exact pixel round trips at 3840x1642 and 6270x2160 plus allocation budget rejection; inherited
Candidate 6 distinct-frame confirmation and Candidate 9 session quarantine tests. Native encoding
of synthetic opaque random textures measured 38 ms and 217 ms respectively on this host. These
are encoder measurements, not field capture timings.

**Automated verified in packaged CI:** run `35047545531` completed successfully against source
`82829e36de78519079858662d00d9ebb9885ad10`, tree `90aeb950df68c9515543f9d97b4cbf2b7551baeb`.
Upstream typecheck/reppage/repscan/repname gates; native syntax and renderer IPC audit; Linux bridge
and main startup; inherited Candidate 6 confirmation, Candidate 8 XID/Gamescope, and Candidate 9
session gates; Candidate 10 cadence/mode/Location Sync, preload and native encoder gates; actual
packaged Electron retained insecure-origin negative plus secure-renderer positives; canonical
config E2E; five ageband controls; complete staged widget DOM suite including pair merges passed.
The inherited Candidate 9 preload test ran against pinned Candidate 9, while Candidate 10's preload
test exercises the new encoder transport. CI native random-texture encoding measured 13 ms and
15 ms respectively. The local canonical-config test was blocked by this host's restricted network
interface introspection; unchanged packaged config E2E passed in CI. No application workaround
was introduced for that host restriction.

**Packaged verified:** artifact `10427872184`, `ArchVerse-Alpha23-Candidate10-field-test`.
ZIP SHA-256 `64e4a7974525822c64122a0a01f621d4a8f20181497315b91cdb38ce4f31ccd5`.
Native `ArchVerse-Native-0.1.47-r31.alpha23.candidate10.tar.gz` SHA-256
`0983ef18d0b56a0e5a1ebe8e92f641055af7cc072b962d9cd1d1f38ee2b4a8fc`.
Independent archive verification checked 1644 regular files, the complete internal hash manifest,
20 protected file entries, all five unchanged symlinks, executable ELF runtime, exact new source
and test bytes, and every unchanged baseline file/mode. App changes versus Candidate 9 are only
capture.cjs, normal-window preload, the added encoder, and package version metadata. No runtime,
sidecar, OCR worker, Gamescope helper, input, widget or configuration bytes changed.

**Candidate 10 normal-capture field gate failed on September 17.** See Candidate 11 above for the
two logs, encoder crash, competing selector, slow fallback and cargo false positive. Its Gamescope
field gate remains unverified. Distro publication stays disabled.

Next step: Gabe tests packaged Candidate 11 in Gamescope and normal capture separately,
including fresh Game.log vehicle authority after seat/ship entry if authority remains inactive
aboard. Standing push authorization and best-effort advance context-capacity
notice remain in effect; no exact chat capacity meter is exposed.

## Alpha23 Candidate 9 lifecycle repair — September 16, 2026

Branch: `agent/alpha23-candidate9-portal-session-repair`. Upstream stays frozen at v0.1.47,
`e482c1ce3d461b390079486115293535be9b2ab7`. Baseline is packaged-verified Candidate 8,
remote implementation `275abd7e32bf596c555480c655b75661866ea381`, artifact `10412447176`,
native archive SHA-256 `8919ba757eee1be95e8adf2f7dfde7c658ec7060081842b75604a186ae94807f`.

Candidate 8 **failed the normal-launch field gate**. Gabe reported repeated KDE chooser openings
without persistent capture while OBS recorded correctly; Gamescope remained working. The log showed
portal readiness followed by 14 frame deadlines. The parent destroyed the approved stream after two
700 ms frame timeouts, and its session key also included an XID that changed during discovery.
The exact-XID fallback still reported BadMatch, so Candidate 8's MIT-SHM repair is not field verified.

Candidate 9 changes only the isolated normal-window parent, helper and preload. Capture approval
is bound to exact StarCitizen.exe PID plus process start ticks. Slow or repeated video frames and
XID rediscovery retain the approved session. The 700 ms caller deadline remains, but the outstanding
wire request stays occupied until its reply arrives; a recent late response can be consumed by the
next probe. Denial, initialization failure, helper death and track termination disable capture for
that game process. A new PID/start identity permits one new attempt. Bounded diagnostics distinguish
video readiness, draw, PNG encoding, blob reading and file writing, including a stalled async stage.
Repeated media time retains an identical frame token so Mining's distinct-frame guard remains.

Local lifecycle and actual-preload regression suites passed. Negative controls against the inherited
Candidate 7/8 parent reproduce both two-deadline destruction and XID-based helper recreation. The
actual preload test also identifies a stalled PNG callback and checks diagnostic-timer cleanup.
All six new CJS files and the staging script passed syntax checks; workflow YAML parsed and Git
whitespace checks passed. Implementation checkpoint: `b76b8bbd07d317523bebdfb6645746be5152bd4f`;
follow-up regression/evidence changes are recorded by the generated handoff's current commit.

Gabe explicitly approved pushing Candidate 9 on September 16, 2026 and renewed standing permission
for future ArchVerse pushes to `gbmccray32-boop/sc-overlay-for-Arch-Linux`. This resolves the earlier
automatic-review authorization block. Candidate, field-test and release gates still apply.
Remote implementation: `11cbca49ca9a92f17927463b544b0d0cf37b06de`; equivalent local source:
`b87e21580b84fceb8fca307320241f3f256ce79c`; matching tree:
`9603c3f30cbee4c028c1991ab03face24191e11e`. CI run `35043449672` passed upstream source,
protected-file staging, renderer/IPC, Linux bridge, startup, Candidate 6/8 regressions, Candidate 9
lifecycle and actual-preload regressions, real Electron secure-renderer checks, the retained
Candidate 7 insecure-origin negative control, config E2E and all five age-band negative controls.
CI run `35043449672` is **Automated verified**: every step passed, including the final complete widget
DOM suite with pair merges. Artifact `ArchVerse-Alpha23-Candidate9-field-test`, ID `10425834446`, is
**Packaged verified**. Downloaded ZIP SHA-256:
`d893bb744f3f8c7e0f1e116b76c92f240e16b764e71e4d4da9e949afe2942d49`.
Native archive SHA-256:
`fff229eac04f64de84fa51f8ffacd9f296131b13fbfbfa391a6f80398afb83b9`.
Independent verification checked ZIP integrity, native checksum, every one of the 1,639 regular-file
manifest entries, all 20 protected-file hashes, embedded version/provenance, exact Candidate 9 source
bytes and the executable x86_64 Electron binary. The downloaded app also matches every unchanged
Candidate 8 app file and symlink. Field status remains **Unverified**.
Gamescope direct PipeWire, capture.cjs, Mining admission/cadence, main input, sidecar and config
remain hash-identical to Candidate 8. A complete local app comparison also verified that only the
three intended capture files and two package-version manifests changed; all other app bytes and
symlinks are identical. This is a quarantined field candidate, not a
release. Next: normal Wine/XWayland field testing followed by Gamescope.
Live PipeWire delivery speed and exact-XID BadMatch remain unverified until fresh field evidence.

Gabe requested an advance conversation handoff notice at approximately 75% capacity. Give a best-effort
notice as the conversation grows and prepare an updated handoff before continuing a long phase.
No exact chat-capacity meter is available; do not promise an exact threshold or guaranteed timing.

## Alpha23 Candidate 8 repair checkpoint — September 15, 2026

Branch: `agent/alpha23-candidate8-renderer-x11-repair`. Upstream remains v0.1.47 at
`e482c1ce3d461b390079486115293535be9b2ab7`. Baseline is checksum-verified Candidate 7 artifact
`10379013592`, native archive SHA-256
`b3fc023c2f10cff8c1f66136b0240ea1e8cb11c937ce272a60c3e0a898aea67a`.

Candidate 7 **failed the normal-launch field gate**. Its renderer attempted getDisplayMedia from
an insecure data: document, so navigator.mediaDevices was undefined before any KDE portal request.
The exact-XID fallback also failed with MIT-SHM BadMatch. Spectacle remained around 2.5 seconds
per frame; confirmed normal-session signatures arrived about 10.7 seconds apart. Gamescope retained
58–65 ms steady capture and correct signature announcements. No KDE reinstall is supported by this
evidence. The supplied electron and sidecar logs have SHA-256
`4dad6e1f6ad2b32afcb187d589a207561c4e720277614acdfee8b8c2b94e5876` and
`1483bba409eaaf5e27432c2c934d97ab37d5c5f39b48861d3a9308e3d2525b72`, respectively.

Candidate 8 loads a trusted local file document without disabling web security. Its preload checks
the secure context and display-media capability before requesting capture. It also removes the
minimum frame-rate constraint, which the real Chromium test proved was rejected before selection.
A real packaged Electron
test reproduces the Candidate 7 failure as a negative control and requires Candidate 8 to reach the
display-media request handler. KDE's single user-approved PipeWire source is accepted even when its
name is generic; X11 continues to match the exact Star Citizen window.

Exact-XID capture retries once with ximagesrc remote=true after shared-memory failure. Each attempt
has a 750 ms deadline and SIGKILL timeout cleanup. The non-shared-memory mode is retained after
recovery; a failed episode backs off for 60 seconds and resets only for a new exact session binding.
Mining and Hauling share one single-flight capture lane. All protected Candidate 7 files other than
capture.cjs and the two normal-window helper files remain hash-identical, including direct Gamescope
PipeWire, Mining admission/confirmation/transport, main interaction, sidecar, and configuration.

Local recovery, source-contract, syntax, renderer/IPC, Linux bridge, startup, and Candidate 6
regressions passed. Full packaged Electron, upstream, configuration, age-band negative controls,
and staged widget integration passed in CI. The actual Chromium test caught and corrected the
invalid minimum frame-rate constraint; it now reproduces Candidate 7's failure and requires the
repaired renderer to reach the display-media handler. This does not prove KDE approval or live
PipeWire video delivery: those remain field gates.

| Item | Evidence |
| --- | --- |
| Remote implementation commit | `275abd7e32bf596c555480c655b75661866ea381` |
| Equivalent local implementation commit | `3218928` |
| Matching implementation tree | `d1b9de0a7d5530fac67e093756678ce060d4206b` |
| CI | **Automated verified** — run `35007279134`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate8-field-test`, ID `10412447176` |
| ZIP SHA-256 | `5ece8d5f56e68bbdd145a69c32b23a9a4006f4db254aca845471a0f38832d99b` |
| Native archive SHA-256 | `8919ba757eee1be95e8adf2f7dfde7c658ec7060081842b75604a186ae94807f` |
| Artifact integrity | **Packaged verified** — GitHub digest, ZIP integrity, inner checksum, complete archive manifest, embedded version, protected files, and Electron binary verified |
| Field status | **Unverified** — normal Wine/XWayland first, then Gamescope |

This is a quarantined field candidate, not a release. Next: Gabe tests normal Wine/XWayland
Mining recognition, widget delivery, announcements, and full-window Hauling display-info capture;
then confirms Gamescope remains regression-free. Supply complete electron.log and sidecar.log
from both sessions. Only after both pass may Debian/Fedora packaging and release work resume.

## Alpha23 Candidate 7 field-test checkpoint — September 15, 2026

Candidate 6 field evidence confirmed that the remaining problem was capture transport, not Mining
OCR, the exact Resource Signature catalog, widget delivery, or announcements. In the normal
Wine/XWayland session, Spectacle capture had a 2,557 ms median and Mining signature confirmation
had a 2,682 ms median. The persistent Electron window helper failed 270 times with exit code 3, so
the normal session never acquired its intended low-latency stream. Under Gamescope, direct
PipeWire capture had a 61 ms median and signature confirmation had a 262 ms median. The supplied
screenshots also showed `r_DisplayInfo` at the far right of the full Star Citizen window; the
previous center-display crop removed it before Hauling Location Sync OCR could inspect it.

Candidate 7 adds a separate native-Wayland capture helper. Electron 42.7.1 obtains a Star Citizen
window stream through the XDG ScreenCast portal and PipeWire, retaining Chromium's permitted
session state in a stable ArchVerse profile. The helper requests window sources only and runs
outside the overlay's main process. A denied or unavailable portal is attempted once per Star
Citizen process rather than generating repeated prompts or retries. On XWayland, an exact-XID
GStreamer `ximagesrc` one-frame capture is the next fallback. Normal Wayland capture therefore
prefers portal PipeWire, then exact XID, then Spectacle, then Electron monitor capture. Normal X11
prefers the persistent Electron X11 stream, exact XID, Electron monitor capture, then Spectacle.

Normal-session frames now have an explicit canvas model. A panoramic 6,270-by-2,160 stream maps
Mining to the calibrated 3,840-by-2,160 center display, while a single-display 3,840-by-2,160 game
window remains uncropped. Hauling Location Sync always receives the full Star Citizen window so
the top-right `r_DisplayInfo` text is preserved. The field-proven direct Gamescope PipeWire source,
fallback order, Mining cadence, exact catalog, distinct-frame guard, Game.log vehicle authority,
held-F interaction, Shift+F6 arrange mode, and hard click-through contracts remain unchanged.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate7-portal-window-capture` |
| Baseline artifact | Candidate 6 ID `10311759668`, native SHA-256 `119ad9d52f7fd4054918c0b664bfbfe28f8456adeb037ec7725d24c575200056` |
| Remote implementation commit | `eab42392488a25f43df2549d587e6ca9aa8a15d9` |
| Equivalent local implementation commit | `19b35bc3fb9e44fc33b8fc0c830da93c70840cd8` |
| Matching implementation tree | `5d94b88cab8b276171db7b5cf32feabd2c5b8249` — exact local/remote match |
| CI | **Automated verified** — run `34923404338`, every step passed |
| Artifact | `ArchVerse-Alpha23-Candidate7-field-test`, ID `10379013592` |
| Artifact ZIP SHA-256 | `c01b4f1c687afa0c8bcba1c65c42d8e19e222892dbeba882212c519c60198cce` |
| Native archive | `ArchVerse-Native-0.1.47-r31.alpha23.candidate7.tar.gz` |
| Native archive SHA-256 | `b3fc023c2f10cff8c1f66136b0240ea1e8cb11c937ce272a60c3e0a898aea67a` |
| Artifact integrity | **Packaged verified** — GitHub digest, ZIP integrity, inner checksum, complete package manifest, embedded version, and downloaded Candidate 7 regression all passed |
| Field status | **Unverified** — test normal Wine/XWayland first, then verify Gamescope remains regression-free |

Candidate 7 is a quarantined field candidate, not a release. In a normal KDE Wayland session, the
portal prompt must be limited to the Star Citizen window. Success reports
`portal-pipewire-window`; systems without portal capture may report `x11-window`. Mining should
recognize, commit, display, and announce signatures inside the requested 100–900 ms field target,
and Hauling Location Sync should read the far-right `r_DisplayInfo` text. The follow-up Gamescope
test must continue to report `gamescope-pipewire`. If both paths pass, the next checkpoint is
Debian- and Fedora-family packaging followed by the release gate.

## Alpha23 Candidate 6 implementation checkpoint — September 13, 2026

Candidate 5 field evidence separated the capture paths. Direct Gamescope PipeWire recognized,
committed, displayed, and announced Mining signatures at the intended fast rate. In a regular
Wine/XWayland launch, Electron recognized 40 valid signatures but every result remained
`pending-distinct-frame`: the fixed 1,600 ms confirmation window expired before Spectacle could
produce a distinct second frame. The sidecar, widget, and announcer were healthy.

Candidate 6 retains the mandatory distinct-frame false-positive guard and gives each observation
its own bounded deadline. Direct `gamescope-pipewire` and the isolated persistent window stream
remain at 1,600 ms. Screenshot fallbacks derive their window from measured capture time, capped at
15 seconds; the regression reproduces the observed 10.7-second gap and confirms only a matching
value at the same location on a distinct frame. The regular Wine/XWayland helper now binds to the
active game's exact X11 window ID, reports bounded source inventory and exit details, and retries
every 10 seconds. Non-Gamescope Spectacle no longer invokes main-process Electron source discovery
as a periodic upgrade probe. The direct Gamescope PipeWire implementation is byte-identical to
Candidate 5.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate6-normal-capture-confirmation` |
| Baseline artifact | Candidate 5 ID `10303164663`, native SHA-256 `aa14e095aae1b864cd6f18c72837db800c7955802cdfd1a1d6266743d8b5c380` |
| Application source commit | `881ef37b4317df4d47e8f9d20d2cd1c647e2982b` |
| Workflow-triggering commit | `15777ea63604ea3df21c73603d2dfb8af1e34269` |
| CI | **Automated verified** — run `34739798304`, every step passed |
| Artifact | `ArchVerse-Alpha23-Candidate6-field-test`, ID `10311759668` |
| Artifact ZIP SHA-256 | `ccb6ccfc224d1b0b141eab5cbb393299983fc8935d6723cfc29728844f6ecd55` |
| Native archive | `ArchVerse-Native-0.1.47-r31.alpha23.candidate6.tar.gz` |
| Native archive SHA-256 | `119ad9d52f7fd4054918c0b664bfbfe28f8456adeb037ec7725d24c575200056` |
| Artifact integrity | **Packaged verified** — GitHub digest, ZIP checksum, inner checksum, complete manifest, embedded version/provenance, and Candidate 6 regression passed after download |
| Field status | **Unverified** — Candidate 6 requires a regular non-Gamescope Mining test, then a Gamescope regression test |

Workflow run `34739715484` failed only because the Candidate 5 self-test correctly rejected the
new Candidate 6 version after staging. Candidate 5's version-specific gate now runs against the
Candidate 5 baseline before staging; run `34739798304` passed the corrected workflow. Candidate 6
is a quarantined field candidate, not a release.

## Alpha23 Candidate 5 implementation checkpoint — September 12, 2026

Candidate 5 advances the packaged Candidate 4 Linux runtime to the developer's latest tagged
release, `v0.1.47` at `e482c1ce3d461b390079486115293535be9b2ab7`. The release's exact
changelog, package version, full-precision Verse Finder age timestamp, strengthened age-band widget
assertions, and five negative controls are now present. This closes the previously documented
clock-dependent age fixture exception.

The developer's REP-page synchronization was already present in the Alpha23 server and data but
had remained visibly disabled because its capture consumer had not been reconciled with Linux.
Candidate 5 enables it as an opt-in feature. Linux REP scanning uses its own adjustable crop and the
existing isolated auxiliary OCR worker. It sends crop-local text to `/api/rep-read`, reads the REP
progress bars from the same crop's pixels, and returns those results through `/api/rep-scan`.
Game.log vehicle authority still defers every auxiliary OCR lane while Mining is active, so REP
cannot consume the latency-critical Resource Signature worker or alter Mining cadence.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate5-upstream-0147` |
| Upstream target | Developer tag `v0.1.47`, commit `e482c1ce3d461b390079486115293535be9b2ab7` |
| Baseline artifact | Candidate 4 ID `10290507069`, native SHA-256 `c8b11e378016e123ae0c59252b33ebb3f19781cb8a756caff7ebbdf87e82e82d` |
| Local source tests | **Automated verified** — TypeScript; REP-page and REP re-baseline suites; exact upstream file hashes |
| Local packaged tests | **Automated verified** — full Electron/server syntax; renderer/IPC audit; Linux bridge; packaged main startup; Candidate 5 contract and bar-reader test; real-sidecar REP-route and Mining-parser test |
| Remote packaged source | `0745c087d27efc656e2318d6ddb578d8fc650385` |
| Equivalent local checkpoint | `0d3862d24e2a7b3413893057677b975b951157ea` |
| Matching source tree | `ce9d7af278e44630b7ecd07ff6a80a978592e8dc` — exact local/remote match |
| CI | **Automated verified** — run `34712283860`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate5-field-test`, ID `10303164663` |
| Artifact ZIP SHA-256 | `ca3a99ac83528e5eee3853a47faee389b4b2b40e90e330adcb9bd01612822960` |
| Native archive | `ArchVerse-Native-0.1.47-r31.alpha23.candidate5.tar.gz` |
| Native archive SHA-256 | `aa14e095aae1b864cd6f18c72837db800c7955802cdfd1a1d6266743d8b5c380` |
| Artifact integrity | **Packaged verified** — GitHub digest, ZIP integrity, inner checksum, all 1,629 manifest entries, embedded version/provenance, Candidate 5 contract, REP routes, and Mining parser verified after download |
| Field status | **Field tested; candidate failed normal-session Mining gate** — Gamescope was fast and complete; regular Wine/XWayland recognized signatures but never committed them |

Candidate 4's `250/350/500 ms` distinct-frame Mining cadence, exact RS catalog, persistent
Wine/XWayland stream, direct Gamescope PipeWire path, Game.log session authority, held-F input,
Shift+F6 arrange mode, hard click-through, focus ownership, and one-cursor behavior are protected by
source markers and Candidate 4 hashes. Workflow run `34712129232` failed only because its test
harness launched the bundled Electron binary without `--no-sandbox`; all earlier gates passed. The
replacement wrapper added that test-only switch without changing the candidate, and final run
`34712283860` passed every gate. Next: Gabe field-tests Candidate 5 in a normal non-Gamescope
session and then Gamescope, verifies Mining first, then tests the opt-in REP-page scan while on foot.

## Alpha23 Candidate 4 field-test checkpoint — September 12, 2026

Candidate 3 was field-tested in a normal Lug-Helper Wine/XWayland launch without Gamescope. Mining
worked for several signatures, focus-latch recovery held, and OCR itself remained fast: 399 Mining
reads had a 26 ms median and 55 ms p95. The complete Electron log nevertheless showed two defects:

- Repeated `desktopCapturer.getSources()` calls intermittently blocked Electron's main process for
  7–10 seconds. The Candidate 3 JavaScript deadline could not fire because the compositor call
  blocked the same event loop that owned the timer.
- OCR text `DISABLED IN ATMOSPHERE | 60 30 100 | A | 87 | 188` was joined across plain whitespace
  into a false `30100` signature and announced.

Candidate 4 starts from the exact checksum-verified Candidate 3 artifact. A separate Electron
helper now discovers the exact `Star Citizen` Wine/XWayland source and retains one MediaStream.
Source discovery, PNG encoding, stale-frame detection, and stream restart run outside the ArchVerse
main process. The main process waits at most 700 ms for a requested frame. On KDE Wayland, a warming
or unhealthy stream falls back to the asynchronous Spectacle path before trying main-process
Electron monitor capture. A healthy helper is reprobed every second and promoted without an app
restart. The helper disables hardware acceleration and is bound to the exact game PID plus `/proc`
start ticks. Direct Gamescope PipeWire and its existing fallback order are unchanged.

Mining acquisition now targets 500 ms. A first exact-catalog result narrows the crop and schedules
a 250 ms confirmation pass. The same value must appear near the same screen location on a distinct
source frame before `commitMining` becomes true. Confirmed tracking targets 350 ms. Plain whitespace
cannot group digits inside one OCR line; comma, dot, apostrophe, colon, compact digits, and an exact
adjacent `1–3 digits + 3 digits` OCR-box split remain supported. Capture method and elapsed capture
time are now included in each Mining heartbeat.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate4-persistent-window-mining` |
| Baseline artifact | Candidate 3 ID `10182826990`, native SHA-256 `1df91bcf116816f7fcff43d25dd317b87ffee0bec7c590742659d8cbb870de3f` |
| Remote packaged source | `e8c7946bb04c828dbb29f615087728d571f5690b` |
| Equivalent local checkpoint | `b25ce1545910dc06497d9cc8643c5590d27f6752` |
| Matching source tree | `0cba444edc627b657da9cd6de0fc9eaa212bf766` |
| CI | **Automated verified** — run `34670191831`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate4-field-test`, ID `10290507069` |
| Artifact ZIP SHA-256 | `2f3aaa8f2352e0ff2e74e1a67bf23ad98b6dcf4914956f0ed0d4e34bc9d4839c` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate4.tar.gz` |
| Native archive SHA-256 | `c8b11e378016e123ae0c59252b33ebb3f19781cb8a756caff7ebbdf87e82e82d` |
| Artifact integrity | **Packaged verified** — GitHub digest, inner checksum, full manifest, embedded version/provenance, parser, confirmation, capture-contract, and real-sidecar tests passed |
| Field status | **Unverified** — persistent Wine/XWayland MediaStream behavior requires Gabe's in-game test |

Next step: field-test Candidate 4 first in the same normal non-Gamescope Lug-Helper session used for
Candidate 3. Confirm `[window-stream] ready`, capture promotion to
`electron-star-citizen-window-stream`, 250/350/500 ms Mining cadence, and
`pending-distinct-frame` before the first commit of each new value. Then test Gamescope and confirm
`gamescope-pipewire` remains authoritative. Candidate 8k remains the rollback build.

## Alpha23 Candidate 3 implementation checkpoint — September 11, 2026

Candidate 2 is now field tested. Mining recognized valid signatures and the narrow configured
Resource Signature region was intentional. The supplied Electron log also showed two defects:

- An F-created interaction latch survived after Hub/Settings use because the shell retained stale
  modal ownership. Empty-canvas clicks were ignored, and F, Shift+F6, and Alt-Tab did not reliably
  return click-through until another external window won focus.
- In a normal non-Gamescope KDE Wayland session, exact Star Citizen window capture intermittently
  consumed 8.1–8.6 seconds even though Mining OCR normally needed only tens to hundreds of
  milliseconds. Fast operation returning after focus transitions was correlation, not an OCR wake
  requirement. Direct Gamescope PipeWire did not show this failure.

Candidate 3 is implemented locally from the checksum-pinned Candidate 2 artifact. An empty-canvas
mouse-down now clears stale shell modal ownership and releases an F latch when no real drag, edit,
or arrange mode owns input. Global arrange and Mining-only interaction explicitly supersede an F
latch. A non-Gamescope Star Citizen window request is single-flight and deadline-bounded at 500 ms;
after a timeout, a five-second circuit breaker lets Electron monitor capture proceed. A true
Gamescope session and direct persistent Gamescope PipeWire retain their prior behavior.

Mining acquisition adds a 48x24-pixel margin at 3840x2160 around the saved region to tolerate HUD
drift between ship and planet-side layouts. A locked signature remains clamped inside the exact
saved region. Complete metre and kilometre tokens are removed before RS catalog matching so the
margin cannot admit a nearby target distance as a signature.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate3-focus-capture-hardening` |
| Baseline artifact | Candidate 2 ID `10136153055`, native SHA-256 `23a6a5723db22f35004f75aff357a8abdb836518fd06c596a123edec4afe4f17` |
| Local automated checks | Syntax for all packaged Electron JS; Alpha23 renderer and Linux bridge audits; packaged main startup; Candidate 8k supervision; Candidate 8j 120-request real-sidecar soak; Candidate 3 focus/capture/parser regression |
| Local config E2E | Blocked by the workspace runtime: `os.networkInterfaces()` returned `uv_interface_addresses` error; unchanged server code, to be rerun in GitHub CI |
| Remote packaged source | `8ddeadc9c602c8db0cd82e535f564e9288aa15f8` |
| CI | Run `34556433971`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate3-field-test`, ID `10182826990` |
| Artifact ZIP SHA-256 | `d77fc5d54c793c15d2b22b54866f9f4b26e28a0135d53e7db96a54bef58ae233` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate3.tar.gz` |
| Native archive SHA-256 | `1df91bcf116816f7fcff43d25dd317b87ffee0bec7c590742659d8cbb870de3f` |
| Field status | **Field tested; candidate failed overall** — normal Wine/XWayland capture repeatedly stalled for 7–10 seconds and one whitespace-joined false `30100` was announced |

Candidate 3 is automated, packaged, and field tested, but it did not pass the field gate. The downloaded artifact matched GitHub's digest,
the inner archive checksum passed, the embedded package and provenance versions matched, and the
complete package manifest verified. Candidate 4 supersedes it for the next field test. Candidate
8k remains the rollback build.

## Overnight checkpoint — September 8, 2026 UTC

### September 9 renderer and package reconstruction

Recovered remote checkpoint `07477ec` after the workspace reverted to Candidate 8h. The interrupted
uncommitted renderer changes were not present and have been reconstructed from frozen upstream.
The canvas build now retains Linux OCR-region editing, dynamic interaction regions, the Candidate
8k first-F DOM classifier, and forced region refresh. Log and Verse Finder lifecycle controls are
ported at explicit Candidate 8k shell seams. The staging scripts preserve the checksum-pinned 8k
Mining parser, vehicle authority, inline commit, and one-shot durable Location Sync alongside the
new backend. Capture and its Mining/PipeWire/transport/watchdog helpers are hash-checked unchanged.

Local evidence: production server build, TypeScript check, staging anchors, and Candidate 8k
supervision regression pass. The workflow now tests the staged Alpha23 sidecar with the sustained
Mining transport regression and canonical-config E2E. Those new CI results are pending. No field
package has been approved or delivered. Remaining gates include complete shell/IPC/renderer runtime
checks, reputation OCR integration, the upstream age-band test exception, and downloadable packaging.
Gabe authorized continued work through field-test readiness; no additional go-ahead is needed.

### Alpha23 Candidate 2 field-test checkpoint — September 10, 2026

Candidate 1 received an in-game diagnostic session. Its integrated Mining parser, exact catalog,
Game.log vehicle authority, and asynchronous commit path worked: the supplied logs contain accepted
signatures from `2,000` through `17,200`. The regular non-Gamescope session exposed a capture
regression, however. It cached `spectacle-wayland`; each frame took about three seconds, Mining
opportunities stretched beyond the configured rate, and seven one-shot Location Sync reads failed.
After Star Citizen restarted under Gamescope, direct `gamescope-pipewire` capture recovered and two
Location Sync reads resolved Crusader successfully. Candidate 1 is therefore field-tested but not
approved as a release.

Candidate 2 repairs only that failure group. On KDE Wayland the capture order is now direct
Gamescope PipeWire, exact Star Citizen window, Electron monitor, then Spectacle. A cached Spectacle
fallback periodically probes for a faster source so a game surface that appears after launch can be
adopted without restarting ArchVerse. An exact non-Gamescope Star Citizen window is treated as the
complete game canvas instead of receiving a panoramic Gamescope crop. Mining targets 600ms while
locked and 800ms during in-vehicle acquisition; the latest-frame scheduler remains single-flight.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate2-default-capture-latency` |
| Remote packaged source commit | `fc988a7d30e3dc87b4c408f761d585bd203fb410` |
| Equivalent local commit | `c494da0559b5029a6b6e582057f3849f86b4b2bd` |
| Matching source tree | `9bde588e0cae51d937955e75acf68f0dd11d77ca` |
| Candidate workflow | Run `34435600250`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate2-field-test`, ID `10136153055` |
| Artifact ZIP SHA-256 | `abcfb29abecd949571309b763a57ab24b0877a951361755720af08794ee8d6c9` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate2.tar.gz` |
| Native archive SHA-256 | `23a6a5723db22f35004f75aff357a8abdb836518fd06c596a123edec4afe4f17` |
| Field status | Field tested; Mining generally worked, but focus trapping and intermittent 8-second normal-session capture stalls failed the candidate |

Automated and packaged verification passed staging, complete Electron syntax checks, Alpha23
renderer and bridge audits, packaged main startup, Candidate 8k supervision, the Candidate 8j
120-request real-sidecar soak, Candidate 2 capture/cadence assertions, canonical config E2E, all
pairwise widget layouts, the outer artifact digest, the inner archive checksum, and the complete
package manifest.

Next step: test Candidate 2 in a normal non-Gamescope launch first. Record the selected capture
method, verify r_DisplayInfo Location Sync and RS recognition without F/Alt-Tab/config focus, and
measure `capture`, OCR, and heartbeat timings. Then repeat under Gamescope and confirm
`gamescope-pipewire` remains authoritative. Candidate 8k remains the rollback build. Candidate 2 is
a quarantined field candidate, not a release.

### Alpha23 Candidate 1 field-test checkpoint — September 9, 2026

Alpha23 Candidate 1 is automated and packaged verified. It remains unverified in game.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-upstream-fbe3fae-integration` |
| Packaged source commit | `de1a1f1cd97d8a4e39a5616cb4544769032b7fb9` |
| Upstream target | `fbe3faedb38c82d11650ef6424e4037a9806cf95` (`0.1.46`) |
| Baseline | Candidate 8k artifact `10024814784`, SHA-256 verified |
| Full integration audit | Run `34363998487`, all steps passed |
| Candidate workflow | Run `34363998224`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate1-field-test`, ID `10109267555` |
| Artifact ZIP SHA-256 | `370574dbce02ffe666f1e70aebc1202680ac1437d4c7033ee52662c2791e4404` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate1.tar.gz` |
| Native archive SHA-256 | `49e142e86ca6d32d52557f78a73c0300a6037ce41a2f343bce94df08a787d15b` |

Automated gates cover upstream source and widget suites, the built sidecar, canonical config API,
Candidate 8k supervision, the 120-request Mining transport soak, all packaged renderer scripts and
IPC registrations, first-F classification, forced region refresh, capture-module evaluation,
packaged main startup, and full pairwise widget layouts. Independent download verification matched
the GitHub artifact digest, native checksum, complete package manifest, embedded version, and the
four protected Candidate 8k Mining file hashes.

Candidate 1 ports Log, Verse Finder, the expanded Hauling renderer, the upstream 0.1.46 backend,
and the newer canvas architecture. It retains Candidate 8k capture, result transport, Game.log
vehicle authority, direct Gamescope PipeWire stream, sidecar supervision, and one-shot Location
Sync. Reputation screen scanning is visibly disabled in this candidate because the upstream
capture consumer has not yet been reconciled with Linux Mining's exclusive OCR scheduler.

Next step: Gabe field-tests Candidate 1 using `FIELD-TEST.md` and supplies complete `electron.log`
and `sidecar.log`. Candidate 8k remains the rollback build. Do not approve a release from this
checkpoint; Candidate 1 is a quarantined field candidate.

### Resumed checkpoint

Gabe authorized GitHub CI execution of the loopback regression. The dedicated workflow
`Alpha23 Linux Config Regression` passed at remote commit
`d7790a76847605811ad176c4026f9019080745ab`: run `34291326179`, job `102278286861`.
It built the merged sidecar and passed the real config API assertions for canonical directory
precedence, locked F/hold/Shift+F6 controls, Mining/Balanced/Lightweight profiles, disk persistence,
and bidirectional Resource Signature region updates. The earlier local approval cancellation is
superseded for this validation by the authorized CI result. The full integration audit also started
as run `34291326114`; its result has not yet been checked. Next development group: renderer/preload
reconstruction, retaining the Candidate 8k packaged Mining baseline. No Alpha23 field package yet.

The saved branch was recovered from GitHub after the workspace reopened on Candidate 8h.
Audit #8 for `8ebdecd82c9a0c5aaca66a225fbafdb8fc5bce24` is now verified successful:
run `34183388450`, job `101926835112`. All configured steps passed, including the merged
server build, pinned Candidate 8k provenance, and Candidate 8k baseline checks. The existing
upstream age-band assertion exception remains; this is not an unconditional full-suite pass.

The merged server also built locally after dependency installation. Added
`tools/archverse-config-e2e.mjs` to exercise the real bundled config API with isolated canonical
and conflicting legacy directories. Local execution was stopped by a network-approval cancellation;
its runtime assertions are unverified. Do not treat the new test as passed or silently bypass the
approval. Next: resolve the loopback-test execution approval, run this regression, then continue
renderer/preload reconstruction. No Alpha23 field package exists yet.

Gabe requested a pause and a durable handoff for tomorrow. No further field test is requested tonight.

- Resume branch: `agent/alpha23-upstream-fbe3fae-integration`.
- Last pushed implementation: `8ebdecd82c9a0c5aaca66a225fbafdb8fc5bce24`.
- Equivalent local implementation: `29baad4a7600d96c6335511d51a29565be4ef952`.
- Matching implementation tree: `e72198cb1160cb71b8d4ae5bbc1714ceefe7c38b`.
- Local Git and remote commit IDs differ because the authorized GitHub API published equivalent
  trees. Do not force-push local history over remote history.
- Phase 1 imports upstream 0.1.46 backend, data, tests, and tools. Electron and renderer source
  trees were retained from the pre-merge branch. This is not a reconstructed Candidate 8k package;
  package-only Mining fixes must still be preserved when assembling Alpha23.
- Audit #7, run `34182810868`, job `101925141159`, failed during the merged server build:
  `canonical Linux config root: expected exactly one anchor, found 0`.
- Upstream moved config declarations into `src/server-config.ts`. The last implementation adds
  `applyArchVerseServerConfigSourcePatches` and its esbuild loader, leaving runtime patches in
  `applyArchVerseServerSourcePatches`. Local syntax and patch-anchor checks passed.
- The replacement CI result for `8ebdecd` has NOT been checked. Do not call it CI-green or assume
  that an Alpha23 archive exists. No Alpha23 field candidate has been delivered.
- Audit #7 passed the configured upstream and merged-source tests before the build failure.
  The upstream widget run reported 53 suites and 1,390 assertions with one failure:
  `the band really matches the age it prints`, expected `stale`, actual `ancient`.
  The workflow currently allows this one named failure with matching suite/assertion totals.
  The earlier explanation that a fixture expired is an inference, not a completed root-cause test.
  Review the age-band calculation and test before treating that exception as permanent.
- Full config/runtime regression coverage for the split patch remains pending; the prior promise
  of tests for both source layouts was not implemented. Only current-source anchor checks ran locally.
- Candidate 8k remains the packaged, field-reported working Mining/base fallback. GPU-crash
  investigation is deferred at Gabe's request; do not change GPU settings or launcher scripts.

### First action tomorrow

Inspect the Actions run for implementation commit `8ebdecd82c9a0c5aaca66a225fbafdb8fc5bce24`.
Read its failed step and complete relevant logs if it failed. Finish the split-config build and
regression gates before porting the renderer/preload group. Then reconstruct and test a package
from the pinned Candidate 8k artifact, preserving its Mining transport, capture, and supervision
contracts. Keep the upstream target frozen at `fbe3faedb38c82d11650ef6424e4037a9806cf95`.

This checkpoint is documentation-only. Use `[skip ci]` when publishing it so it does not start
another audit merely to save the session. Work resumes when Gabe returns; no background development
or overnight monitoring has been scheduled.

## Current state — September 8, 2026

| Item | Current value |
| --- | --- |
| Repository | `https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux` |
| Current packaged candidate | `0.1.44-r31.alpha22.candidate8k` |
| Candidate branch | `agent/alpha22-candidate8k-sidecar-supervision-repair` |
| Packaged source commit (remote) | `233c5a47c0b6b1c23fbc2a9951f1675f3cfc8bd8` |
| Equivalent local checkpoint | `3e24e41228a9619310642a16b4f84e1997a31c5e` |
| Remote/local tree | `838e0157d99f466ac909949491441765fe7eef1a` — exact match, including executable modes |
| CI workflow | `Alpha22 Candidate 8k Sidecar Supervision Repair` |
| CI result | **Automated verified** — final branch-head run `34138147146` succeeded |
| Artifact ID | `10024814784` |
| GitHub artifact | `ArchVerse-0.1.44-Alpha22-Candidate8k` |
| Artifact ZIP SHA-256 | `f19954bb2b6678c7195d7a50dd5cddcde4c6c2996f0baba482fc34dbce9277f5` |
| Native archive | `ArchVerse-Native-0.1.44-r31.alpha22.candidate8k.tar.gz` |
| Native archive SHA-256 | `56f57fa9ce688f0488b461882741d3c4bac5ac7beaba4034706ea67488302f17` |
| Artifact integrity | **Packaged verified** — downloaded artifact, GitHub digest, ZIP integrity, inner checksum, embedded version, syntax, Candidate 8j baseline/soak tests, and Candidate 8k supervision tests passed |
| Candidate 8i in-game status | **Field tested, failed** — September 6 log contains 331 Mining localhost timeouts and about 82.6 minutes of failure windows in a 148.2-minute run; OCR and direct PipeWire remain fast when the route is healthy |
| Latest field-tested candidate | Candidate 8k; Mining and base operation reported working by Gabe |
| Candidate 8j in-game status | **Mining field verified; candidate failed overall** — Mining recognized and committed several signatures at the intended 1200/900 ms rates, but the watchdog caused two unnecessary sidecar restarts and eventually exhausted the ordinary crash budget |
| Candidate 8k in-game status | **Field verified for Mining and base operation** — Gabe reported both working well after the long-session test. The separate display freeze is being handled as a KWin/AMDGPU/Overdrive and recurring `kscreen-doctor` system issue; no ArchVerse change is justified by that evidence. |
| Active integration branch | `agent/alpha23-upstream-fbe3fae-integration` |
| Frozen upstream target | `fbe3faedb38c82d11650ef6424e4037a9806cf95`, upstream version `0.1.46` |
| Upstream delta | 285 non-merge commits after `v0.1.44`; 12 commits after the prior frozen `aecabc2c` target |
| Immediate next step | Validate the Phase 1 upstream `0.1.46` backend/data source merge in CI, then reconstruct the renderer and Electron IPC group before staging Alpha 23 Candidate 1 from the exact Candidate 8k package. |

The branch `agent/archverse-continuity-handoff` contains continuity infrastructure only and starts
from Candidate 8f. Candidate 8k branches from Candidate 8j and rebuilds from its exact
checksum-verified artifact produced by run `34043540649`.

## What Candidate 8f changes

Candidate 8f starts from the exact verified Candidate 8e artifact at commit
`92ccdc08fc6d0b936f0ccb1a234e046b205f5923`. Its build verifies the pinned Candidate 8e run,
artifact identity, digest, head commit, and tarball checksum before applying the Candidate 8f patch.

Candidate 8f changes Mining authority as follows:

- Game.log ship-channel membership and granted vehicle-control tokens establish vehicle presence.
- Vehicle-control requests alone do not establish presence.
- Vehicle-control release and ship-channel departure remove the corresponding presence state.
- Mining acquisition uses a 1,200 ms vehicle cadence.
- A Mining result requires both active vehicle presence and a current valid RS total.
- Accepted results identify their method as `gamelog-vehicle+rs`.
- The radar/Scan Mode detector is not part of the Mining authority path.
- The older `pipewire-radar+rs`, radar latch, and radar-led numeric fallback paths are removed.
- Direct Gamescope PipeWire remains the preferred frame source. Removing radar authority does not
  remove the PipeWire capture contract.

The Candidate 8f self-test exercises on-foot startup, ship enter/leave, vehicle request, vehicle
grant, vehicle release, theme separation, and current Mining signature catalog controls.

## Latest field evidence

The latest uploaded runtime evidence is `archverse-candidate8i-electron.log`, created September 6,
2026. It is a 148.2-minute Candidate 8i field run.

Observed Candidate 8i behavior:

- Direct Gamescope PipeWire remains the capture source. Broad-crop OCR normally completes in about
  247–258 ms, and locked-crop OCR normally completes in about 36–67 ms.
- The repaired catalog and parser commit real `2000`, `3400`, `3900`, `7200`, `10000`, and `14000`
  values. The persistent PipeWire producer and dedicated Mining OCR worker are effective.
- The log contains 331 Mining localhost timeout lines and 20 failure runs. The interval from each
  first failure to recovery totals about 82.6 minutes, or 55.7% of the 148.2-minute session.
- Candidate 8i introduced a persistent vehicle-presence SSE connection on the same global localhost
  fetch stack used by Mining commit traffic. The stream ends at roughly five-minute intervals;
  stream reconnect failures and Mining POST failures correlate in the field log.
- The exact low-level failure inside the shared local transport was not proven without a matching
  sidecar log, but the Candidate 8i regression is isolated above PipeWire and OCR. The Candidate 8i
  automated test mocked the SSE instead of running it concurrently with sustained real-sidecar
  POST traffic, so the test could not reproduce this failure class.
- Focus is not the authority or the root cause. Mining recovered at `04:07:00Z` while ArchVerse
  still owned focus; Star Citizen regained focus at `04:07:13Z`. Another outage continued until
  `05:06:20Z` even though Star Citizen regained focus at `04:54:48Z`.
- Pressing `F`, showing the scan area, or Alt-Tabbing can coincide with a recovery or crop refresh,
  but none is a valid Mining wake-up action. Game.log vehicle presence plus an exact current RS
  value remain the only Mining authority.
- Candidate 8i's message that a “bounded OCR attempt failed” combines OCR, local parsing, and the
  awaited sidecar request. In the failing windows OCR usually completed before the 8-second
  `/api/screen-read` timeout, so the message attributed a transport failure to OCR.

Candidate 8i does not pass the Mining field gate. Candidate 8j preserves its fast PipeWire/OCR work
and removes the shared-SSE and awaited-sidecar failure paths.

## What Candidate 8g repairs

Candidate 8g starts from the exact Candidate 8f artifact and makes the current RS catalog
authoritative from OCR parsing through Mining state:

- Restores the original `2000`-step debris/harvest vocabulary through 12 panels (`24000`).
- Removes the stale `30000` OCR parser ceiling and accepts exact catalog values through `120000`.
- Removes the stale `25800` tracker ceiling after exact current-catalog admission.
- Retains colliding catalog possibilities instead of guessing one resource.
- Commits a valid Linux Mining read inside the successful `/api/screen-read` request, using the
  sidecar's authoritative Game.log vehicle state.
- Keeps the older `/api/mining/scan` path as a compatibility fallback, but it is no longer the
  normal Linux commit path.
- Keeps direct Gamescope PipeWire, held-`F`, click-through, one cursor, OCR isolation, and all other
  frozen Linux contracts unchanged.

The Candidate 8g regression test starts the real sidecar and proves that on-foot `2000` remains
blocked, while in-vehicle `2000`, `32000`, and `120000` parse and commit. It also rejects non-catalog
values and checks the Candidate 8f vehicle/capture contract markers.

## What Candidate 8h repairs

Candidate 8h starts from the exact Candidate 8g artifact from run `33833003367`, artifact
`9922339513`, outer digest
`c786d3a6b5c636bbe80cc774ccc58be529a7f9add36ee3d70a09749dbd37edb3`, and native archive
checksum `37846d4e330f7f248be3acd518a0c388537cef0e9f79a1b186b945eb5529584e`.

It changes only the diagnosed Mining liveness and false-positive paths:

- A failed `/api/vehicle-presence` request retains the last confirmed Game.log state and uses
  bounded retry instead of turning an IPC timeout into a false vehicle departure.
- Every Mining `/api/screen-read` response returns the sidecar's current Game.log authority state.
  Capture reconciles it immediately, and the sidecar still rechecks that state before every inline
  commit, so on-foot reads remain fail-closed.
- Repeated auxiliary OCR failures use a 15–120 second exponential backoff instead of launching an
  8–9 second RapidOCR/Tesseract fallback on every scanner tick.
- Coordinate-shaped decimal groups are rejected before RS parsing, including the exact Candidate
  8g field strings. A standalone `48.000` signature and a valid `3,400 | 90° STRONG` read remain
  accepted.
- The legacy fallback diagnostic now logs `vehicle=0` only when vehicle authority is actually
  inactive; a successfully handled inline commit no longer falls into that rejection branch.
- The package description and Linux porting contract now identify Game.log vehicle presence plus an
  exact current-catalog RS value as Mining authority. Radar and focus remain observational only.

The Candidate 8h self-test exercises transient IPC failure, retry backoff, inline departure
reconciliation, on-foot refusal, in-vehicle acceptance, all observed coordinate false positives,
and the preserved dot-grouped/strength-text cases against the real sidecar. CI also reruns the
Candidate 8g regression before applying Candidate 8h and checks the direct Gamescope PipeWire,
held-`F`, click-through, one-cursor, session-binding, and OCR-isolation markers.

## What Candidate 8i repairs

Candidate 8i starts from the exact Candidate 8h artifact from run `33945862290`, artifact
`9963305922`, outer digest
`0f7b66b319729f91d9bab6eaed454b598661f9c8164a6c14dbfe95a7d539b48c`, and native archive
checksum `763da3b0b460de8becda1f16f1a082824c0640326cb23760d1d55a5b2b6cfada`.

It restores the developer's warm-reader execution model and adds Linux-specific controls:

- One persistent `gst-launch-1.0` pipeline subscribes directly to the exact Gamescope PipeWire node
  at three frames per second. Its leaky one-frame queue and four-file ring keep only recent frames.
- GStreamer crops the desktop panorama to the calibrated Star Citizen display. Electron retains the
  dynamic user-configured Resource Signature crop so region changes do not restart the stream.
- Mining owns one restartable RapidOCR worker with a 900 ms request deadline and a bounded 600 ms
  Tesseract fallback. Every auxiliary reader shares one separate background worker.
- While Game.log says the player is in a ship or ground vehicle, auxiliary OCR is suspended. It
  cannot compete with Mining even before the first signature is recognized.
- A self-scheduler starts the next read from the prior tick's start time. A slow tick cannot overlap
  the next tick or add a second full polling delay. Stale frames and stalled OCR workers are dropped.
- Vehicle presence is pushed over one local server-sent-event stream. A bootstrap GET remains for
  startup, while disconnects retain the last Game.log-confirmed state until the sidecar reconciles a
  real vehicle exit.
- Numeric admission now rejects distress/wreckage, elevator/hangar, cargo/storage, identifier, and
  coordinate contexts. Ambiguous lines containing more than one distinct signature are rejected.
- A structurally clear value outside the exact current RS catalog is logged as an unclassified
  observation but never committed. Exact catalog membership remains authoritative.
- Heartbeat telemetry includes capture time, frame age, crop/OCR time, queue depth, and worker
  restart counts so any remaining field delay has a measurable stage.

The Candidate 8i regression launches the actual packaged sidecar from its packaged server directory,
proving it loads its own Mining data. It verifies latest-frame selection, timeout-driven worker
replacement, pushed vehicle transitions, on-foot refusal, in-vehicle `2000` acceptance, safe
preservation of `26000` and `5959`, and rejection of the exact false contexts from the field log.

## What Candidate 8j repairs

Candidate 8j starts from the exact Candidate 8i artifact from run `33995752456`, artifact
`9978005577`, outer digest
`17726d343fd388e387a131640d2a9af883e66b2ddd51e643048ade59a1418dec`, and native archive
checksum `0fe867952ecad62060eb39b835e13a086076598eba70a654566e021768d436ec`.

It keeps Candidate 8i's fast capture and OCR path, then removes the field-proven transport hazard:

- Vehicle presence returns to bounded cached GET requests over independent loopback HTTP
  transactions. Candidate 8j removes the experimental vehicle-presence SSE client and endpoint.
- Mining classifies the OCR lines locally with the same exact catalog and false-context rules used
  by the sidecar. A valid read locks the crop and selects the 900 ms cadence immediately.
- The authoritative `/api/screen-read` commit is asynchronous. One request may run and one newest
  result may wait; a 650 ms failure retains the latest read with bounded retry instead of blocking
  the capture/OCR tick for eight seconds.
- The sidecar still repeats parsing and rechecks its current Game.log vehicle authority before
  every state change. A stale in-vehicle capture state cannot authorize an on-foot commit.
- Mining uses exact Linux rates: 1,200 ms for in-vehicle acquisition and 900 ms after a valid
  signature. Small timing changes no longer cause 909/913/941 ms scheduler flapping.
- OCR failures and commit-transport failures have separate log prefixes. A compact 15-second
  Mining heartbeat is written directly to `electron.log`, so it remains visible when the sidecar
  cannot receive diagnostics.
- Repeated Mining transport failures trigger a separate short `/api/instance` health probe. Only
  three consecutive failures of that independent probe may restart the owned sidecar child.
- The regression test uses the real packaged sidecar for 120 Mining commits interleaved with 120
  vehicle-presence reads under the 650 ms deadline. It also forces a hung commit route, proves that
  `submit()` remains immediate, preserves the newest result, verifies recovery, and exercises the
  watchdog threshold.

## Candidate 8j field result

Candidate 8j's September 7 field evidence proved that the Mining repair works: it recognized and
committed `3200`, `100000`, `14400`, `36000`, and `87000` signatures at the intended acquisition
and locked rates. The full Electron and sidecar logs also isolated a separate supervision defect.
Successful Mining requests did not clear accumulated watchdog strikes, the restart cooldown did not
expire the old failure episode, and deliberate watchdog `SIGTERM` exits consumed the same five-exit
budget as spontaneous crashes. After five controlled recoveries, Electron stopped respawning the
sidecar. The sidecar log contains no spontaneous exception that explains those exits.

## What Candidate 8k repairs

Candidate 8k starts from the exact Candidate 8j artifact and changes only sidecar supervision:

- Every successful Mining transport call clears the active watchdog failure episode.
- Failure strikes expire after a 10-second healthy gap and cannot accumulate across hours of play.
- A controlled restart requires at least three independent health-probe failures spanning at least
  10 seconds of continuous failure.
- A new child receives 15 seconds of startup/readiness grace, and controlled restarts have a
  60-second cooldown to prevent a recovery loop.
- A watchdog-requested termination is tracked separately and does not consume the five-exit
  spontaneous-crash budget.
- The ordinary crash budget resets after the sidecar remains stable for 60 seconds.
- Candidate 8j's Mining capture, OCR, catalog, scheduler, commit transport, Game.log authority, and
  direct Gamescope PipeWire implementation are hash-locked unchanged.

The Candidate 8k self-test proves that stale strikes expire, successes reset the failure episode,
startup grace holds, a continuous outage causes one controlled restart, cooldown prevents another,
and watchdog recovery does not consume the crash budget.

## Candidate 8k field-test gate

1. Play normally for a long session and confirm Mining keeps Candidate 8j's exact 1200 ms
   acquisition and 900 ms locked cadence.
2. Confirm RS values continue to recognize and commit without pressing `F`, showing the scan area,
   or Alt-Tabbing as a wake-up action.
3. Confirm successful Mining traffic prevents old watchdog strikes from causing a later restart.
4. Confirm ordinary transient route failures do not restart the sidecar.
5. If a genuine continuous sidecar outage occurs, confirm it produces one controlled recovery only,
   followed by startup grace and cooldown rather than a restart loop.
6. Confirm controlled watchdog recovery does not raise the ordinary sidecar crash count.
7. Preserve the complete `electron.log` and `sidecar.log`, including normal startup and shutdown.

Gabe subsequently reported Candidate 8k Mining and base operation working. This does not establish
that every individual test case above was exercised; retain that distinction for release approval.

The planned Candidate 8j field gate was:

1. Start on foot. Confirm Mining does not accept or announce an RS value.
2. Enter a ship. Confirm `/api/vehicle-presence` becomes active from the ship channel.
3. Without pressing `F` and without opening “show scan area,” scan a `2000` debris/harvest signature.
   Confirm acquisition runs at exactly `1200ms` and changes to exactly `900ms` after the read.
4. Scan several ore signatures, including one above `30000` if available. Confirm the log reports
   `commit=queued`, then a matching `[mining-commit]` acknowledgment with `result=used`. Confirm it
   does not use the compatibility `/api/mining/scan` request.
5. Leave the ship. Confirm vehicle presence clears and Mining refuses new values.
6. Enter and exit a ground vehicle. Confirm control grant activates presence and release clears it.
7. Hold `F` over widgets, type or click, leave the widget, and release `F`. Confirm focus and
   click-through recover without a second cursor.
8. Confirm the capture source remains `gamescope-pipewire` and identifies a Gamescope PipeWire node.
9. Confirm auxiliary OCR reports `deferred-for-mining` while vehicle authority is active and resumes
   after leaving the vehicle; it must not consume the Mining lane.
10. Visit a location that exposes decimal navigation coordinates. Confirm the coordinates are not
    accepted or announced as an RS value.
11. Confirm location sync remains responsive during the Mining test.
12. Run longer than the prior five-minute SSE failure interval. Confirm `[mining-heartbeat]` remains
    present in `electron.log`, Candidate 2's 600/800 cadence stays stable, and no repeated `[mining-ipc]`
    timeout run appears.
13. If the sidecar becomes unresponsive, confirm three failed independent health probes precede one
    owned-sidecar restart and the newest Mining result is acknowledged after recovery.

If a case fails, preserve the log and create one candidate that addresses only that failure group.

## Upstream target and porting order

On September 12, 2026, Gabe approved advancing the current candidate to the developer's most recent
release while preserving every Linux contract. The frozen release target is now:

- Repository: `https://github.com/SubliminalsTV-Projects/sc-overlay`
- Tag: `v0.1.47`
- Commit: `e482c1ce3d461b390079486115293535be9b2ab7`
- Commit date: September 8, 2026
- Upstream package version: `0.1.47`
- Subject: `Merge: tool ageband — negative controls for every age-band assertion`

Candidate 5 stages from the checksum-verified Candidate 4 package rather than rebuilding Linux
runtime work from source. Keep this target frozen until Candidate 5 is field tested. Candidate 8k
remains the known field-tested rollback build.

## Binding Linux decisions

- Gabe explicitly authorized Charlie/Codex on September 4, 2026 to push completed ArchVerse project
  work to the configured origin, including future ArchVerse branches and commits. Candidate,
  field-test, release, and deployment gates still apply.
- Linux behavior is the non-negotiable baseline. Upstream features may enhance it but may not
  regress it.
- Held `F` is the Linux widget interaction path in the current tested runtime.
- `Shift+F6` is the Linux arrange shortcut in the current contract.
- Hard click-through, one native cursor, focus ownership, and physical pointer forwarding remain.
- Direct Gamescope PipeWire is the permanent first-choice Mining capture path when Gamescope owns the
  active Star Citizen session.
- Gamescope is optional. Default Star Citizen launches must retain functional fallback capture.
- RapidOCR remains crash-isolated and resource-bounded, with Tesseract as fallback.
- Mining values use the canonical exact signature catalog. Do not invent nearest-number matches.
- `SC_TRACKER_CONFIG_DIR` owns Linux config state.
- Game.log and screen capture are read-only inputs. Do not add process injection or game-memory reads.
- Privacy, tokens, network access, and OCR features remain local-first and opt-in.
- The panoramic Gamescope launcher's PipeWire source string is a protected Linux contract.
- ArchVerse is not currently started or killed by Gabe's Star Citizen launcher scripts. Keep the
  launcher independent unless Gabe asks to restore integration.
- Full UI translation work remains separate. The existing upstream blueprint language-file parsing
  and localization fixes remain in the application baseline.

See `linux-port/PORTING_CONTRACT.md` for the complete validation matrix.

## Superseded status files

These files remain useful as history, but they are not current status authorities:

- Root `README.md`: describes upstream Windows usage and does not identify Candidate 8j.
- Packaged Candidate 8f `README.md`: inherited Alpha 21 text.
- `linux-port/ALPHA-STATUS.md`: records the Alpha 17 checkpoint.
- `docs/R31-INPUT-DESIGN.md`: records an older Right Alt design that was superseded by the tested
  held-`F` and `Shift+F6` Linux contract.
- `docs/NATIVE-PACKAGING.md`: describes the Alpha 21 three-distribution package checkpoint.

## Distribution status

The latest packaged-verified native deliverable is Alpha23 Candidate 18. Candidate 14's normal KDE portal
capture, Mining, and Hauling are field-working, while Candidate 13's direct Gamescope capture passed
its field test. Candidate 15 repaired the shared refinery classifier without replacing either capture
path. Candidate 16 isolates normal host pointer coordinates from Gamescope's nested coordinate
mapping. Candidate 17 replaces the crashing Nobara `xdotool` class probe without changing either
capture path. Candidate 8k remains the older rollback whose Mining and base operation Gabe reported
working.

Candidate 18 is publicly released for Arch-family KDE and Fedora/Nobara KDE under tag
`v0.1.47-r31-alpha.23`. Automated package builds, native package-manager dependency transactions,
metadata checks, and byte-for-byte payload identity passed. Nobara 44 installation, normal
Wine/XWayland, Gamescope, physical-keyboard held-`F`, direct PipeWire capture, focus handoff, and
click-through are field verified. Debian/Ubuntu remains a packaged test artifact and is not part of
this public release.

## Candidate 16 KDE packaging checkpoint

- Branch: `agent/candidate16-kde-packaging-installer`
- Package source commit: `a48573fa3a41406dc9c78a2c550542098b8d433b`
- Source payload commit: `4f9f94c2907470fc095859ee659c465173e647e2`
- Source payload workflow: `35488559407`
- Source archive SHA-256:
  `244c4da008883a3bff8143078bda85c2a4f23450e11a459f2e5cc3c303483091`
- Green package workflow: `35811665101`
- Arch artifact: `ArchVerse-Candidate16-Arch-KDE-test1`, ID `10729789786`, ZIP SHA-256
  `7aa6b6aa381e308ff537fbe245986c37f39b63355e8115956e8b5aff7d4bd80e`
- Fedora/Nobara artifact: `ArchVerse-Candidate16-Nobara-KDE-test1`, ID `10730480457`, ZIP SHA-256
  `8521abffe34f28283b0940ab5fefb0a252d8bd20ee53f25e56c4b1a8c48c1b7d`
- Debian/Ubuntu artifact: `ArchVerse-Candidate16-Debian-KDE-test1`, ID `10730635092`, ZIP SHA-256
  `2e3277144b82b90cf9cec0f2aadd542c04e09d328858561b081ce800fa71df4e`
- Artifacts expire on December 22, 2026 unless promoted or rebuilt.

The installer detects Arch, Fedora/Nobara, or Debian/Ubuntu families, accepts KDE X11 and KDE
Wayland with XWayland, verifies the selected package checksum, delegates installation to the native
package manager, and runs `archverse-doctor`. It deliberately rejects Hyprland, unsupported
desktops, native Wayland without XWayland, non-x86-64 systems, and non-glibc systems. Hyprland stays
reserved for the separate Omarchy port.

Automated evidence from workflow `35811665101`:

- exact Candidate 16 archive provenance and checksum passed;
- 7 installer/doctor platform and checksum-manifest cases passed;
- Arch `pacman`, Fedora `dnf`, and Ubuntu `apt` dependency transactions passed;
- all application files and symlinks in the Arch, RPM, and Debian packages matched the verified
  Candidate 16 payload byte-for-byte;
- each package's internal `SHA256SUMS` passed; and
- package metadata and all three GitHub artifact uploads passed.

Independent evidence for the final Arch artifact:

- downloaded ZIP matched GitHub's artifact digest;
- ZIP integrity and internal package SHA-256 passed;
- package SHA-256 was
  `3b3c52daf513dcd7bc2b68cf7221e15a577dfd74c1c7b24682e0bb5c8a0056ec`; and
- a simulated CachyOS KDE Wayland/XWayland install selected the Arch package, verified its checksum,
  and produced the expected `pacman -U --needed --noconfirm` command with exit status 0.

Next single step: install the Arch-family artifact on Gabe's CachyOS KDE system, run
`archverse-doctor`, then exercise normal KDE and Gamescope separately before promotion.

## Continuity maintenance

- Update this file only from evidence, repository state, or an explicit decision from Gabe.
- Keep the current baseline and latest field-tested baseline separate.
- Record exact branch names, full commits, workflow runs, artifact names, checksums, and tests.
- Move completed work into a short decision-history entry instead of deleting the reason for it.
- Run `tools/update-archverse-handoff.sh` after the update.
- Replace the existing persistent `ARCHVERSE-HANDOFF.generated.md` after each meaningful project
  change. Do not create another handoff file with the same purpose.
- Upload `ARCHVERSE-HANDOFF.generated.md` to a new chat when direct repository access is unavailable.
