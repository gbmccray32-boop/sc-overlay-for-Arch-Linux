import { nativeWidgetChromeScript, nativeWidgetChromeStyle } from "./widget-window-native-chrome.mjs";

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
    let resizePointer = null;
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "archverse-native-resize-handle";
    resizeHandle.title = "Resize Infographic Viewer";
    resizeHandle.setAttribute("aria-hidden", "true");
    document.body.appendChild(resizeHandle);

${nativeWidgetChromeScript({ title: "Infographic Viewer" })}

    api.onState((state) => {
      arrange = state?.arrangeMode === true;
      document.documentElement.classList.toggle("native-arrange", arrange);
      if (!arrange && state?.interactive !== true) nativeMenu.classList.remove("open");
    });
    api.onReload?.(() => window.__bindingReload?.());

    head?.addEventListener("pointerdown", (event) => {
      if (!arrange || event.button !== 0 || event.target?.closest?.("button, input")) return;
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
    resizeHandle.addEventListener("pointerdown", (event) => {
      if (!arrange || event.button !== 0) return;
      resizePointer = event.pointerId;
      try { resizeHandle.setPointerCapture(event.pointerId); } catch {}
      api.resize("start", event.screenX, event.screenY);
      event.preventDefault();
      event.stopPropagation();
    });
    resizeHandle.addEventListener("pointermove", (event) => {
      if (event.pointerId === resizePointer) api.resize("move", event.screenX, event.screenY);
    });
    const endResize = (event) => {
      if (event.pointerId !== resizePointer) return;
      api.resize("end", event.screenX, event.screenY);
      resizePointer = null;
    };
    resizeHandle.addEventListener("pointerup", endResize);
    resizeHandle.addEventListener("pointercancel", endResize);
    api.ready();
  })();
</script>`;

export function portNativeBindingChartWindow(input) {
  let html = input;
  html = mustReplace(
    html,
    "  body.embedded { overflow: visible; background: transparent; }\n  body.embedded #panel { width: 100%; height: 100%; margin: 0; }",
    "  body.embedded, body.native-window { overflow: visible; background: transparent; }\n  body.embedded #panel, body.native-window #panel { width: 100%; height: 100%; margin: 0; }\n  body.native-window .head { font-size: calc(10px * var(--native-widget-text-scale, 1)); }\n  html.native-arrange .head { cursor: move; background: rgba(var(--accent-rgb), 0.18); touch-action: none; }\n  .archverse-native-resize-handle { display: none; }\n  html.native-arrange body.native-window .archverse-native-resize-handle { display: block; position: fixed; right: 0; bottom: 0; width: 28px; height: 28px; z-index: 2147483647; cursor: nwse-resize; touch-action: none; background: linear-gradient(135deg, transparent 0 42%, rgba(var(--accent-rgb), 0.92) 43% 53%, transparent 54% 62%, rgba(var(--accent-rgb), 0.92) 63% 73%, transparent 74%); }\n" + nativeWidgetChromeStyle,
    "Infographic Viewer native window style",
  );
  html = mustReplace(
    html,
    "  const EMBEDDED = new URLSearchParams(location.search).has(\"embedded\");\n  if (EMBEDDED) document.body.classList.add(\"embedded\");",
    "  const NATIVE_PARAMS = new URLSearchParams(location.hash.slice(1));\n  const EMBEDDED = new URLSearchParams(location.search).has(\"embedded\");\n  const NATIVE_WINDOW = NATIVE_PARAMS.has(\"widgetWindow\");\n  if (EMBEDDED) document.body.classList.add(\"embedded\");\n  if (NATIVE_WINDOW) document.body.classList.add(\"native-window\");",
    "Infographic Viewer native mode",
  );
  html = mustReplace(
    html,
    "  const host = () => (EMBEDDED && window.parent) ? window.parent.__bindingChartHost : null;",
    "  const host = () => (EMBEDDED && window.parent) ? window.parent.__bindingChartHost\n    : (NATIVE_WINDOW ? window.archverseNativeWidget : null);",
    "Infographic Viewer host bridge",
  );
  html = mustReplace(html, "\n</body>\n</html>", `${nativeWindowScript}\n</body>\n</html>`, "Infographic Viewer native script");
  return html;
}
