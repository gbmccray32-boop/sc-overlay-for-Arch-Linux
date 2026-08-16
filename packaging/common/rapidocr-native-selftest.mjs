import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const requireFromApp = createRequire(path.join(process.cwd(), "package.json"));
const importFromApp = async (specifier) => import(pathToFileURL(requireFromApp.resolve(specifier)).href);

const [{ default: Ocr }, { default: models }] = await Promise.all([
  importFromApp("@gutenye/ocr-node"),
  importFromApp("@gutenye/ocr-models/node"),
]);

for (const modelPath of [models.detectionPath, models.recognitionPath, models.dictionaryPath]) {
  if (!fs.existsSync(modelPath)) throw new Error(`missing OCR model ${modelPath}`);
}

const engine = await Ocr.create({ models });
if (!engine) throw new Error("RapidOCR engine did not initialize");

console.log("RapidOCR native Linux startup OK", {
  detectionPath: models.detectionPath,
  recognitionPath: models.recognitionPath,
  dictionaryPath: models.dictionaryPath,
});
