"""
Main runner script for the Ethiopian Job Aggregation System.
Orchestrates all scrapers and saves results to the database.
"""

import sys
import os
import logging
import argparse
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import SITES, LOG_LEVEL, LOG_FORMAT
from models.database import JobDatabase

# Configure logging
logging.basicConfig(level=getattr(logging, LOG_LEVEL), format=LOG_FORMAT)
logger = logging.getLogger(__name__)


def get_scraper(site_key: str, site_config: dict):
    """Get the appropriate scraper instance for a site."""
    scraper_type = site_config.get("scraper_type", "static")

    if site_key == "effoysira":
        from scrapers.effoysira import EffoySiraScraper
        return EffoySiraScraper(site_key, site_config)
    elif site_key == "geezjobs":
        from scrapers.geezjobs import GeezJobsScraper
        return GeezJobsScraper(site_key, site_config)
    elif site_key == "etcareers":
        from scrapers.etcareers import ETCareersScraper
        return ETCareersScraper(site_key, site_config)
    elif site_key == "ethiojobs":
        from scrapers.ethiojobs import EthioJobsScraper
        return EthioJobsScraper(site_key, site_config)
    elif site_key == "kebenajobs":
        from scrapers.kebenajobs import KebenaJobsScraper
        return KebenaJobsScraper(site_key, site_config)
    elif site_key == "elelanajobs":
        from scrapers.elelanajobs import ElelanaJobsScraper
        return ElelanaJobsScraper(site_key, site_config)
    else:
        logger.warning("No scraper available for site: %s", site_key)
        return None


def run_scrapers(site_keys: list = None, db_path: str = None):
    """
    Run scrapers for specified sites (or all enabled sites).
    Returns summary statistics.
    """
    db = JobDatabase(db_path)
    db.connect()
    db.create_tables()

    if site_keys is None:
        site_keys = [k for k, v in SITES.items() if v.get("enabled", True)]

    results = {}
    for site_key in site_keys:
        site_config = SITES.get(site_key)
        if not site_config:
            logger.error("Unknown site: %s", site_key)
            results[site_key] = {"error": "Unknown site"}
            continue

        if not site_config.get("enabled", True):
            logger.info("Site %s is disabled, skipping", site_key)
            results[site_key] = {"skipped": True}
            continue

        logger.info("=" * 60)
        logger.info("Starting scraper for: %s (%s)", site_key, site_config.get("name", ""))
        logger.info("=" * 60)

        try:
            scraper = get_scraper(site_key, site_config)
            if not scraper:
                results[site_key] = {"error": "No scraper available"}
                continue

            jobs = scraper.scrape_jobs()
            logger.info("Found %d jobs from %s", len(jobs), site_key)

            # Insert into database
            insert_result = db.insert_jobs(jobs)
            results[site_key] = {
                "found": len(jobs),
                "inserted": insert_result["inserted"],
                "skipped": insert_result["skipped"],
            }

        except Exception as e:
            logger.error("Error scraping %s: %s", site_key, e, exc_info=True)
            results[site_key] = {"error": str(e)}

    # Print summary
    logger.info("=" * 60)
    logger.info("SCRAPING SUMMARY")
    logger.info("=" * 60)
    total_found = 0
    total_inserted = 0
    total_skipped = 0
    for site_key, result in results.items():
        if "error" in result:
            logger.info("  %s: ERROR - %s", site_key, result["error"])
        elif result.get("skipped"):
            logger.info("  %s: SKIPPED", site_key)
        else:
            total_found += result.get("found", 0)
            total_inserted += result.get("inserted", 0)
            total_skipped += result.get("skipped", 0)
            logger.info(
                "  %s: %d found, %d new, %d duplicates",
                site_key,
                result.get("found", 0),
                result.get("inserted", 0),
                result.get("skipped", 0),
            )

    logger.info("-" * 60)
    logger.info("TOTAL: %d found, %d new, %d duplicates", total_found, total_inserted, total_skipped)

    db.close()

    # Refresh the JSON export for the web UI
    try:
        from export_json import export_jobs
        export_result = export_jobs()
        logger.info(
            "Web UI data refreshed: %d jobs -> %s",
            export_result["count"], export_result["path"],
        )
    except Exception as e:
        logger.warning("JSON export failed (web UI may show stale data): %s", e)

    return results


def main():
    parser = argparse.ArgumentParser(description="Ethiopian Job Aggregation Scraper")
    parser.add_argument(
        "--sites",
        nargs="*",
        help="Specific sites to scrape (default: all enabled)",
        choices=list(SITES.keys()),
    )
    parser.add_argument(
        "--db",
        help="Path to SQLite database file",
        default=None,
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    results = run_scrapers(site_keys=args.sites, db_path=args.db)

    # Return non-zero exit code if any site had errors
    has_errors = any("error" in r for r in results.values())
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
