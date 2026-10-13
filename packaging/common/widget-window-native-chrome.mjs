export const nativeWidgetChromeStyle = `
  .archverse-native-menu-button { flex: none; width: 28px; height: 26px; padding: 0; }
  .archverse-native-menu { display: none; position: absolute; top: 34px; right: 8px; z-index: 2147483646;
    width: 250px; max-height: calc(100% - 46px); overflow-y: auto; padding: 8px;
    color: var(--cyan-text); background: rgba(4, 13, 18, 0.97); border: 1px solid var(--border);
    border-radius: 9px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55); font-family: var(--sans); }
  .archverse-native-menu.open { display: block; }
  .archverse-native-menu-section { padding: 5px 6px 4px; color: var(--faint); font-size: 9px;
    font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; }
  .archverse-native-menu-row { display: flex; align-items: center; gap: 7px; min-height: 31px;
    padding: 4px 6px; font-size: 11px; }
  .archverse-native-menu-row > span:first-child { flex: 1; }
  .archverse-native-menu-row input[type="range"] { width: 92px; accent-color: var(--cyan); }
  .archverse-native-menu-row input[type="checkbox"] { accent-color: var(--cyan); }
  .archverse-native-menu-value { width: 39px; text-align: right; color: var(--cyan-bright); font-family: var(--mono); }
  .archverse-native-menu-action { display: block; width: 100%; margin-top: 5px; padding: 7px 9px;
    color: var(--cyan-bright); background: rgba(var(--accent-rgb), 0.11); border: 1px solid var(--border);
    border-radius: 6px; text-align: left; font: 600 10px var(--sans); cursor: pointer; }
  .archverse-native-menu-action:hover { background: rgba(var(--accent-rgb), 0.23); border-color: var(--cyan); }
`;

// Shared renderer chrome for every migrated widget. The preload remains the security boundary:
// this component can request only validated appearance changes and named application actions.
export function nativeWidgetChromeScript({ title }) {
  return `
    const nativeMenuButton = document.createElement("button");
    nativeMenuButton.type = "button";
    nativeMenuButton.className = "hbtn archverse-native-menu-button";
    nativeMenuButton.title = ${JSON.stringify(`${title} settings`)};
    nativeMenuButton.setAttribute("aria-label", ${JSON.stringify(`${title} settings`)});
    nativeMenuButton.textContent = "⚙";
    const nativeMenu = document.createElement("div");
    nativeMenu.className = "archverse-native-menu";
    nativeMenu.innerHTML = '<div class="archverse-native-menu-section">This widget</div>'
      + '<div class="archverse-native-menu-row"><span>Text size</span><button type="button" class="hbtn" data-native-text="-0.1">A−</button><button type="button" class="hbtn" data-native-text="0.1">A+</button><span class="archverse-native-menu-value" data-native-value="text"></span></div>'
      + '<label class="archverse-native-menu-row"><span>Panel fade</span><input type="range" min="20" max="100" step="5" data-native-range="dim"><span class="archverse-native-menu-value" data-native-value="dim"></span></label>'
      + '<label class="archverse-native-menu-row"><span>Text fade</span><input type="range" min="20" max="100" step="5" data-native-range="dimText"><span class="archverse-native-menu-value" data-native-value="dimText"></span></label>'
      + '<label class="archverse-native-menu-row"><span>Full on hover</span><input type="checkbox" data-native-check="hoverFull"></label>'
      + '<button type="button" class="archverse-native-menu-action" data-native-action="reset">↺ Reset position, size, and appearance</button>'
      + '<div class="archverse-native-menu-section">Overlay app</div>'
      + '<button type="button" class="archverse-native-menu-action" data-native-action="arrange">⠿ Arrange widget windows</button>'
      + '<button type="button" class="archverse-native-menu-action" data-native-action="overlay-menu">⚙ Show Overlay App cog</button>'
      + '<button type="button" class="archverse-native-menu-action" data-native-action="settings">Open full settings…</button>';
    head?.appendChild(nativeMenuButton);
    document.body.appendChild(nativeMenu);

    let nativeAppearance = { text: 1, dim: 1, dimText: 1, hoverFull: true };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
    const nativeFadeLabel = (value) => value >= 1 ? "Off" : Math.round(value * 100) + "%";
    const applyNativeAppearance = (next) => {
      if (next && typeof next === "object") nativeAppearance = { ...nativeAppearance, ...next };
      const text = clamp(nativeAppearance.text, 0.7, 2);
      const panel = clamp(nativeAppearance.dim, 0.2, 1);
      const words = clamp(nativeAppearance.dimText, 0.2, 1);
      const hovered = nativeAppearance.hoverFull !== false && document.querySelector("#panel:hover");
      document.documentElement.style.setProperty("--native-widget-text-scale", String(text));
      document.documentElement.style.setProperty("--wsurf", String(hovered ? 1 : panel));
      document.documentElement.style.setProperty("--wtext", String(hovered ? 1 : words));
      nativeMenu.querySelector('[data-native-value="text"]').textContent = Math.round(text * 100) + "%";
      for (const key of ["dim", "dimText"]) {
        const value = key === "dim" ? panel : words;
        nativeMenu.querySelector('[data-native-range="' + key + '"]').value = String(Math.round(value * 100));
        nativeMenu.querySelector('[data-native-value="' + key + '"]').textContent = nativeFadeLabel(value);
      }
      nativeMenu.querySelector('[data-native-check="hoverFull"]').checked = nativeAppearance.hoverFull !== false;
    };
    const saveNativeAppearance = async (patch) => {
      const next = await api.updateAppearance(patch);
      applyNativeAppearance(next || patch);
    };
    nativeMenuButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const open = !nativeMenu.classList.contains("open");
      nativeMenu.classList.toggle("open", open);
      if (open) applyNativeAppearance(await api.menuState());
    });
    nativeMenu.addEventListener("pointerdown", (event) => event.stopPropagation());
    nativeMenu.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("pointerdown", (event) => {
      if (!nativeMenu.classList.contains("open") || event.target.closest?.(".archverse-native-menu, .archverse-native-menu-button")) return;
      nativeMenu.classList.remove("open");
    });
    nativeMenu.querySelectorAll("[data-native-text]").forEach((button) => button.addEventListener("click", () => {
      saveNativeAppearance({ text: clamp(nativeAppearance.text + Number(button.dataset.nativeText), 0.7, 2) });
    }));
    nativeMenu.querySelectorAll("[data-native-range]").forEach((input) => input.addEventListener("change", () => {
      saveNativeAppearance({ [input.dataset.nativeRange]: clamp(Number(input.value) / 100, 0.2, 1) });
    }));
    nativeMenu.querySelector("[data-native-check]").addEventListener("change", (event) => {
      saveNativeAppearance({ hoverFull: event.currentTarget.checked });
    });
    nativeMenu.querySelectorAll("[data-native-action]").forEach((button) => button.addEventListener("click", async () => {
      const action = button.dataset.nativeAction;
      const next = await api.menuAction(action);
      if (action === "reset") applyNativeAppearance(next);
      if (action !== "arrange") nativeMenu.classList.remove("open");
    }));
    document.getElementById("panel")?.addEventListener("mouseenter", () => applyNativeAppearance());
    document.getElementById("panel")?.addEventListener("mouseleave", () => applyNativeAppearance());
    api.onMenuState?.(applyNativeAppearance);
    api.menuState().then(applyNativeAppearance);
  `;
}
