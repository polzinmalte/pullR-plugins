// Erzeugt dist/index.json (Plugins mit SHA-256) und signiert sie mit Ed25519.
// Der private Schlüssel kommt als PEM aus der Umgebungsvariable PULLR_SIGNING_KEY.
// SERIAL (z. B. die Laufnummer von GitHub Actions) muss mit jeder Veröffentlichung steigen;
// pullR lehnt ältere Stände ab.
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const pem = process.env.PULLR_SIGNING_KEY;
const serial = Number(process.env.SERIAL);
if (!pem) throw new Error("PULLR_SIGNING_KEY fehlt");
if (!Number.isInteger(serial) || serial < 1) throw new Error("SERIAL fehlt oder ist ungültig");

const plugins = readdirSync(dist)
  .filter((f) => f.endsWith(".js"))
  .sort()
  .map((file) => ({
    id: file.replace(/\.js$/, ""),
    file,
    sha256: createHash("sha256").update(readFileSync(join(dist, file))).digest("hex"),
  }));

const index = Buffer.from(JSON.stringify({ serial, created: new Date().toISOString(), plugins }, null, 2) + "\n");
const signature = sign(null, index, createPrivateKey(pem)).toString("base64");
writeFileSync(join(dist, "index.json"), index);
writeFileSync(join(dist, "index.json.sig"), signature + "\n");
console.log(`index.json signiert: Stand ${serial}, ${plugins.length} Plugin(s)`);
