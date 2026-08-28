# RelateCore Marketplace

Das offizielle Plugin-Verzeichnis für RelateCore. Submissions kommen als
automatisch erzeugte Pull Requests vom RelateCore Submission Worker
(GitHub App) — **nur gemergte Plugins werden über `index.json` im
Marketplace sichtbar.**

```
RelateCore App ──▶ Submission Worker ──▶ PR "[Plugin Submission] …" (pending-review)
                                              │
                                        Manual Review (merge = freigegeben)
                                              ▼
                              catalog.yml baut index.json ──▶ jsDelivr CDN ──▶ App
```

---

## Struktur

```
plugins/<plugin-id>/
├── plugin.json        ← Manifest (id, name, version, tabs, themes, logo …)
├── index.html + Assets← die eigentlichen Plugin-Dateien
├── meta.json          ← vom Worker geschrieben (Autor/Submitter, Datum, Tags)
└── reviews/<userId>.json  ← Community-Reviews (eigene PRs)

index.json             ← generiert (NIEMALS von Hand editieren)
schema/plugin.schema.json
scripts/build-catalog.mjs        ← baut index.json
scripts/validate-submission.mjs  ← gleiche Regeln wie der Worker
.github/workflows/validate.yml   ← läuft auf jedem Submission-PR
.github/workflows/catalog.yml    ← baut bei jedem Merge den Katalog neu
```

## Einmaliges Setup

1. **Repo** aus diesem Template-Inhalt anlegen (z. B. `<org>/marketplace`).
2. **GitHub App installieren** (siehe `marketplace-worker/README.md`) —
   Zugriff nur auf dieses Repo.
3. **Labels** anlegen (der Worker setzt `pending-review` beim PR):

   ```bash
   gh label create pending-review --color F9A825 --description "Awaiting manual review"
   gh label create review         --color 1D76DB --description "Community review submission"
   ```

4. **Branch Protection** (optional, empfohlen): für `main` den Check
   „Validate submissions“ als required markieren — dann kann nichts
   Ungültiges gemergt werden.
5. **Owner/Repo** in der App-Konfiguration eintragen
   (`marketplaceService.ts` bzw. localStorage-Overrides) und den
   Worker-Deploy auf dieses Repo zeigen lassen.

## Review-Ablauf

| PR-Typ | Erkennung | Entscheidung |
|---|---|---|
| Plugin-Submission | Titel `[Plugin Submission] …`, Label `pending-review` | **Merge** = plugin geht live (Katalog baut automatisch) · **Close** = abgelehnt |
| Community-Review | Ändert nur `plugins/<id>/reviews/<userId>.json`, Label `review` | Merge = Bewertung zählt |
| Fix/Update | alles andere | normaler Review-Flow |

Der Workflow „Validate submissions“ muss grün sein — er prüft exakt die
Regeln, die auch der Worker durchsetzt (Manifest-Schema, Path-Traversal,
Datei-Typen, Größen), damit das Review sich auf **Inhalt** konzentrieren kann.

## Community-Reviews (Format)

```json
// plugins/<id>/reviews/<clerkUserId>.json
{
  "author": "display-name",
  "rating": 5,
  "body": "Was das Plugin besonders macht — max. 2000 Zeichen.",
  "createdAt": "2026-08-28"
}
```

`build-catalog.mjs` aggregiert daraus `rating` (Durchschnitt) und
`ratingCount` für `index.json`.
