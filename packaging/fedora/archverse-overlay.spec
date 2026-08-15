Name:           archverse-overlay
Version:        0.1.42
Release:        1.r31.alpha21%{?dist}
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

%description
Community Linux package of the tested ArchVerse Alpha 21 native payload.
The Fedora-family package bundles Electron 42 while using the host Node.js,
OCR, X11 integration and desktop capture utilities.

%prep
%setup -q -n ArchVerse-Overlay-0.1.42-r31-alpha.21 -a 1

%build
# Prebuilt application payload; no compile step is required here.

%install
mkdir -p %{buildroot}/opt/archverse-overlay
cp -a . %{buildroot}/opt/archverse-overlay/
mkdir -p %{buildroot}/opt/archverse-overlay/runtime/electron
cp -a %{_builddir}/ArchVerse-Overlay-0.1.42-r31-alpha.21/electron-runtime/. \
  %{buildroot}/opt/archverse-overlay/runtime/electron/

install -Dm0755 %{SOURCE2} %{buildroot}%{_bindir}/archverse-overlay
ln -s archverse-overlay %{buildroot}%{_bindir}/sc-blueprint-tracker
install -Dm0644 %{SOURCE3} %{buildroot}%{_datadir}/applications/archverse-overlay.desktop
install -Dm0644 app/build/icon.png \
  %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/archverse-overlay.png
install -Dm0644 LICENSE.md \
  %{buildroot}%{_licensedir}/%{name}/LICENSE.md

%files
%license %{_licensedir}/%{name}/LICENSE.md
%{_bindir}/archverse-overlay
%{_bindir}/sc-blueprint-tracker
%{_datadir}/applications/archverse-overlay.desktop
%{_datadir}/icons/hicolor/256x256/apps/archverse-overlay.png
/opt/archverse-overlay

%changelog
* Fri Aug 14 2026 Gavin <gbmccray32@gmail.com> - 0.1.42-1.r31.alpha21
- Initial Fedora/Nobara native package from the tested Alpha 21 Arch payload.
