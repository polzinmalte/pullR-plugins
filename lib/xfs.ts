/**
 * Basis-Plugin für Hoster auf Grundlage von „XFileSharing Pro“ (XFS).
 * Ein konkretes Hoster-Plugin liefert nur seine Besonderheiten als `XfsConfig`.
 */

export interface XfsConfig {
  /** Hauptdomain, auf die alle Links normalisiert werden, z. B. "ddownload.com". */
  domain: string;
  /** Muster für die Links; die erste Gruppe muss die Datei-ID sein. */
  linkPattern: RegExp;
  /** Erste Gruppe jedes Musters ist der Dateiname. Neuere zuerst. */
  fileNamePatterns: RegExp[];
  /** Erste Gruppe jedes Musters ist die Größe als Text („1.16 GB“). */
  sizePatterns: RegExp[];
  /** Zusätzliche Merkmale gelöschter Dateien. */
  offlinePatterns?: RegExp[];
}

/** Merkmale gelöschter Dateien, die alle XFS-Hoster gemeinsam haben. */
const XFS_OFFLINE: RegExp[] = [
  />\s*(?:[*-]\s*)?File Not Found\s*</i,
  />\s*(?:[*-]\s*)?File Deleted\s*</i,
  /No such file/i,
  />\s*(?:[*-]\s*)?The file was (?:removed|deleted) by/i,
  />[^<>]*Reason for deletion:?/i,
  />\s*(?:[*-]\s*)?The file expired/i,
];

const UNITS: Record<string, number> = { B: 0, KB: 1, MB: 2, GB: 3, TB: 4 };

/** „1.16 GB“ → Bytes. XFS-Hoster rechnen mit 1024er-Einheiten, auch wenn „MB“ dransteht. */
export function parseSize(text: string): number | undefined {
  const m = /([\d.,]+)\s*([KMGT]?i?B)\b/i.exec(text.replace(/&nbsp;/g, " "));
  if (!m) return undefined;
  const unit = m[2].toUpperCase().replace("IB", "B");
  const exp = UNITS[unit];
  if (exp === undefined) return undefined;
  // „1,234.5“ und „1.234,5“: Das letzte Trennzeichen ist das Dezimaltrennzeichen.
  const raw = m[1];
  const lastSep = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
  const num =
    lastSep >= 0 && raw.length - lastSep - 1 !== 3
      ? Number(raw.slice(0, lastSep).replace(/[.,]/g, "") + "." + raw.slice(lastSep + 1))
      : Number(raw.replace(/[.,]/g, ""));
  return Number.isFinite(num) ? Math.round(num * 1024 ** exp) : undefined;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const v = re.exec(html)?.[1]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Wertet eine XFS-Dateiseite aus. Ohne Netzwerk, damit es sich testen lässt. */
export function parseFilePage(cfg: XfsConfig, status: number, html: string): CheckResult {
  if (status === 404) return { state: "offline" };
  if (status !== 200) return { state: "unknown" };
  if ([...XFS_OFFLINE, ...(cfg.offlinePatterns ?? [])].some((re) => re.test(html))) {
    return { state: "offline" };
  }
  const name = firstMatch(html, cfg.fileNamePatterns);
  const size = firstMatch(html, cfg.sizePatterns);
  if (!name) return { state: "unknown" };
  return { state: "online", fileName: decodeEntities(name), size: size ? parseSize(size) : undefined };
}

export function fileId(cfg: XfsConfig, url: string): string | undefined {
  return cfg.linkPattern.exec(url)?.[1]?.toLowerCase();
}

/** Prüfen über die Dateiseite. */
export function check(cfg: XfsConfig, url: string): CheckResult {
  const id = fileId(cfg, url);
  if (!id) return { state: "unknown" };
  const res = pullr.http.get(`https://${cfg.domain}/${id}`);
  return parseFilePage(cfg, res.status, res.body);
}

export interface HtmlForm {
  action: string;
  method: string;
  fields: Record<string, string>;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : undefined;
}

/** Alle Formulare einer Seite mit ihren Feldern (input mit name). */
export function parseForms(html: string): HtmlForm[] {
  const forms: HtmlForm[] = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const fields: Record<string, string> = {};
    const inputs = /<input\b[^>]*>/gi;
    for (let i = inputs.exec(m[2]); i; i = inputs.exec(m[2])) {
      const name = attr(i[0], "name");
      const type = (attr(i[0], "type") ?? "text").toLowerCase();
      if (!name || ((type === "checkbox" || type === "radio") && !/\bchecked\b/i.test(i[0]))) continue;
      fields[name] = attr(i[0], "value") ?? "";
    }
    forms.push({ action: attr(m[1], "action") ?? "", method: (attr(m[1], "method") ?? "GET").toUpperCase(), fields });
  }
  return forms;
}

/** Das XFS-Formular für einen Schritt, z. B. op=download2. */
export function findForm(html: string, op: string): HtmlForm | undefined {
  return parseForms(html).find((f) => f.fields.op === op);
}

/** Header-Wert für mehrere Cookies aus Set-Cookie-Headern und einer bestehenden Sitzung. */
export function mergeCookies(session: string | null | undefined, setCookies: string[]): string {
  const jar = new Map<string, string>();
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
