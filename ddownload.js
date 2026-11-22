"use strict";
var plugin = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name2 in all)
      __defProp(target, name2, { get: all[name2], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ddownload.ts
  var ddownload_exports = {};
  __export(ddownload_exports, {
    account: () => account,
    accountRequired: () => accountRequired,
    browserLogin: () => browserLogin,
    check: () => check2,
    config: () => config,
    findDirectLink: () => findDirectLink,
    id: () => id,
    isLoginPage: () => isLoginPage,
    maxParallel: () => maxParallel,
    name: () => name,
    parseAccountPage: () => parseAccountPage,
    patterns: () => patterns,
    resolve: () => resolve
  });

  // lib/xfs.ts
  var XFS_OFFLINE = [
    />\s*(?:[*-]\s*)?File Not Found\s*</i,
    />\s*(?:[*-]\s*)?File Deleted\s*</i,
    /No such file/i,
    />\s*(?:[*-]\s*)?The file was (?:removed|deleted) by/i,
    />[^<>]*Reason for deletion:?/i,
    />\s*(?:[*-]\s*)?The file expired/i
  ];
  var UNITS = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 };
  function parseSize(text) {
    const m = /([\d.,]+)\s*([KMGT]?i?B)\b/i.exec(text.replace(/&nbsp;/g, " "));
    if (!m) return void 0;
    const unit = m[2].toUpperCase().replace("IB", "B");
    const exp = UNITS[unit];
    if (exp === void 0) return void 0;
    const raw = m[1];
    const lastSep = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
    const num = lastSep >= 0 && raw.length - lastSep - 1 !== 3 ? Number(raw.slice(0, lastSep).replace(/[.,]/g, "") + "." + raw.slice(lastSep + 1)) : Number(raw.replace(/[.,]/g, ""));
    return Number.isFinite(num) ? Math.round(num * 1024 ** exp) : void 0;
  }
  function decodeEntities(s) {
    return s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }
  function firstMatch(html, patterns2) {
    for (const re of patterns2) {
      const v = re.exec(html)?.[1]?.trim();
      if (v) return v;
    }
    return void 0;
  }
  function parseFilePage(cfg, status, html) {
    if (status === 404) return { state: "offline" };
    if (status !== 200) return { state: "unknown" };
    if ([...XFS_OFFLINE, ...cfg.offlinePatterns ?? []].some((re) => re.test(html))) {
      return { state: "offline" };
    }
    const name2 = firstMatch(html, cfg.fileNamePatterns);
    const size = firstMatch(html, cfg.sizePatterns);
    if (!name2) return { state: "unknown" };
    return { state: "online", fileName: decodeEntities(name2), size: size ? parseSize(size) : void 0 };
  }
  function fileId(cfg, url) {
    return cfg.linkPattern.exec(url)?.[1]?.toLowerCase();
  }
  function check(cfg, url) {
    const id2 = fileId(cfg, url);
    if (!id2) return { state: "unknown" };
    const res = pullr.http.get(`https://${cfg.domain}/${id2}`);
    return parseFilePage(cfg, res.status, res.body);
  }
  function attr(tag, name2) {
    const m = new RegExp(`\\b${name2}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : void 0;
  }
  function parseForms(html) {
    const forms = [];
    const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      const fields = {};
      const inputs = /<input\b[^>]*>/gi;
      for (let i = inputs.exec(m[2]); i; i = inputs.exec(m[2])) {
        const name2 = attr(i[0], "name");
        const type = (attr(i[0], "type") ?? "text").toLowerCase();
        if (!name2 || (type === "checkbox" || type === "radio") && !/\bchecked\b/i.test(i[0])) continue;
        fields[name2] = attr(i[0], "value") ?? "";
      }
      forms.push({ action: attr(m[1], "action") ?? "", method: (attr(m[1], "method") ?? "GET").toUpperCase(), fields });
    }
    return forms;
  }
  function findForm(html, op) {
    return parseForms(html).find((f) => f.fields.op === op);
  }
  function mergeCookies(session, setCookies) {
    const jar = /* @__PURE__ */ new Map();
    for (const part of (session ?? "").split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k) jar.set(k, v.join("="));
    }
    for (const c of setCookies) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.trim().split("=");
      if (k) jar.set(k, v.join("="));
    }
    return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  // ddownload.ts
  var config = {
    domain: "ddownload.com",
    linkPattern: /^https?:\/\/(?:www\.)?(?:ddownload\.com|ddl\.to)\/(?:d\/|e\/|embed-)?([a-z0-9]{12})(?:[/.]|$)/i,
    fileNamePatterns: [
      /class="[^"]*dk-dl-name"[^>]*>\s*([^<]+?)\s*</,
      // seit 2026-04
      /class="[^"]*dl-file-name"[^>]*>\s*([^<]+?)\s*</,
      /class="[^"]*filename"[^>]*>\s*([^<]+?)\s*</,
      /<h1[^>]*class="file-info-name"[^>]*>([^<]+)<\/h1>/
    ],
    sizePatterns: [
      /class="[^"]*dk-dl-size"[^>]*>\s*([^<]+?)\s*</,
      // seit 2026-04
      /class="[^"]*filesize"[^>]*>\s*([^<]+?)\s*</,
      /class="(?:dl-)?file-size">([^<>"]+)</
    ],
    offlinePatterns: [/>\s*This file was banned by copyright/i]
  };
  var BASE = `https://${config.domain}`;
  var id = "ddownload";
  var name = "ddownload.com";
  var patterns = [
    "(?i)^https?://(?:www\\.)?(?:ddownload\\.com|ddl\\.to)/(?:d/|e/|embed-)?[a-z0-9]{12}(?:[/.]|$)"
  ];
  var maxParallel = 10;
  var accountRequired = true;
  var browserLogin = {
    url: `${BASE}/login`,
    usernameSelector: 'form[name="FL"] input[name="login"]',
    passwordSelector: 'form[name="FL"] input[name="password"]',
    submitSelector: 'form[name="FL"] [type="submit"]',
    sessionCookie: "xfss"
  };
  function check2(url) {
    return check(config, url);
  }
  function isLoginPage(status, location, html) {
    return status >= 300 && status < 400 && /\/login\b|op=login/.test(location ?? "") || /<form[^>]*name="FL"/i.test(html);
  }
  function parseAccountPage(html, now) {
    if (/>\s*Please enter your e-mail/i.test(html)) {
      return { state: "login_failed", message: `E-Mail-Adresse im Account fehlt (${BASE}/?op=my_account)` };
    }
    const premium = /ma-ultimate-pill[^>]*>\s*Ultimate\s*</i.test(html);
    const untilText = />\s*Active until\s+([^<]+?)\s*</i.exec(html)?.[1];
    const parsedUntil = untilText ? Date.parse(untilText) : NaN;
    const premiumUntil = Number.isFinite(parsedUntil) ? Math.floor(parsedUntil / 1e3) : void 0;
    const trafficMb = /data-traffic="(-?\d+)"/.exec(html)?.[1] ?? /id="trafficValue">\s*(-?\d+)\s*</.exec(html)?.[1];
    const trafficLeft = trafficMb !== void 0 ? Number(trafficMb) * 1e3 * 1e3 : void 0;
    if (!premium || premiumUntil !== void 0 && premiumUntil < now) {
      return { state: "expired", premiumUntil, message: "Kein aktives Premium" };
    }
    if (trafficLeft !== void 0 && trafficLeft <= 0) {
      return { state: "traffic_exhausted", until: now + 3600, premiumUntil, trafficLeft: 0, message: "Tageslimit erreicht" };
    }
    return { state: "ready", premiumUntil, trafficLeft };
  }
  function account(a) {
    if (!a.session) pullr.loginRequired();
    const res = pullr.http.get(`${BASE}/?op=my_account`, { headers: { Cookie: a.session }, followRedirects: false });
    if (isLoginPage(res.status, res.headers["location"], res.body)) pullr.loginRequired();
    const session = mergeCookies(a.session, res.cookies);
    return { ...parseAccountPage(res.body, Math.floor(Date.now() / 1e3)), session };
  }
  function findDirectLink(html) {
    return /https?:\/\/[a-z0-9.-]*ucdn\.to\/[^"'<>\s]+/i.exec(html)?.[0] ?? /href="(https?:\/\/[^"]+\/d\/[^"]+\/[^"]+)"/i.exec(html)?.[1];
  }
  function resolve(url, a) {
    if (!a) throw new Error("F\xFCr ddownload.com ist ein Premium-Account n\xF6tig (Free-Modus kommt sp\xE4ter)");
    if (!a.session) pullr.loginRequired();
    const fid = fileId(config, url);
    if (!fid) throw new Error("Link nicht erkannt");
    const headers = { Cookie: a.session };
    const page = pullr.http.get(`${BASE}/${fid}`, { headers, followRedirects: false });
    const location = page.headers["location"];
    if (isLoginPage(page.status, location, page.body)) pullr.loginRequired();
    if (page.status >= 300 && page.status < 400 && location) return { url: location, headers };
    if (page.status === 404) pullr.offline("Datei nicht gefunden");
    const info = parseFilePage(config, page.status, page.body);
    if (info.state === "offline") pullr.offline("Datei wurde gel\xF6scht");
    if (/You have reached the download[- ]limit|traffic limit|not enough traffic/i.test(page.body)) {
      pullr.trafficExhausted("Tageslimit erreicht");
    }
    const form = findForm(page.body, "download2");
    if (!form) {
      const direct2 = findDirectLink(page.body);
      if (direct2) return { url: direct2, headers, fileName: info.fileName };
      throw new Error("Download-Formular nicht gefunden \u2013 Seite hat sich ge\xE4ndert?");
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
    throw new Error("Direktlink nicht gefunden \u2013 Seite hat sich ge\xE4ndert?");
  }
  return __toCommonJS(ddownload_exports);
})();
