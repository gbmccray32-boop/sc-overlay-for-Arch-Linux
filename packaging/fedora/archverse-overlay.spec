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
chmod 0755 %{buildroot}/opt/archverse-overlay/bin/sc-blueprint-tracker
if [ -f %{buildroot}/opt/archverse-overlay/runtime/electron/chrome-sandbox ]; then
  chmod 4755 %{buildroot}/opt/archverse-overlay/runtime/electron/chrome-sandbox
fi

%files
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
