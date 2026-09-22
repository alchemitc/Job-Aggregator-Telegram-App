"""
Export jobs from the SQLite database to a JSON file for the web UI.
Called automatically after each scrape run (see main.py).
Public-data fields only - internal fields (raw_text, content_hash) are excluded.
"""

import sys
import os
import json
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.database import JobDatabase

# Default export target: the Next.js app data folder
DEFAULT_EXPORT_PATH = "/home/z/my-project/src/data/jobs.json"

# Fields included in the export (public display data)
EXPORT_FIELDS = [
    "id", "source_site", "title", "company", "location", "salary",
    "salary_currency", "job_type", "category", "description",
    "requirements", "deadline", "posted_date", "apply_url",
    "apply_method", "source_url", "is_gov_exam",
]


def export_jobs(export_path: str = None) -> dict:
    """Export all jobs to JSON. Returns summary stats."""
    export_path = export_path or DEFAULT_EXPORT_PATH

    db = JobDatabase()
    db.connect()
    try:
        rows = db.get_all_jobs(limit=10000)
    finally:
        db.close()

    # Keep only public fields
    jobs = []
    for row in rows:
        job = {field: row.get(field) for field in EXPORT_FIELDS}
        jobs.append(job)

    # Ensure the target directory exists
    os.makedirs(os.path.dirname(export_path), exist_ok=True)

    payload = {
        "exported_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "count": len(jobs),
        "jobs": jobs,
    }

    with open(export_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    size_kb = os.path.getsize(export_path) / 1024
    logging.info("Exported %d jobs to %s (%.1f KB)", len(jobs), export_path, size_kb)
    return {"count": len(jobs), "path": export_path, "size_kb": size_kb}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    path = sys.argv[1] if len(sys.argv) > 1 else None
    result = export_jobs(path)
    print(f"Exported {result['count']} jobs -> {result['path']} ({result['size_kb']:.1f} KB)")
