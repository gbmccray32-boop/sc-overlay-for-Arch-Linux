Name:           archverse-overlay
Version:        0.1.42
Release:        4.r31.alpha21%{?dist}
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
Community Linux package of the tested ArchVerse Alpha 21 native payload.
The Fedora-family package bundles the verified Electron 42.7.1 runtime while using the host
Node.js, OCR, X11 integration and desktop capture utilities. The application payload and durable
Linux behavior policies are identical to the Arch and Debian package targets.

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
/opt/archverse-overlay

%changelog
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
