(() => {
  'use strict';

  // ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI
  // User calibration UI for the permanent native Linux OCR contract. Each rectangle is stored as
  // fractions of the bound Star Citizen display and saved independently in linuxOcrRegions.
  const DEFAULTS = {
    fabricator:   { x: 0.50, y: 0.00, w: 0.50, h: 0.72 },
    mission:      { x: 0.04, y: 0.06, w: 0.46, h: 0.50 },
    claimContext: { x: 0.50, y: 0.00, w: 0.50, h: 0.72 },
    refinery:     { x: 0.08, y: 0.08, w: 0.84, h: 0.78 },
  };
  const LABELS = {
    fabricator: 'Fabricator OCR', mission: 'Mission OCR', claimContext: 'Claim / context OCR', refinery: 'Refinery OCR',
  };
  const regions = Object.create(null);
  let captureInfo = null;

  const visibleKey = (key) => `linuxOcrRegionHidden:${key}`;
  const prefVisible = (key) => {
    try { return localStorage.getItem(visibleKey(key)) === '0'; } catch { return false; }
  };
  const setPrefVisible = (key, on) => {
    try { localStorage.setItem(visibleKey(key), on ? '0' : '1'); } catch {}
  };
  const display = () => captureInfo || { px: 0, py: 0, pw: innerWidth, ph: innerHeight };
  window.__archverseOcrDisplay = display;

  function addStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .ocr-capture-box{display:none;position:fixed;z-index:13;box-sizing:border-box;border:2px dashed rgba(var(--accent-rgb),.86);background:rgba(var(--accent-rgb),.035);pointer-events:none;min-width:28px;min-height:18px}
      .ocr-capture-box.shown{display:block;pointer-events:auto;cursor:move}
      .ocr-capture-box.dragging,.ocr-capture-box:hover{background:rgba(var(--accent-rgb),.10);border-style:solid}
      .ocr-capture-box .ocr-tag{position:absolute;left:5px;top:5px;max-width:calc(100% - 108px);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:600 10px/1.2 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--cyan-bright);text-shadow:0 1px 3px #000;pointer-events:none}
      .ocr-capture-box .ocr-hide,.ocr-capture-box .ocr-reset{position:absolute;top:4px;font:600 10px/1.2 var(--sans);color:var(--cyan);cursor:pointer;user-select:none}
      .ocr-capture-box .ocr-hide{right:52px}.ocr-capture-box .ocr-reset{right:4px}
      .ocr-capture-box .ocr-hide:hover,.ocr-capture-box .ocr-reset:hover{color:var(--cyan-bright)}
      .ocr-capture-box .ocr-grip{position:absolute;right:-1px;bottom:-1px;width:17px;height:17px;cursor:nwse-resize;border-right:3px solid var(--cyan);border-bottom:3px solid var(--cyan)}
    `;
    document.head.appendChild(style);
  }

  function box(key) { return document.querySelector(`.ocr-capture-box[data-ocr-region="${key}"]`); }
  function draw(key) {
    const el = box(key); if (!el) return;
    const d = display(), f = regions[key] || DEFAULTS[key];
    if (!d || !f || !d.pw || !d.ph) return;
    el.style.left = Math.round(d.px + f.x * d.pw) + 'px';
    el.style.top = Math.round(d.py + f.y * d.ph) + 'px';
    el.style.width = Math.round(f.w * d.pw) + 'px';
    el.style.height = Math.round(f.h * d.ph) + 'px';
  }
  function drawAll() { for (const key of Object.keys(DEFAULTS)) draw(key); try { window.__drawResourceScanBox?.(); } catch {} }
  function syncVisibility() {
    for (const key of Object.keys(DEFAULTS)) box(key)?.classList.toggle('shown', prefVisible(key));
    syncChecks(); drawAll();
  }
  function setVisible(key, on) { if (!(key in DEFAULTS)) return; setPrefVisible(key, !!on); syncVisibility(); }
  window.__setLinuxOcrRegionVisible = setVisible;

  async function save(key, value) {
    if (!(key in DEFAULTS)) return;
    regions[key] = value || { ...DEFAULTS[key] };
    draw(key);
    try {
      await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linuxOcrRegions: { [key]: value } }),
      });
    } catch {}
  }

  function makeBox(key) {
    const el = document.createElement('div');
    el.className = 'ocr-capture-box';
    el.dataset.ocrRegion = key;
    el.innerHTML = `<span class="ocr-tag">${LABELS[key]} · drag to move</span><span class="ocr-hide">Hide</span><span class="ocr-reset">Reset</span><span class="ocr-grip" title="Drag to resize"></span>`;
    document.body.appendChild(el);
    let mode = null, sx = 0, sy = 0, start = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target?.classList.contains('ocr-hide') || e.target?.classList.contains('ocr-reset')) return;
      mode = e.target?.classList.contains('ocr-grip') ? 'resize' : 'move';
      sx = e.clientX; sy = e.clientY; start = { ...(regions[key] || DEFAULTS[key]) };
      el.classList.add('dragging'); window.overlayApi?.dragLock?.(true);
      try { el.setPointerCapture?.(e.pointerId); } catch {}
      e.preventDefault(); e.stopPropagation();
    });
    el.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const d = display(); if (!d?.pw || !d?.ph) return;
      const dx = (e.clientX - sx) / d.pw, dy = (e.clientY - sy) / d.ph;
      const f = { ...start };
      if (mode === 'move') { f.x += dx; f.y += dy; } else { f.w += dx; f.h += dy; }
      f.w = Math.max(.03, Math.min(1, f.w)); f.h = Math.max(.02, Math.min(1, f.h));
      f.x = Math.max(0, Math.min(1 - f.w, f.x)); f.y = Math.max(0, Math.min(1 - f.h, f.y));
      regions[key] = f; draw(key); e.preventDefault();
    });
    const end = (e) => {
      if (!mode) return;
      mode = null; el.classList.remove('dragging'); window.overlayApi?.dragLock?.(false);
      try { el.releasePointerCapture?.(e.pointerId); } catch {}
      void save(key, regions[key]);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.querySelector('.ocr-hide')?.addEventListener('click', (e) => { e.stopPropagation(); setVisible(key, false); });
    el.querySelector('.ocr-reset')?.addEventListener('click', (e) => { e.stopPropagation(); regions[key] = { ...DEFAULTS[key] }; void save(key, null); });
  }

  const controls = {
    ocrMissionRegion: 'mission', ocrFabricatorRegion: 'fabricator', ocrClaimRegion: 'claimContext',
  };
  function syncChecks() {
    for (const [id, key] of Object.entries(controls)) {
      const el = document.getElementById(id); if (el) el.checked = prefVisible(key);
    }
    try {
      const frame = [...document.querySelectorAll('iframe')].find((f) => /(?:^|\/)mining\.html(?:[?#]|$)/.test(f.getAttribute('src') || ''));
      const cb = frame?.contentDocument?.getElementById('refineryBoxChk'); if (cb) cb.checked = prefVisible('refinery');
    } catch {}
  }

  function injectBlueprintControls() {
    const menu = document.getElementById('cogMenu'); if (!menu || document.getElementById('ocrMissionRegion')) return;
    const anchor = document.getElementById('tgFabCapture')?.closest('label') || document.getElementById('tgMissionOcr')?.closest('label');
    if (!anchor) return;
    let last = anchor;
    for (const [id, key, text] of [
      ['ocrMissionRegion', 'mission', 'Show / adjust Mission OCR area'],
      ['ocrFabricatorRegion', 'fabricator', 'Show / adjust Fabricator OCR area'],
      ['ocrClaimRegion', 'claimContext', 'Show / adjust Claim/context OCR area'],
    ]) {
      const label = document.createElement('label'); label.className = 'cog-opt cog-canvas-only';
      label.innerHTML = `<input type="checkbox" id="${id}" /> ${text}`;
      last.after(label); last = label;
      label.querySelector('input').addEventListener('change', (e) => setVisible(key, e.target.checked));
    }
    syncChecks();
  }

  function injectMiningControl() {
    try {
      const frame = [...document.querySelectorAll('iframe')].find((f) => /(?:^|\/)mining\.html(?:[?#]|$)/.test(f.getAttribute('src') || ''));
      const doc = frame?.contentDocument; if (!doc || doc.getElementById('refineryBoxChk')) return;
      const resource = doc.getElementById('scanBoxChk'); if (!resource) return;
      const label = resource.closest('label');
      const refinery = doc.createElement('label'); refinery.className = 'cog-opt';
      refinery.title = 'Independent RapidOCR region for Refinement Center job timers.';
      refinery.innerHTML = '<input type="checkbox" id="refineryBoxChk" /> Show / adjust Refinery OCR area';
      label.after(refinery);
      const textNode = [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' Show / adjust Resource OCR area';
      const cb = refinery.querySelector('input'); cb.checked = prefVisible('refinery');
      cb.addEventListener('change', () => setVisible('refinery', cb.checked));
    } catch {}
  }

  async function refreshCaptureInfo() {
    try {
      const info = await window.overlayApi?.getOcrCaptureInfo?.();
      if (info?.pw > 0 && info?.ph > 0) captureInfo = info;
    } catch {}
    drawAll();
  }

  async function loadConfig() {
    try {
      const cfg = await (await fetch('/api/config', { cache: 'no-store' })).json();
      for (const key of Object.keys(DEFAULTS)) if (cfg?.linuxOcrRegions?.[key]) regions[key] = cfg.linuxOcrRegions[key];
    } catch {}
    syncVisibility();
  }

  addStyle();
  for (const key of Object.keys(DEFAULTS)) makeBox(key);
  injectBlueprintControls();
  void loadConfig(); void refreshCaptureInfo();
  setInterval(() => {
    injectBlueprintControls(); injectMiningControl();
    if (document.querySelector('.ocr-capture-box.shown') || document.body.classList.contains('scanbox')) void refreshCaptureInfo();
  }, 1200);
})();
