"""
Flask web application for the Ethiopian Job Aggregation System.
Simple elelanajobs-style job listing interface.
"""

import sys
import os
import logging

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, render_template, request, redirect, url_for
from models.database import JobDatabase
from config import DATABASE_PATH, SITES

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PER_PAGE = 15


@app.route("/")
def job_list():
    """Main job listing page - elelanajobs style."""
    page = request.args.get("page", 1, type=int)
    q = request.args.get("q", "").strip()
    source = request.args.get("source", "").strip()
    location = request.args.get("location", "").strip()

    if page < 1:
        page = 1
    offset = (page - 1) * PER_PAGE

    db = JobDatabase()
    db.connect()
    try:
        jobs = db.get_jobs(
            source_site=source if source else None,
            search=q if q else None,
            location=location if location else None,
            limit=PER_PAGE,
            offset=offset,
        )
        total = db.count_jobs(
            source_site=source if source else None,
            search=q if q else None,
            location=location if location else None,
        )
        import math
        total_pages = max(1, math.ceil(total / PER_PAGE))
        return render_template(
            "jobs.html",
            jobs=jobs,
            total=total,
            total_pages=total_pages,
            page=page,
            q=q,
            location=location,
            source=source,
            sites=SITES,
        )
    finally:
        db.close()


@app.route("/job/<int:job_id>")
def job_detail(job_id):
    """Job detail page."""
    db = JobDatabase()
    db.connect()
    try:
        job = db.get_job_by_id(job_id)
        if not job:
            return "Job not found", 404
        return render_template("detail.html", job=job)
    finally:
        db.close()


@app.route("/refresh")
def refresh():
    """Trigger a scraper run, then return to the list."""
    try:
        from main import run_scrapers
        run_scrapers()
    except Exception as e:
        logger.error("Refresh failed: %s", e)
    return redirect(url_for("job_list"))


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
