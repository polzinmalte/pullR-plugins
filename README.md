# pullR-plugins

Hoster-Plugins für [pullR](https://github.com/polzinmalte/pullR), einen Desktop-Download-Manager.

Plugins sind TypeScript, laufen in pullR in einer abgeschotteten QuickJS-Engine und dürfen nur über `pullr.http` ins Netz. Die API steht in [`sdk.d.ts`](sdk.d.ts), das gemeinsame Basis-Plugin für XFileSharing-Hoster in [`lib/xfs.ts`](lib/xfs.ts).

| Plugin | Hoster | Kann |
|---|---|---|
| `ddownload` | ddownload.com, ddl.to | Prüfen, Premium-Account, Auflösen |

## Entwickeln

```sh
pnpm install
pnpm test        # Tests
pnpm typecheck
pnpm build       # dist/*.js
```

Zum Ausprobieren ohne Veröffentlichung die gebaute Datei in `~/Library/Application Support/in.polz.pullr/plugins/` legen. Dort hat sie Vorrang.

## Veröffentlichung

Jeder Push auf `main` testet und baut die Plugins, erzeugt `index.json` mit den SHA-256-Prüfsummen und signiert sie mit Ed25519 (GitHub Actions, Secret `PULLR_SIGNING_KEY`). Das Ergebnis liegt im Branch [`dist`](../../tree/dist). pullR übernimmt nur Plugins mit gültiger Signatur, passender Prüfsumme und höherer Standnummer als zuletzt.

## Lizenz

GPL-3.0-or-later
