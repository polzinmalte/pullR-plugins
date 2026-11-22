// Baut jedes Plugin (*.ts im Wurzelordner) zu einer JS-Datei für die QuickJS-Laufzeit von pullR.
// Ergebnis: <out>/<name>.js mit einem globalen `plugin`-Objekt. Standard-Ausgabe: dist/
import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? join(root, "dist");
const entries = readdirSync(root).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"));

for (const file of entries) {
  await build({
    entryPoints: [join(root, file)],
    outfile: join(out, file.replace(/\.ts$/, ".js")),
    bundle: true,
    format: "iife",
    globalName: "plugin",
    target: "es2020",
    platform: "neutral",
    legalComments: "none",
    logLevel: "warning",
  });
}
console.log(`${entries.length} Plugin(s) gebaut nach ${out}: ${entries.join(", ")}`);
