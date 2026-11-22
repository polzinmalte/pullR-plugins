/**
 * API, die pullR einem Hoster-Plugin zur Verfügung stellt (siehe src-tauri/src/plugins.rs).
 * Plugins laufen in QuickJS: kein Node, kein DOM, kein fetch.
 */

interface PullrHttpResponse {
  status: number;
  /** Adresse nach allen Weiterleitungen. */
  url: string;
  /** Header-Namen in Kleinbuchstaben (bei mehrfachen Headern der erste). */
  headers: Record<string, string>;
  /** Alle Set-Cookie-Header. */
  cookies: string[];
  body: string;
}

interface PullrRequestOptions {
  headers?: Record<string, string>;
  /** Formularfelder, gesendet als application/x-www-form-urlencoded. */
  form?: Record<string, string>;
  body?: string;
  /** Standard true. Mit false kommt eine Weiterleitung als 3xx mit Location-Header zurück. */
  followRedirects?: boolean;
}

interface Pullr {
  http: {
    /** Synchrone Requests. Werfen bei Netzwerkfehlern. */
    get(url: string, options?: PullrRequestOptions): PullrHttpResponse;
    post(url: string, options?: PullrRequestOptions): PullrHttpResponse;
  };
  log(message: string): void;
  /** Die Datei gibt es nicht mehr. */
  offline(message?: string): never;
  /** Die Sitzung fehlt oder ist abgelaufen: pullR meldet neu an und versucht es noch einmal. */
  loginRequired(): never;
  /** Traffic des Accounts aufgebraucht, optional bis wann (Unix-Sekunden). */
  trafficExhausted(message?: string, until?: number): never;
}

declare const pullr: Pullr;

/** Ergebnis des Prüfens. `unknown`: Ergebnis unklar, der Link bleibt ungeprüft. */
interface CheckResult {
  state: "online" | "offline" | "unknown";
  fileName?: string;
  /** Größe in Bytes. */
  size?: number;
}

/** Zugangsdaten eines Accounts. `session` ist der gespeicherte Cookie-Header, falls angemeldet. */
interface AccountInput {
  username: string;
  password: string;
  session?: string | null;
}

/** Zustand eines Accounts (siehe GLOSSARY.md). */
interface AccountResult {
  state: "ready" | "traffic_exhausted" | "expired" | "login_failed";
  /** Bei traffic_exhausted: wann wieder frei (Unix-Sekunden). */
  until?: number;
  premiumUntil?: number;
  /** Restlicher Traffic in Bytes. */
  trafficLeft?: number;
  message?: string;
  /** Neue Sitzung, falls sie sich geändert hat. */
  session?: string;
}

interface ResolveResult {
  url: string;
  headers?: Record<string, string>;
  fileName?: string;
}

/** Anmeldung im Browser-Fenster für Formulare mit Captcha-Schutz. */
interface BrowserLoginConfig {
  url: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  /** Cookie, der nach erfolgreicher Anmeldung gesetzt ist. */
  sessionCookie: string;
}

/** Was ein Hoster-Plugin exportiert. */
interface HosterPlugin {
  id: string;
  name: string;
  /** Reguläre Ausdrücke (Rust-Regex-Syntax) für die Links dieses Hosters. */
  patterns: string[];
  maxParallel?: number;
  /** Ohne Account kann das Plugin nicht laden. */
  accountRequired?: boolean;
  browserLogin?: BrowserLoginConfig;
  check(url: string): CheckResult;
  account?(account: AccountInput): AccountResult;
  /** Löst einen Link in eine direkt ladbare Anfrage auf. */
  resolve?(url: string, account: AccountInput | null): ResolveResult;
}
