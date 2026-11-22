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

export const id = "ddownload";
export const name = "ddownload.com";
/** Rust-Regex-Syntax (siehe sdk.d.ts). */
export const patterns = [
  "(?i)^https?://(?:www\\.)?(?:ddownload\\.com|ddl\\.to)/(?:d/|e/|embed-)?[a-z0-9]{12}(?:[/.]|$)",
];

export function check(url: string): CheckResult {
  return xfs.check(config, url);
}
