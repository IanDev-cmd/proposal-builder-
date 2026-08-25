# WEOTT Nexus architecture

Nexus is a React workspace SPA plus a Flask proposal engine. Quotes live in the browser database and are mirrored as JSON on the engine so every session can load the same list.

```mermaid
flowchart LR
  subgraph spa [Workspace SPA]
    Pages[Pages: Leads / Quote Builder / Saved Quotes / Quote Review / Proposal Doc]
    Stores[IndexedDB nexus-workspace]
    Pages --> Stores
  end

  subgraph engine [Proposal engine]
    Generate[POST /generate PDF]
    Workspace["/workspace/quotes JSON store"]
    Templates[PDF templates + inserts]
    Generate --> Templates
    Workspace --> Disk[(data/workspace/quotes)]
  end

  subgraph sheets [Google Apps Script]
    LeadsAPI[Leads / rates / notes]
  end

  Pages -->|hydrate + PUT quotes| Workspace
  Pages -->|generate proposal PDF| Generate
  Pages -->|lead list and cost rates| LeadsAPI
  Share[Gmail / WhatsApp / Drive / Dropbox] -->|quote page HTML + blank To + URL| QuoteReview[Full quote page]
  QuoteReview -->|Approve / Disapprove| Stores
  Stores -->|sync reviewStatus| Workspace
```

```mermaid
flowchart TD
  Save[Save Quote] --> Pending[reviewStatus pending]
  Pending --> Share[Share quote page]
  Share --> Link["/saved-quotes/:id"]
  Link --> ReviewPage[Full quote: costing + Approve / Disapprove]
  ReviewPage -->|approved| Approved[(Approved Quotes tab)]
  ReviewPage -->|disapproved| Disapproved[(Disapproved Quotes tab)]
  Pending --> AllTab[All Quotes tab = neither approved nor disapproved]
```

## Runtime pieces

| Layer | Location | Role |
| --- | --- | --- |
| UI pages | `src/pages` | Routes for leads, quote builder, saved quotes, quote review, proposal PDF, settings |
| Components | `src/components` | Shared UI: cost accordion, quote document, share buttons, lead timeline |
| Domain libs | `src/lib` | Costing, prefill, share, review status, IndexedDB, cloud sync |
| Browser DB | IndexedDB `nexus-workspace` v3 | `savedQuotes` (indexed by `leadKey`, `savedAt`, `reviewStatus`), leads, proposals |
| Engine workspace | `workspace_store.py` | JSON quote files including `reviewStatus` / `reviewedAt` |
| PDF engine | Flask `/generate` | Overlay-only proposal PDFs from templates |

## Quote share contract

- Attachment is the **quote page** (HTML snapshot of the full quote), not a proposal PDF and not a CSV.
- Gmail **To is blank** — never the lead or contact email.
- The link opens `/saved-quotes/:id`, the full quote with **Approve Quote** and **Disapprove Quote**.
- Saved Quotes toggles: **All Quotes** (pending), **Approved Quotes**, **Disapproved Quotes**.

## Data flow for review status

1. New saves default to `pending`.
2. Approve/Disapprove writes `reviewStatus` + `reviewedAt` to IndexedDB and `PUT /workspace/quotes/:id`.
3. Sync merges form snapshots by `savedAt` and review fields by `reviewedAt`, so a later approval is not overwritten by an older costing save.
