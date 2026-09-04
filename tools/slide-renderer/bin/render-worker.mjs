import fs from "node:fs/promises";
import { renderPresentation } from "../src/render-presentation.mjs";

function args(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) parsed[argv[index].replace(/^--/, "")] = argv[index + 1];
  return parsed;
}

const options = args(process.argv.slice(2));
const model = JSON.parse(await fs.readFile(options.model, "utf8"));
const layout = JSON.parse(await fs.readFile(options.layout, "utf8"));
const result = await renderPresentation({
  model,
  layout,
  patternRoot: options.pattern,
  outputPptx: options.output,
  wireframePng: options.wireframe,
  finalSlidePng: options.final,
  wireframeOnly: options["wireframe-only"] === "true",
  outline: options.outline === "true",
});
await fs.writeFile(options.result, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify({ rendered: true, result: options.result }));
