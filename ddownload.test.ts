import { describe, expect, it } from "vitest";
import { check, config, patterns } from "./ddownload";
import { fileId, parseFilePage, parseSize } from "./lib/xfs";

// Ausschnitte im Aufbau der echten Dateiseite (Stand 2026-11).
const ONLINE = `<div class="dk-dl-info">
  <div class="dk-dl-name" title="Mein Film.part1.rar">Mein Film.part1.rar</div>
  <div class="dk-dl-size">1.16 GB</div></div>`;
const OFFLINE = `<div class="dk-err"><h2>File Not Found</h2></div>`;

describe("ddownload", () => {
  it("liest Name und Größe der Dateiseite", () => {
    expect(parseFilePage(config, 200, ONLINE)).toEqual({
      state: "online",
      fileName: "Mein Film.part1.rar",
      size: Math.round(1.16 * 1024 ** 3),
    });
  });

  it("erkennt gelöschte Dateien", () => {
    expect(parseFilePage(config, 200, OFFLINE).state).toBe("offline");
    expect(parseFilePage(config, 200, "<b>Oops!</b> This file was banned by copyright owner").state).toBe("offline");
    expect(parseFilePage(config, 404, "").state).toBe("offline");
  });

  it("bleibt bei unbekannter Seite oder Serverfehler ungeprüft", () => {
    expect(parseFilePage(config, 200, "<html>Wartungsarbeiten</html>").state).toBe("unknown");
    expect(parseFilePage(config, 503, ONLINE).state).toBe("unknown");
  });

  it("holt die Datei-ID aus allen Link-Formen", () => {
    for (const url of [
      "https://ddownload.com/c28341sggsvh",
      "https://ddownload.com/c28341sggsvh/Mein_Film.part1.rar",
      "https://ddl.to/d/C28341SGGSVH",
      "https://www.ddownload.com/embed-c28341sggsvh.html",
    ]) {
      expect(fileId(config, url)).toBe("c28341sggsvh");
    }
    expect(fileId(config, "https://ddownload.com/premium")).toBeUndefined();
  });

  it("fragt die normalisierte Dateiseite ab", () => {
    const calls: string[] = [];
    (globalThis as { pullr?: unknown }).pullr = {
      http: {
        get: (url: string) => {
          calls.push(url);
          return { status: 200, url, headers: {}, body: ONLINE };
        },
      },
      log: () => {},
    };
    expect(check("https://ddl.to/d/c28341sggsvh/x.rar").state).toBe("online");
    expect(calls).toEqual(["https://ddownload.com/c28341sggsvh"]);
  });

  it("Link-Muster für Rust und TypeScript stimmen überein", () => {
    // (?i) versteht JS-RegExp nicht als Inline-Flag, daher hier mit Flag i nachbauen.
    const rust = new RegExp(patterns[0].replace("(?i)", ""), "i");
    for (const url of ["https://ddownload.com/c28341sggsvh", "https://ddl.to/d/c28341sggsvh", "https://ddownload.com/premium"]) {
      expect(rust.test(url)).toBe(config.linkPattern.test(url));
    }
  });
});

describe("parseSize", () => {
  it.each([
    ["1.16 GB", Math.round(1.16 * 1024 ** 3)],
    ["700 MB", 700 * 1024 ** 2],
    ["1,5 GB", Math.round(1.5 * 1024 ** 3)],
    ["1,234 KB", 1234 * 1024],
    ["512 B", 512],
    ["2.5&nbsp;GiB", Math.round(2.5 * 1024 ** 3)],
  ])("%s", (text, bytes) => expect(parseSize(text)).toBe(bytes));

  it("ohne Einheit unbekannt", () => expect(parseSize("groß")).toBeUndefined());
});
