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

import { account, findDirectLink, isLoginPage, parseAccountPage, resolve } from "./ddownload";
import { findForm, mergeCookies, parseForms } from "./lib/xfs";

const NOW = Date.UTC(2026, 10, 22) / 1000;
const ACCOUNT_OK = `<span class="ma-ultimate-pill">Ultimate</span><div>Active until 22 December 2026</div>
  <div class="bar" data-traffic="150000"></div>`;

describe("Account", () => {
  it("Premium mit Traffic ist bereit", () => {
    const r = parseAccountPage(ACCOUNT_OK, NOW);
    expect(r.state).toBe("ready");
    expect(r.trafficLeft).toBe(150_000 * 1e6);
    expect(r.premiumUntil).toBe(Math.floor(Date.parse("22 December 2026") / 1000));
  });

  it("ohne Premium oder abgelaufen", () => {
    expect(parseAccountPage(`<span>Free</span>`, NOW).state).toBe("expired");
    expect(parseAccountPage(ACCOUNT_OK.replace("2026", "2025"), NOW).state).toBe("expired");
  });

  it("Traffic aufgebraucht, auch negativ", () => {
    const r = parseAccountPage(ACCOUNT_OK.replace("150000", "-12"), NOW);
    expect(r.state).toBe("traffic_exhausted");
    expect(r.until).toBe(NOW + 3600);
  });

  it("fehlende E-Mail", () => {
    expect(parseAccountPage(`<b>Please enter your e-mail</b>`, NOW).state).toBe("login_failed");
  });

  it("erkennt Login-Seite und Weiterleitung", () => {
    expect(isLoginPage(200, undefined, `<form method="POST" name="FL">`)).toBe(true);
    expect(isLoginPage(302, "https://ddownload.com/login", "")).toBe(true);
    expect(isLoginPage(200, undefined, ACCOUNT_OK)).toBe(false);
  });
});

type Handler = (method: string, url: string, opts: PullrRequestOptions) => Partial<PullrHttpResponse>;
const calls: { method: string; url: string; opts: PullrRequestOptions }[] = [];
function mockHttp(h: Handler) {
  calls.length = 0;
  const req = (method: string) => (url: string, opts: PullrRequestOptions = {}) => {
    calls.push({ method, url, opts });
    return { status: 200, url, headers: {}, cookies: [], body: "", ...h(method, url, opts) };
  };
  (globalThis as { pullr?: unknown }).pullr = {
    http: { get: req("GET"), post: req("POST") },
    log: () => {},
    offline: (m?: string) => { throw new Error("PULLR_OFFLINE:" + m); },
    loginRequired: () => { throw new Error("PULLR_LOGIN_REQUIRED:"); },
    trafficExhausted: (m?: string) => { throw new Error("PULLR_TRAFFIC:0:" + m); },
  };
}

const ACC: AccountInput = { username: "ich", password: "pw", session: "xfss=abc" };
const URL1 = "https://ddownload.com/c28341sggsvh/Mein.part1.rar";
const FORM_PAGE = `${ONLINE}<form method="POST" action=""><input type="hidden" name="op" value="download2">
  <input type="hidden" name="id" value="c28341sggsvh"><input type="hidden" name="rand" value="r1">
  <button type="submit">Download</button></form>`;

describe("Auflösen mit Premium", () => {
  it("direkte Downloads: Weiterleitung der Dateiseite", () => {
    mockHttp(() => ({ status: 302, headers: { location: "https://s1.ucdn.to/d/xyz/Mein.part1.rar" } }));
    expect(resolve(URL1, ACC)).toEqual({ url: "https://s1.ucdn.to/d/xyz/Mein.part1.rar", headers: { Cookie: "xfss=abc" } });
    expect(calls[0].opts.followRedirects).toBe(false);
    expect(calls[0].url).toBe("https://ddownload.com/c28341sggsvh");
  });

  it("über das download2-Formular", () => {
    mockHttp((method) =>
      method === "GET" ? { body: FORM_PAGE } : { status: 302, headers: { location: "https://s2.ucdn.to/d/abc/Mein.part1.rar" } },
    );
    const r = resolve(URL1, ACC);
    expect(r.url).toBe("https://s2.ucdn.to/d/abc/Mein.part1.rar");
    expect(r.fileName).toBe("Mein Film.part1.rar");
    expect(calls[1]).toMatchObject({ method: "POST", url: "https://ddownload.com/c28341sggsvh" });
    expect(calls[1].opts.form).toEqual({ op: "download2", id: "c28341sggsvh", rand: "r1" });
  });

  it("Direktlink im HTML nach dem Formular", () => {
    mockHttp((method) => (method === "GET" ? { body: FORM_PAGE } : { body: `<a href="https://s3.ucdn.to/d/q/x.rar">Download</a>` }));
    expect(resolve(URL1, ACC).url).toBe("https://s3.ucdn.to/d/q/x.rar");
  });

  it("abgelaufene Sitzung, gelöschte Datei, Tageslimit", () => {
    mockHttp(() => ({ status: 302, headers: { location: "https://ddownload.com/login" } }));
    expect(() => resolve(URL1, ACC)).toThrow("PULLR_LOGIN_REQUIRED");
    mockHttp(() => ({ body: `<h2>File Not Found</h2>` }));
    expect(() => resolve(URL1, ACC)).toThrow("PULLR_OFFLINE");
    mockHttp(() => ({ body: `${ONLINE} You have reached the download-limit` }));
    expect(() => resolve(URL1, ACC)).toThrow("PULLR_TRAFFIC");
  });

  it("ohne Account oder Sitzung", () => {
    expect(() => resolve(URL1, null)).toThrow("Premium-Account");
    expect(() => resolve(URL1, { ...ACC, session: null })).toThrow("PULLR_LOGIN_REQUIRED");
  });

  it("Account-Prüfung übernimmt neue Cookies", () => {
    mockHttp(() => ({ body: ACCOUNT_OK, cookies: ["lang=german; path=/"] }));
    const r = account(ACC);
    expect(r.state).toBe("ready");
    expect(r.session).toBe("xfss=abc; lang=german");
  });
});

describe("XFS-Helfer", () => {
  it("liest Formulare samt angehakter Checkboxen", () => {
    const forms = parseForms(`<form action="/x" method="post"><input name="a" value="1"><input type="checkbox" name="b" value="2">
      <input type="checkbox" name="c" value="3" checked><input name='d' value='&amp;'></form>`);
    expect(forms).toEqual([{ action: "/x", method: "POST", fields: { a: "1", c: "3", d: "&" } }]);
    expect(findForm(FORM_PAGE, "download2")?.fields.id).toBe("c28341sggsvh");
  });

  it("führt Cookies zusammen", () => {
    expect(mergeCookies("a=1; b=2", ["b=3; path=/", "c=4"])).toBe("a=1; b=3; c=4");
  });

  it("findet Direktlinks", () => {
    expect(findDirectLink(`x https://s9.ucdn.to/d/aa/f.rar y`)).toBe("https://s9.ucdn.to/d/aa/f.rar");
    expect(findDirectLink("nichts")).toBeUndefined();
  });
});
