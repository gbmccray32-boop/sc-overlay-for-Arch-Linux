Name:           archverse-overlay
Version:        0.1.47
Release:        1.r31.alpha23.candidate16%{?dist}
Summary:        ArchVerse Star Citizen companion overlay for KDE Linux
License:        LicenseRef-FSL-1.1-MIT
URL:            https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux
BuildArch:      x86_64

Source0:        ArchVerse-Native-0.1.47-r31.alpha23.candidate16.tar.gz
Source1:        archverse-overlay
Source2:        archverse-doctor
Source3:        archverse-overlay.desktop

# Commands are file requirements so Fedora and Nobara can select their current providers.
Requires:       /usr/bin/node
Requires:       /usr/bin/tesseract
Requires:       /usr/bin/pw-dump
Requires:       /usr/bin/gst-launch-1.0
Requires:       /usr/bin/gst-inspect-1.0
Requires:       /usr/bin/xdotool
Requires:       /usr/bin/xprop
Requires:       /usr/bin/xrandr
Requires:       /usr/bin/spectacle
Requires:       /usr/bin/magick
Requires:       /usr/bin/ffplay
Requires:       wireplumber
Requires:       pipewire-gstreamer
Requires:       gstreamer1-plugins-base
Requires:       gstreamer1-plugins-good
Requires:       xdg-desktop-portal
Requires:       xdg-desktop-portal-kde
Requires:       xdg-utils
Recommends:     kscreen
Provides:       sc-blueprint-tracker
Conflicts:      sc-blueprint-tracker

# Preserve the bundled Electron and N-API binaries exactly as verified.
%global debug_package %{nil}
%global __strip /bin/true
%global __brp_mangle_shebangs %{nil}

%description
ArchVerse is a community Linux companion overlay for Star Citizen. This package installs the
field-verified Candidate 16 payload for KDE X11, KDE Wayland/XWayland, and optional Gamescope.

%prep
%setup -q -n ArchVerse-Native-0.1.47-r31.alpha23.candidate16

%build
# The shared payload is prebuilt and checksum-verified by the packaging workflow.

%install
install -d %{buildroot}/opt/archverse-overlay
cp -a . %{buildroot}/opt/archverse-overlay/

install -Dm0755 %{SOURCE1} %{buildroot}%{_bindir}/archverse-overlay
install -Dm0755 %{SOURCE2} %{buildroot}%{_bindir}/archverse-doctor
ln -s archverse-overlay %{buildroot}%{_bindir}/sc-blueprint-tracker
install -Dm0644 %{SOURCE3} %{buildroot}%{_datadir}/applications/archverse-overlay.desktop
install -Dm0644 app/build/icon.png \
  %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/archverse-overlay.png
install -Dm0644 LICENSE.md %{buildroot}%{_licensedir}/%{name}/LICENSE.md

chmod 0755 %{buildroot}/opt/archverse-overlay/bin/sc-blueprint-tracker
if [ -f %{buildroot}/opt/archverse-overlay/runtime/electron/chrome-sandbox ]; then
  chmod 4755 %{buildroot}/opt/archverse-overlay/runtime/electron/chrome-sandbox
fi

%files
%license %{_licensedir}/%{name}/LICENSE.md
%{_bindir}/archverse-overlay
%{_bindir}/archverse-doctor
%{_bindir}/sc-blueprint-tracker
%{_datadir}/applications/archverse-overlay.desktop
%{_datadir}/icons/hicolor/256x256/apps/archverse-overlay.png
/opt/archverse-overlay

%changelog
* Tue Sep 22 2026 Gavin Brooks-McCray <gbmccray32@gmail.com> - 0.1.47-1.r31.alpha23.candidate16
- Package the field-verified Candidate 16 KDE and Gamescope runtime without changing its payload.
