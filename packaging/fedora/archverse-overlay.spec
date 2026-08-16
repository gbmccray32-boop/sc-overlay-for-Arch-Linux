Name:           archverse-overlay
Version:        0.1.42.r31.alpha21
Release:        1%{?dist}
Summary:        Community Linux companion overlay for Star Citizen
License:        LicenseRef-FSL-1.1-MIT
URL:            https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux
Source0:        ArchVerse-Native-0.1.42-r31-alpha.21.tar.gz
Source1:        archverse-overlay.desktop
BuildArch:      x86_64

# Functional host tools used by the native Linux capture/window/sidecar paths. File dependencies
# deliberately let Fedora/Nobara choose the provider (for example ffmpeg-free vs ffmpeg).
Requires:       /usr/bin/node
Requires:       /usr/bin/tesseract
Requires:       /usr/bin/xdotool
Requires:       /usr/bin/xprop
Requires:       /usr/bin/xrandr
Requires:       /usr/bin/spectacle
Requires:       /usr/bin/magick
Requires:       /usr/bin/ffplay
Requires:       xdg-utils

# Preserve the official Electron runtime and prebuilt N-API modules exactly as staged.
Version:        0.1.42
Release:        7.r31.alpha21%{?dist}
Summary:        ArchVerse Star Citizen companion overlay
License:        LicenseRef-FSL-1.1-MIT
URL:            https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux
BuildArch:      x86_64

Source0:        ArchVerse-Overlay-0.1.42-r31-alpha.21-payload.tar.gz
Source1:        electron-runtime.tar.gz
Source2:        archverse-overlay
Source3:        archverse-overlay.desktop

Requires:       nodejs
Requires:       tesseract
Requires:       tesseract-langpack-eng
Requires:       pipewire-utils
Requires:       pipewire-gstreamer
Requires:       gstreamer1
Requires:       gstreamer1-plugins-base
Requires:       gstreamer1-plugins-good
Requires:       xdotool
Requires:       xrandr
Requires:       xprop
Requires:       ImageMagick
Requires:       ffmpeg
Requires:       spectacle
Requires:       gtk3
Requires:       nss
Requires:       libXScrnSaver
Requires:       alsa-lib
Requires:       mesa-libgbm
Requires:       libX11
Requires:       libXtst
Requires:       libXrandr
Recommends:     kscreen
Provides:       sc-blueprint-tracker
Conflicts:      sc-blueprint-tracker

# Electron, ONNX Runtime and uiohook are upstream/prebuilt binaries. Fedora's normal debuginfo
# pipeline tries to rewrite/index Electron's split-DWARF libvulkan and corrupts/fails on that
# layout. Preserve the verified runtime byte-for-byte instead of generating distro debuginfo.
%global debug_package %{nil}
%global __strip /bin/true

%description
ArchVerse Overlay is the community native-Linux port of the Star Citizen companion overlay.
This package carries the same Alpha 21 application payload and pinned Electron runtime used by
the Arch and Debian package targets; distro packaging differs, application behavior does not.

%prep
%setup -q -n ArchVerse-Native-0.1.42-r31-alpha.21

%build
# Application JavaScript and native modules are already verified by the shared staging job.

%install
rm -rf %{buildroot}
install -d %{buildroot}/opt/archverse-overlay
cp -a . %{buildroot}/opt/archverse-overlay/

install -d %{buildroot}%{_bindir}
ln -s /opt/archverse-overlay/bin/sc-blueprint-tracker %{buildroot}%{_bindir}/archverse-overlay
ln -s /opt/archverse-overlay/bin/sc-blueprint-tracker %{buildroot}%{_bindir}/sc-blueprint-tracker

install -Dm0644 %{SOURCE1} %{buildroot}%{_datadir}/applications/archverse-overlay.desktop
install -Dm0644 app/build/icon.png %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/archverse-overlay.png
install -Dm0644 LICENSE.md %{buildroot}%{_licensedir}/%{name}/LICENSE.md
Community Linux package of the tested ArchVerse Alpha 21 native payload.
The Fedora-family package bundles the verified Electron 42.7.1 runtime while using the host
Node.js, OCR, PipeWire/GStreamer, X11 integration and desktop capture utilities. The application
payload and durable Linux behavior policies are identical to the Arch and Debian package targets.

%prep
%setup -q -n ArchVerse-Overlay-0.1.42-r31-alpha.21 -a 1

%build
# Prebuilt, policy-verified application payload; no compile step is required here.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/opt/archverse-overlay

# Source1 is unpacked beneath the application source directory as an RPM staging convenience.
# Copy the application tree, remove only the duplicate buildroot copy, then install that staging
# runtime once at the path selected by the common launcher.
cp -a . %{buildroot}/opt/archverse-overlay/
rm -rf %{buildroot}/opt/archverse-overlay/electron-runtime
mkdir -p %{buildroot}/opt/archverse-overlay/runtime/electron
cp -a electron-runtime/. %{buildroot}/opt/archverse-overlay/runtime/electron/

install -Dm0755 %{SOURCE2} %{buildroot}%{_bindir}/archverse-overlay
ln -s archverse-overlay %{buildroot}%{_bindir}/sc-blueprint-tracker
install -Dm0644 %{SOURCE3} %{buildroot}%{_datadir}/applications/archverse-overlay.desktop
install -Dm0644 app/build/icon.png \
  %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/archverse-overlay.png
install -Dm0644 LICENSE.md \
  %{buildroot}%{_licensedir}/%{name}/LICENSE.md

# Chromium's sandbox helper must retain its upstream setuid mode in a native package.
chmod 0755 %{buildroot}/opt/archverse-overlay/bin/sc-blueprint-tracker
if [ -f %{buildroot}/opt/archverse-overlay/runtime/electron/chrome-sandbox ]; then
  chmod 4755 %{buildroot}/opt/archverse-overlay/runtime/electron/chrome-sandbox
fi

%files
%license %{_licensedir}/%{name}/LICENSE.md
%{_bindir}/archverse-overlay
%{_bindir}/sc-blueprint-tracker
%{_datadir}/applications/archverse-overlay.desktop
%{_datadir}/icons/hicolor/256x256/apps/archverse-overlay.png
%{_licensedir}/%{name}/LICENSE.md
/opt/archverse-overlay

%changelog
* Fri Aug 14 2026 Gavin Brooks-McCray <gbmccray32@gmail.com> - 0.1.42.r31.alpha21-1
- Initial shared native package target for Fedora and Nobara.
- Preserve Alpha 21 native runtime behavior and durable Linux hover-scoped widget latch.
/opt/archverse-overlay

%changelog
* Sat Aug 15 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-7.r31.alpha21
- Make the bound Gamescope PipeWire Video/Source the primary native Linux OCR capture backend.
- Discover the PipeWire node and BGRx frame size dynamically for each Gamescope session instead of hard-coding a monitor or panorama resolution.
- Keep Spectacle and Electron capture as fallback paths only.
- Keep Mining Assistant OCR armed independently of widget visibility, F-key state, hover and overlay focus.

* Sat Aug 15 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-6.r31.alpha21
- Make RapidOCR the permanent primary native Linux OCR backend, with Tesseract as failure-only fallback.
- Keep Windows.Media.Ocr/PowerShell behind a Windows-only runtime gate.
- Replace Linux full-frame OCR with independent Resource, Fabricator, Mission, Claim/context and Refinery crop regions.
- Add per-widget movable/resizable calibration regions normalized to the bound Star Citizen display.

* Sat Aug 15 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-5.r31.alpha21
- Remove the unavailable Windows PowerShell OCR path from native Linux mining ticks.
- Make post-signature glyph/outline telemetry asynchronous so it cannot stall the next resource frame.

* Fri Aug 15 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-4.r31.alpha21
- Keep the Resource Scanner overlay renderer live while Star Citizen retains focus.
- Prevent hover, F-key interaction, or Alt-Tab from acting as an accidental scanner wake-up trigger.

* Fri Aug 15 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-3.r31.alpha21
- Bound the mining poll cadence to 900-3000 ms so slow OCR cannot create 10-24 second sleeps.
- Keep reading the already-bound Star Citizen/Gamescope source while ArchVerse itself briefly owns focus.
- Add throttled mining OCR evidence/timing diagnostics and same-signature confirmation upgrades.

* Fri Aug 15 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-2.r31.alpha21
- Make parsed Resource Scanner signatures authoritative and robust to grouped/split OCR tokens.
- Accept RS 3,000 as the hand-mineable gemstone resource class.

* Fri Aug 14 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-1.r31.alpha21
- Preserve prebuilt Electron/native modules without Fedora debuginfo rewriting.
- Install the verified Electron runtime only once under /opt/archverse-overlay/runtime/electron.
- Carry the shared native Linux interaction, mining, OCR, session, watcher and mission policies.
