const mustReplace = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(before, after);
};

const nativeWindowScript = `
<script id="archverse-native-widget-window">
  (() => {
    const api = window.archverseNativeWidget;
    if (!api) return;
    const head = document.querySelector(".head");
    let arrange = false;
    let dragPointer = null;

    api.onState((state) => {
      arrange = state?.arrangeMode === true;
      document.documentElement.classList.toggle("native-arrange", arrange);
      window.__scFeedPreview?.(arrange);
    });

    head?.addEventListener("pointerdown", (event) => {
      if (!arrange || event.button !== 0 || event.target?.closest?.("button")) return;
      dragPointer = event.pointerId;
      try { head.setPointerCapture(event.pointerId); } catch {}
      api.drag("start", event.screenX, event.screenY);
      event.preventDefault();
    });
    head?.addEventListener("pointermove", (event) => {
      if (event.pointerId === dragPointer) api.drag("move", event.screenX, event.screenY);
    });
    const endDrag = (event) => {
      if (event.pointerId !== dragPointer) return;
      api.drag("end", event.screenX, event.screenY);
      dragPointer = null;
    };
    head?.addEventListener("pointerup", endDrag);
    head?.addEventListener("pointercancel", endDrag);
    api.ready();
  })();
</script>`;

export function portNativeScFeedWindow(input) {
  let html = input;
  html = mustReplace(
    html,
    '  const EMBEDDED = new URLSearchParams(location.search).has("embedded");\n  // Same-origin bridge to the parent canvas (present only when embedded on the overlay).\n  const host = () => (EMBEDDED && window.parent) ? window.parent.__scFeedHost : null;',
    '  const PARAMS = new URLSearchParams(location.search);\n  const EMBEDDED = PARAMS.has("embedded");\n  const NATIVE_WINDOW = PARAMS.has("widgetWindow");\n  // Use the canvas bridge when embedded and the restricted preload bridge in a native window.\n  const host = () => (EMBEDDED && window.parent) ? window.parent.__scFeedHost\n    : (NATIVE_WINDOW ? window.archverseNativeWidget : null);',
    "SC Feed host bridge",
  );
  html = mustReplace(
    html,
    '  .head { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 12px;\n    border-bottom: 1px solid var(--divider); }',
    '  .head { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 12px;\n    border-bottom: 1px solid var(--divider); }\n  html.native-arrange .head { cursor: move; background: rgba(var(--accent-rgb), 0.18); touch-action: none; }',
    "SC Feed native arrange style",
  );
  html = mustReplace(html, "\n</body>\n</html>", `${nativeWindowScript}\n</body>\n</html>`, "SC Feed native script");
  return html;
}
