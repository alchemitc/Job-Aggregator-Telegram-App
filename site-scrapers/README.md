# Ethiopian Site Scrapers (Python)

Standalone Python scrapers that pull jobs directly from 6 Ethiopian job boards.
This complements the Telegram pipeline in `server/` — Telegram channels are crawled
by the Node app, and these site scrapers cover the same boards' web listings so the
database can be filled from both sources.

## Sites covered (all verified against live HTML/API)

| Site | Method | Notes |
|------|--------|-------|
| etcareers.com | JSON API (`/jobs?format=json`) | One request returns everything (~316 jobs) |
| ethiojobs.net | Next.js `__NEXT_DATA__` | Jobs in `props.pageProps.jobs.data` |
| kebenajobs.com | HTML (`li.job_listing`, Jobify theme) | Homepage, not `/jobs` |
| elelanajobs.com | HTML (`li.job_listing`, Jobify theme) | Homepage, not `/jobs` |
| geezjobs.com | HTML cards (`div[class*=card]`) | `/search-jobs`, not `/jobs` |
| effoysira.com | HTML (`article.wp-block-post`, WP block theme) | `/jobs` |

## Setup

```bash
cd site-scrapers
pip install -r requirements.txt
python main.py            # scrape all 6 sites -> jobs.db
python web_app.py         # optional: local Flask UI at localhost:5000
```

## Design principles

- **No fabricated data.** If a field (salary, type, level) is not present on the
  source page, it is stored as `Not specified`. Nothing is ever guessed.
- **Deduplication** via `content_hash` — re-running never creates duplicates.
- **Rate limiting** — 2 seconds between HTTP requests per site, with retries.
- Field mappings only where the source itself uses codes (e.g. ethiojobs numeric
  type -> Full-time / Part-time).

## Integration with the Node app

`export_json.py` dumps the `jobs` table to a JSON file (public fields only) so the
web UI can consume the scraped data without touching SQLite:

```bash
python export_json.py     # writes jobs.json
```

`main.py` runs this export automatically after every scrape.

## Files

```
config.py            # verified URLs + site settings
main.py              # CLI runner (python main.py [--site ethiojobs])
web_app.py           # small Flask UI (list + detail + refresh)
export_json.py       # SQLite -> jobs.json exporter
models/database.py   # SQLite schema + dedup
scrapers/base.py     # base class: rate limit, retries, text cleanup
scrapers/<site>.py   # one scraper per site
templates/           # Flask UI templates (elelanajobs-style)
```
