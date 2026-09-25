import ts from "typescript";

const approved = new Set(["player-location", "player-origin", "trade-finder", "trade-routes", "log-share"]);
const sections = text => text.split(/(?=^\/\/ src\/)/m);
const key = section => /^\/\/ src\/(.+)\.ts\n/.exec(section)?.[1];
function declarations(text) {
  const result = new Set();
  const source = ts.createSourceFile("bundle.mjs", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const add = name => {
    if (!name) return;
    if (ts.isIdentifier(name)) result.add(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) for (const element of name.elements) if (ts.isBindingElement(element)) add(element.name);
  };
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) add(d.name);
    else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) add(statement.name);
    else if (ts.isImportDeclaration(statement)) {
      add(statement.importClause?.name);
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) add(item.name); else if (bindings) add(bindings.name);
    }
  }
  return result;
}

/** Transplant approved module bodies only. All capture and OCR code stays in the baseline. */
export function portCandidate19Server(baseline, current) {
  const oldSections = sections(baseline), newSections = sections(current);
  const oldSelected = oldSections.filter(s => approved.has(key(s)));
  const newSelected = newSections.filter(s => approved.has(key(s)));
  for (const module of approved) {
    const old = oldSelected.filter(s => key(s) === module), fresh = newSelected.filter(s => key(s) === module);
    if (!old.length || old.length !== fresh.length) throw new Error(`Module layout changed: ${module}`);
    for (let i = 0; i < old.length; i++) {
      const imports = s => s.match(/^import .*$/gm)?.join("\n") || "";
      if (imports(old[i]) !== imports(fresh[i])) throw new Error(`Module import aliases changed: ${module}`);
    }
  }
  const oldBindings = declarations(oldSelected.join("\n"));
  const newBindings = declarations(newSelected.join("\n"));
  const unchanged = oldSections.filter(s => !approved.has(key(s))).join("\n");
  const unchangedBindings = declarations(unchanged), identifiers = new Set();
  const visit = node => { if (ts.isIdentifier(node)) identifiers.add(node.text); ts.forEachChild(node, visit); };
  visit(ts.createSourceFile("unchanged.mjs", unchanged, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
  for (const name of oldBindings) if (!newBindings.has(name) && identifiers.has(name)) throw new Error(`Removed external bundle binding: ${name}`);
  for (const name of newBindings) if (unchangedBindings.has(name)) throw new Error(`Bundle binding collision: ${name}`);
  const queues = new Map([...approved].map(name => [name, newSelected.filter(s => key(s) === name)]));
  let output = oldSections.map(s => approved.has(key(s)) ? queues.get(key(s)).shift() : s).join("");
  const replace = (from, to) => {
    if (output.split(from).length !== 2) throw new Error(`Candidate 19 sidecar anchor changed: ${from}`);
    output = output.replace(from, to);
  };
  const config = '  if (url === "/api/config" && req.method === "POST") {\n    const body = await readBody(req);';
  replace(config, config + `\n    // ARCHVERSE_LINUX_WIDGET_HOTKEY_LOCK\n    if (process.platform === "linux") {\n      for (const key of ["widgetHotkeys", "bindingHotkey", "miningHotkey", "webViewHotkey", "notepadHotkey"]) delete body[key];\n    }`);
  const display = '      display: { hwAccel: config.hwAccel === true, amdCompat: config.amdCompat === true, theme: config.theme || "mobiglas" },';
  const diagnostics = current.match(/^      logSharing: .*$/m)?.[0];
  if (!diagnostics || !newBindings.has("logShareFault")) throw new Error("Missing log-sharing diagnostics");
  replace(display, diagnostics + "\n" + display);
  return output;
}
