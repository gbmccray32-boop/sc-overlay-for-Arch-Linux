/* Optional per-widget appearance controls for SC Overlay.
 *
 * Load this file after missions.html's main script if you want to enable it.
 * It expects the existing WIDGETS / WBY / wEl / frameEl / wSettingsRoot helpers.
 *
 * Each widget gets two independent controls:
 *   Text brightness      25% .. 200% + Auto fade
 *   Window transparency  0% .. 100%  + Auto fade
 *
 * With Auto fade OFF, the slider applies continuously (the original behavior).
 * With Auto fade ON, the slider becomes the mouse-out/idle target:
 *   - pointer inside widget: 100% text brightness / 0% window transparency
 *   - pointer leaves widget: transition to the slider value over 500 ms
 *
 * Text and window fading remain independent. The implementation animates the
 * existing theme color tokens rather than applying opacity to the whole iframe.
 *
 * When this optional feature is loaded it retires the older per-widget
 * "Fade when idle" slider from the widget popover. That older control fades the
 * entire widget as one opacity layer; keeping both controls would make the UI
 * ambiguous and can stack two fade systems. The separate global "Fade while you
 * play" preference is left intact.
 */
(() => {
  "use strict";

  if (typeof WIDGETS === "undefined" || !Array.isArray(WIDGETS)) return;

  const STORE_KEY = "scOverlayWidgetAppearanceV1";
  const FADE_MS = 500;
  const BRIGHT_MIN = 25;
  const BRIGHT_MAX = 200;
  const TRANS_MIN = 0;
  const TRANS_MAX = 100;
  const TEXT_TOKENS = [
    "--cyan", "--cyan-bright", "--cyan-text", "--cyan-dim", "--faint",
    "--gold", "--amber", "--green", "--red", "--title",
    "--leg", "--epic", "--rare", "--unc", "--common",
  ];
  const BACKGROUND_TOKENS = ["--panel-top", "--panel-bot", "--panel-solid", "--scan", "--sheen"];
  const ALL_TOKENS = [...TEXT_TOKENS, ...BACKGROUND_TOKENS];

  let saved = {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") saved = parsed;
  } catch { saved = {}; }

  const hoverState = new Map();
  const hoverWired = new WeakSet();
  const observedThemeRoots = new WeakSet();
  const baseColors = new WeakMap();
  const animations = new WeakMap();
  const styledDocs = new WeakSet();

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)));

  function pref(w) {
    const p = saved[w.key] || {};
    return {
      brightness: clamp(Number.isFinite(+p.brightness) ? +p.brightness : 100, BRIGHT_MIN, BRIGHT_MAX),
      transparency: clamp(Number.isFinite(+p.transparency) ? +p.transparency : 0, TRANS_MIN, TRANS_MAX),
      brightnessAutoFade: p.brightnessAutoFade === true,
      transparencyAutoFade: p.transparencyAutoFade === true,
    };
  }

  function store(w, next) {
    saved[w.key] = { ...pref(w), ...next };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
    return saved[w.key];
  }

  function ensureAppearanceStyles(doc) {
    if (!doc || styledDocs.has(doc)) return;
    styledDocs.add(doc);

    const style = doc.createElement("style");
    style.dataset.widgetAppearanceControls = "v2";
    style.textContent = `
      .widget-appearance {
        margin-top: 7px;
        padding-top: 6px;
        border-top: 1px solid var(--border, rgba(var(--accent-rgb, 69,208,224), .26));
        font-family: var(--sans, inherit);
        color: var(--cyan-text, inherit);
      }
      .widget-appearance-title {
        padding: 2px 0 4px;
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: .18em;
        text-transform: uppercase;
        color: var(--cyan-dim, var(--faint, currentColor));
      }
      .widget-appearance-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        padding: 3px 0;
        color: var(--cyan-text, inherit);
      }
      .widget-appearance-row + .widget-appearance-row { margin-top: 4px; }
      .wa-label {
        flex: 1 1 92px;
        min-width: 76px;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: var(--cyan-text, inherit);
      }
      .wa-range {
        flex: 0 0 92px;
        width: 92px;
        height: 4px;
        margin: 0;
        cursor: pointer;
        accent-color: var(--cyan, currentColor);
      }
      .wa-value {
        flex: 0 0 38px;
        min-width: 38px;
        text-align: right;
        font-family: var(--mono, ui-monospace, monospace);
        font-size: 10px;
        font-weight: 700;
        color: var(--faint, currentColor);
      }
      .wa-auto {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        cursor: pointer;
        font-size: 9.5px;
        font-weight: 600;
        color: var(--cyan-dim, var(--faint, currentColor));
        user-select: none;
      }
      .wa-autofade {
        width: 14px;
        height: 14px;
        margin: 0;
        cursor: pointer;
        accent-color: var(--cyan, currentColor);
      }
      .wa-range:focus-visible,
      .wa-autofade:focus-visible {
        outline: 1px solid var(--cyan-bright, var(--cyan, currentColor));
        outline-offset: 2px;
      }
      .wcfg > .widget-appearance {
        margin-top: 7px;
        padding-top: 7px;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function retireLegacyPerWidgetFade(w) {
    const host = wEl(w);
    if (!host) return;

    // The shell's older per-widget control fades the ENTIRE widget using --wdim.
    // Remove its UI when this more granular feature is active.
    host.querySelectorAll(".wcfg-dimrow").forEach((row) => row.remove());

    // Ignore a previously saved per-widget dim override for this session, but keep the
    // shell's global fade preference working by falling back to globalDim/applyDim.
    if (w?.s && typeof w.s.dim === "number") {
      w.s.dim = null;
      try {
        if (typeof applyDim === "function") applyDim(w);
      } catch { /* older/newer shell without a callable applyDim */ }
    }
  }

  function parseColor(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;

    let m = s.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };

    m = s.match(/^#([0-9a-f]{3,8})$/i);
    if (!m) return null;

    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;

    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgba = (c) =>
    `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.max(0, Math.min(1, c.a)).toFixed(4)})`;

  function brighten(c, pct) {
    const f = pct / 100;
    if (f <= 1) return { ...c, r: c.r * f, g: c.g * f, b: c.b * f };

    const k = Math.min(1, f - 1);
    return {
      ...c,
      r: c.r + (255 - c.r) * k,
      g: c.g + (255 - c.g) * k,
      b: c.b + (255 - c.b) * k,
    };
  }

  function mixColor(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: a.a + (b.a - a.a) * t,
    };
  }

  function appearanceTarget(w) {
    if (w.local) return { doc: document, target: wEl(w) };

    try {
      const doc = frameEl(w)?.contentDocument;
      if (!doc || !doc.documentElement || doc.location.href === "about:blank") return null;
      return { doc, target: doc.documentElement };
    } catch {
      return null;
    }
  }

  function readComputedColors(doc, target) {
    const cs = doc.defaultView.getComputedStyle(target);
    const colors = new Map();
    for (const name of ALL_TOKENS) {
      const c = parseColor(cs.getPropertyValue(name).trim());
      if (c) colors.set(name, c);
    }
    return colors;
  }

  function captureBase(ctx, preserveCurrent = false) {
    const { doc, target } = ctx;
    const current = preserveCurrent ? readComputedColors(doc, target) : null;

    for (const name of ALL_TOKENS) target.style.removeProperty(name);
    const base = readComputedColors(doc, target);
    baseColors.set(target, base);

    if (current) {
      for (const [name, color] of current) target.style.setProperty(name, rgba(color));
    }
    return base;
  }

  function baseFor(ctx) {
    return baseColors.get(ctx.target) || captureBase(ctx, false);
  }

  function effectiveAppearance(w) {
    const p = pref(w);
    const hovered = hoverState.get(w.key) === true;

    return {
      brightness: p.brightnessAutoFade && hovered ? 100 : p.brightness,
      transparency: p.transparencyAutoFade && hovered ? 0 : p.transparency,
    };
  }

  function desiredColors(w, ctx) {
    const p = effectiveAppearance(w);
    const base = baseFor(ctx);
    const desired = new Map();

    for (const name of TEXT_TOKENS) {
      const c = base.get(name);
      if (c) desired.set(name, brighten(c, p.brightness));
    }

    const keep = 1 - p.transparency / 100;
    for (const name of BACKGROUND_TOKENS) {
      const c = base.get(name);
      if (c) desired.set(name, { ...c, a: c.a * keep });
    }

    return desired;
  }

  function cancelAnimation(target) {
    const old = animations.get(target);
    if (!old) return;
    old.win.cancelAnimationFrame(old.raf);
    animations.delete(target);
  }

  function writeColors(target, colors) {
    for (const [name, color] of colors) target.style.setProperty(name, rgba(color));
  }

  function animateColors(ctx, desired, duration = FADE_MS) {
    const { doc, target } = ctx;
    const win = doc.defaultView;
    if (!win) {
      writeColors(target, desired);
      return;
    }

    cancelAnimation(target);

    if (!(duration > 0)) {
      writeColors(target, desired);
      return;
    }

    const start = readComputedColors(doc, target);
    const from = new Map();
    for (const [name, end] of desired) from.set(name, start.get(name) || end);

    const started = win.performance.now();
    const state = { win, raf: 0 };
    animations.set(target, state);

    const step = (now) => {
      const raw = Math.max(0, Math.min(1, (now - started) / duration));
      const eased = raw * raw * (3 - 2 * raw); // smoothstep
      const frame = new Map();

      for (const [name, end] of desired) {
        frame.set(name, mixColor(from.get(name), end, eased));
      }
      writeColors(target, frame);

      if (raw < 1) {
        state.raf = win.requestAnimationFrame(step);
      } else {
        writeColors(target, desired);
        animations.delete(target);
      }
    };

    state.raf = win.requestAnimationFrame(step);
  }

  function applyAppearance(w, { animate = false, refreshBase = false } = {}) {
    const ctx = appearanceTarget(w);
    if (!ctx || !ctx.target) return;

    if (refreshBase) captureBase(ctx, true);
    const desired = desiredColors(w, ctx);
    animateColors(ctx, desired, animate ? FADE_MS : 0);

    const p = pref(w);
    const effective = effectiveAppearance(w);
    ctx.target.style.setProperty("--widget-text-brightness", String(effective.brightness / 100));
    ctx.target.style.setProperty("--widget-window-transparency", String(effective.transparency / 100));
    ctx.target.style.setProperty("--widget-appearance-fade-ms", `${FADE_MS}ms`);
    ctx.target.dataset.widgetAppearanceHover = hoverState.get(w.key) === true ? "inside" : "outside";
    ctx.target.dataset.widgetTextAutoFade = p.brightnessAutoFade ? "on" : "off";
    ctx.target.dataset.widgetWindowAutoFade = p.transparencyAutoFade ? "on" : "off";

    updateReadouts(w);
  }

  function setHovered(w, hovered) {
    if (hoverState.get(w.key) === hovered) return;
    hoverState.set(w.key, hovered);

    const p = pref(w);
    if (p.brightnessAutoFade || p.transparencyAutoFade) {
      applyAppearance(w, { animate: true });
    }
  }

  function wireHover(w) {
    const host = wEl(w);
    if (!host || hoverWired.has(host)) return;

    hoverWired.add(host);
    if (!hoverState.has(w.key)) hoverState.set(w.key, false);

    host.addEventListener("mouseenter", () => setHovered(w, true));
    host.addEventListener("mouseleave", () => setHovered(w, false));
  }

  function autoMarkup(checked) {
    return '<label class="wa-auto" title="Apply this slider as soon as the pointer leaves the widget; restore the normal value while the pointer is inside.">' +
      '<input type="checkbox" class="wa-autofade" ' + (checked ? 'checked ' : '') + '/>' +
      '<span>Auto fade</span></label>';
  }

  function rowMarkup(kind, label, min, max, value, checked, title) {
    return '<div class="widget-appearance-row wa-' + kind + '" title="' + title + '">' +
      '<span class="wa-label">' + label + '</span>' +
      '<input type="range" class="wa-range" min="' + min + '" max="' + max + '" step="1" value="' + value + '" />' +
      '<b class="wa-value"></b>' +
      autoMarkup(checked) +
      '</div>';
  }

  function wireRow(w, row, valueKey, autoKey) {
    if (!row || row.dataset.waWired === "1") return;
    row.dataset.waWired = "1";

    const range = row.querySelector(".wa-range");
    const auto = row.querySelector(".wa-autofade");
    if (!range || !auto) return;

    range.addEventListener("input", (e) => {
      e.stopPropagation();
      store(w, { [valueKey]: +range.value });
      applyAppearance(w, { animate: false });
    });

    range.addEventListener("change", (e) => e.stopPropagation());
    range.addEventListener("click", (e) => e.stopPropagation());

    auto.addEventListener("change", (e) => {
      e.stopPropagation();
      store(w, { [autoKey]: auto.checked });
      applyAppearance(w, { animate: true });
    });

    auto.addEventListener("click", (e) => e.stopPropagation());
    auto.closest("label")?.addEventListener("click", (e) => e.stopPropagation());
  }

  function addRows(w, root, ownMenu) {
    if (!root || root.querySelector(`.widget-appearance[data-widget-appearance="${w.key}"]`)) return;

    const doc = root.ownerDocument;
    ensureAppearanceStyles(doc);
    const wrap = doc.createElement("div");
    wrap.className = "widget-appearance";
    wrap.dataset.widgetAppearance = w.key;
    const p = pref(w);

    wrap.innerHTML = (ownMenu
      ? '<div class="widget-appearance-title">Appearance</div>'
      : "") +
      rowMarkup(
        "brightness", "Text brightness", BRIGHT_MIN, BRIGHT_MAX, p.brightness, p.brightnessAutoFade,
        "Adjust text/chrome brightness. Auto fade makes this the mouse-out value; mouse-in returns to 100%."
      ) +
      rowMarkup(
        "transparency", "Window transparency", TRANS_MIN, TRANS_MAX, p.transparency, p.transparencyAutoFade,
        "Adjust widget glass/background transparency. Auto fade makes this the mouse-out value; mouse-in returns to 0%."
      );

    root.appendChild(wrap);
    wireRow(w, wrap.querySelector(".wa-brightness"), "brightness", "brightnessAutoFade");
    wireRow(w, wrap.querySelector(".wa-transparency"), "transparency", "transparencyAutoFade");
    updateReadouts(w);
  }

  function injectWrapperRows(w) {
    const root = wEl(w)?.querySelector(".wcfg");
    if (root) addRows(w, root, false);
  }

  function injectOwnRows(w) {
    let root = null;
    try { root = wSettingsRoot(w); } catch { root = null; }
    if (root) addRows(w, root, true);
  }

  function updateReadouts(w) {
    const p = pref(w);
    const roots = [];
    const el = wEl(w);
    if (el) roots.push(el);

    try {
      const own = wSettingsRoot(w);
      if (own && !roots.includes(own)) roots.push(own);
    } catch { /* iframe not ready */ }

    for (const root of roots) {
      root.querySelectorAll(`.widget-appearance[data-widget-appearance="${w.key}"]`).forEach((box) => {
        const br = box.querySelector(".wa-brightness");
        const tr = box.querySelector(".wa-transparency");

        if (br) {
          br.querySelector(".wa-range").value = p.brightness;
          br.querySelector(".wa-value").textContent = Math.round(p.brightness) + "%";
          br.querySelector(".wa-autofade").checked = p.brightnessAutoFade;
        }

        if (tr) {
          tr.querySelector(".wa-range").value = p.transparency;
          tr.querySelector(".wa-value").textContent = Math.round(p.transparency) + "%";
          tr.querySelector(".wa-autofade").checked = p.transparencyAutoFade;
        }
      });
    }
  }

  function observeTheme(w) {
    const ctx = appearanceTarget(w);
    if (!ctx) return;

    const root = ctx.doc.documentElement;
    if (observedThemeRoots.has(root)) return;
    observedThemeRoots.add(root);

    new MutationObserver((records) => {
      if (records.some((r) => r.attributeName === "data-theme")) {
        setTimeout(() => applyAppearance(w, { animate: true, refreshBase: true }), 0);
      }
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  }

  function syncWidget(w, initial = false) {
    retireLegacyPerWidgetFade(w);
    wireHover(w);
    injectWrapperRows(w);
    injectOwnRows(w);

    const ctx = appearanceTarget(w);
    if (ctx && !baseColors.has(ctx.target)) captureBase(ctx, false);

    applyAppearance(w, { animate: !initial });
    observeTheme(w);
  }

  // Host elements are stable even when an embedded iframe unloads/reloads.
  for (const w of WIDGETS) {
    if (!hoverState.has(w.key)) hoverState.set(w.key, false);
    retireLegacyPerWidgetFade(w);
    wireHover(w);
    injectWrapperRows(w);

    if (!w.local) {
      const frame = frameEl(w);
      frame?.addEventListener("load", () => setTimeout(() => syncWidget(w, true), 0));
    }

    syncWidget(w, true);
  }

  // Some embedded settings menus appear shortly after iframe load/ready.
  setInterval(() => {
    for (const w of WIDGETS) {
      if (w.local || w.armed) {
        retireLegacyPerWidgetFade(w);
        injectOwnRows(w);
        observeTheme(w);
      }
    }
  }, 1200);

  // Keep the local Blueprint panel aligned when the parent manufacturer theme changes.
  new MutationObserver(() => setTimeout(() => {
    const bp = typeof WBY !== "undefined" ? WBY.blueprint : null;
    if (bp) applyAppearance(bp, { animate: true, refreshBase: true });
  }, 0)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
