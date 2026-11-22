/**
 * API, die pullR einem Hoster-Plugin zur Verfügung stellt (siehe src-tauri/src/plugins.rs).
 * Plugins laufen in QuickJS: kein Node, kein DOM, kein fetch.
 */

interface PullrHttpResponse {
  status: number;
  /** Adresse nach allen Weiterleitungen. */
  url: string;
  /** Header-Namen in Kleinbuchstaben. */
  headers: Record<string, string>;
  body: string;
}

interface Pullr {
  http: {
    /** Synchroner GET-Request. Wirft bei Netzwerkfehlern. */
    get(url: string, options?: { headers?: Record<string, string> }): PullrHttpResponse;
  };
  log(message: string): void;
}

declare const pullr: Pullr;

/** Ergebnis des Prüfens. `unknown`: Ergebnis unklar, der Link bleibt ungeprüft. */
interface CheckResult {
  state: "online" | "offline" | "unknown";
  fileName?: string;
  /** Größe in Bytes. */
  size?: number;
}

/** Was jedes Hoster-Plugin exportiert. */
interface HosterPlugin {
  id: string;
  name: string;
  /** Reguläre Ausdrücke (Rust-Regex-Syntax) für die Links dieses Hosters. */
  patterns: string[];
  check(url: string): CheckResult;
}
