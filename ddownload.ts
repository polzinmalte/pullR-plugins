/** Hoster-Plugin für ddownload.com (auch ddl.to). Baut auf dem XFS-Basis-Plugin auf. */

import * as xfs from "./lib/xfs";

export const config: xfs.XfsConfig = {
  domain: "ddownload.com",
  linkPattern: /^https?:\/\/(?:www\.)?(?:ddownload\.com|ddl\.to)\/(?:d\/|e\/|embed-)?([a-z0-9]{12})(?:[/.]|$)/i,
  fileNamePatterns: [
    /class="[^"]*dk-dl-name"[^>]*>\s*([^<]+?)\s*</, // seit 2026-04
    /class="[^"]*dl-file-name"[^>]*>\s*([^<]+?)\s*</,
    /class="[^"]*filename"[^>]*>\s*([^<]+?)\s*</,
    /<h1[^>]*class="file-info-name"[^>]*>([^<]+)<\/h1>/,
  ],
  sizePatterns: [
    /class="[^"]*dk-dl-size"[^>]*>\s*([^<]+?)\s*</, // seit 2026-04
    /class="[^"]*filesize"[^>]*>\s*([^<]+?)\s*</,
    /class="(?:dl-)?file-size">([^<>"]+)</,
  ],
  offlinePatterns: [/>\s*This file was banned by copyright/i],
};

const BASE = `https://${config.domain}`;

export const id = "ddownload";
export const name = "ddownload.com";
/** Rust-Regex-Syntax (siehe sdk.d.ts). */
export const patterns = [
  "(?i)^https?://(?:www\\.)?(?:ddownload\\.com|ddl\\.to)/(?:d/|e/|embed-)?[a-z0-9]{12}(?:[/.]|$)",
];
/** Premium: bis zu 10 Dateien gleichzeitig (laut JDownloader). */
export const maxParallel = 10;
/** Free-Modus (Wartezeit, Captcha) kommt später. */
export const accountRequired = true;
export const browserLogin: BrowserLoginConfig = {
  url: `${BASE}/login`,
  usernameSelector: 'form[name="FL"] input[name="login"]',
  passwordSelector: 'form[name="FL"] input[name="password"]',
  submitSelector: 'form[name="FL"] [type="submit"]',
  sessionCookie: "xfss",
};

export function check(url: string): CheckResult {
  return xfs.check(config, url);
}

/** Seite verlangt eine Anmeldung (Login-Formular oder Weiterleitung dorthin). */
export function isLoginPage(status: number, location: string | undefined, html: string): boolean {
  return (status >= 300 && status < 400 && /\/login\b|op=login/.test(location ?? "")) || /<form[^>]*name="FL"/i.test(html);
}

/** Wertet „Mein Account“ aus. `now` in Unix-Sekunden. */
export function parseAccountPage(html: string, now: number): AccountResult {
  if (/>\s*Please enter your e-mail/i.test(html)) {
    return { state: "login_failed", message: `E-Mail-Adresse im Account fehlt (${BASE}/?op=my_account)` };
  }
  const premium = /ma-ultimate-pill[^>]*>\s*Ultimate\s*</i.test(html);
  const untilText = />\s*Active until\s+([^<]+?)\s*</i.exec(html)?.[1];
  const parsedUntil = untilText ? Date.parse(untilText) : NaN;
  const premiumUntil = Number.isFinite(parsedUntil) ? Math.floor(parsedUntil / 1000) : undefined;
  const trafficMb = /data-traffic="(-?\d+)"/.exec(html)?.[1] ?? /id="trafficValue">\s*(-?\d+)\s*</.exec(html)?.[1];
  // ddownload rechnet hier mit 1000er-Einheiten (wie JDownloader).
  const trafficLeft = trafficMb !== undefined ? Number(trafficMb) * 1000 * 1000 : undefined;

  if (!premium || (premiumUntil !== undefined && premiumUntil < now)) {
    return { state: "expired", premiumUntil, message: "Kein aktives Premium" };
  }
  if (trafficLeft !== undefined && trafficLeft <= 0) {
    // Wann das Tageslimit zurückgesetzt wird, steht nicht auf der Seite: stündlich neu prüfen.
    return { state: "traffic_exhausted", until: now + 3600, premiumUntil, trafficLeft: 0, message: "Tageslimit erreicht" };
  }
  return { state: "ready", premiumUntil, trafficLeft };
}

export function account(a: AccountInput): AccountResult {
  if (!a.session) pullr.loginRequired();
  const res = pullr.http.get(`${BASE}/?op=my_account`, { headers: { Cookie: a.session! }, followRedirects: false });
  if (isLoginPage(res.status, res.headers["location"], res.body)) pullr.loginRequired();
  const session = xfs.mergeCookies(a.session, res.cookies);
  return { ...parseAccountPage(res.body, Math.floor(Date.now() / 1000)), session };
}

/** Direktlink aus einer Seite nach dem Download-Formular. */
export function findDirectLink(html: string): string | undefined {
  return (
    /https?:\/\/[a-z0-9.-]*ucdn\.to\/[^"'<>\s]+/i.exec(html)?.[0] ??
    /href="(https?:\/\/[^"]+\/d\/[^"]+\/[^"]+)"/i.exec(html)?.[1]
  );
}

export function resolve(url: string, a: AccountInput | null): ResolveResult {
  if (!a) throw new Error("Für ddownload.com ist ein Premium-Account nötig (Free-Modus kommt später)");
  if (!a.session) pullr.loginRequired();
  const fid = xfs.fileId(config, url);
  if (!fid) throw new Error("Link nicht erkannt");
  const headers = { Cookie: a.session! };

  const page = pullr.http.get(`${BASE}/${fid}`, { headers, followRedirects: false });
  const location = page.headers["location"];
  if (isLoginPage(page.status, location, page.body)) pullr.loginRequired();
  // „Direkte Downloads“ im Account aktiviert: Die Dateiseite leitet direkt zur Datei weiter.
  if (page.status >= 300 && page.status < 400 && location) return { url: location, headers };
  if (page.status === 404) pullr.offline("Datei nicht gefunden");

  const info = xfs.parseFilePage(config, page.status, page.body);
  if (info.state === "offline") pullr.offline("Datei wurde gelöscht");
  if (/You have reached the download[- ]limit|traffic limit|not enough traffic/i.test(page.body)) {
    pullr.trafficExhausted("Tageslimit erreicht");
  }

  const form = xfs.findForm(page.body, "download2");
  if (!form) {
    const direct = findDirectLink(page.body);
    if (direct) return { url: direct, headers, fileName: info.fileName };
    throw new Error("Download-Formular nicht gefunden – Seite hat sich geändert?");
  }
  const action = form.action && form.action.startsWith("http") ? form.action : `${BASE}/${fid}`;
  const post = pullr.http.post(action, { headers, form: form.fields, followRedirects: false });
  const postLocation = post.headers["location"];
  if (post.status >= 300 && post.status < 400 && postLocation) {
    if (/\/login\b|op=login/.test(postLocation)) pullr.loginRequired();
    return { url: postLocation, headers, fileName: info.fileName };
  }
  const direct = findDirectLink(post.body);
  if (direct) return { url: direct, headers, fileName: info.fileName };
  if (/You have reached the download[- ]limit|traffic limit|not enough traffic/i.test(post.body)) {
    pullr.trafficExhausted("Tageslimit erreicht");
  }
  throw new Error("Direktlink nicht gefunden – Seite hat sich geändert?");
}
