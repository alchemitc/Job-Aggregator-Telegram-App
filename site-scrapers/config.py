"""
Central configuration for Ethiopian Job Aggregation System.
All site URLs, scraping settings, and paths are defined here.
"""

import os

# Base directory for the project
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Database path
DATABASE_PATH = os.path.join(BASE_DIR, "jobs.db")

# Site configurations - URLs verified and tested
SITES = {
    "effoysira": {
        "name": "Effoy Sira",
        "base_url": "https://effoysira.com",
        "list_url": "https://effoysira.com/jobs",
        "scraper_type": "static",  # WordPress block theme, article.wp-block-post
        "enabled": True,
    },
    "geezjobs": {
        "name": "Geez Jobs",
        "base_url": "https://geezjobs.com",
        "list_url": "https://geezjobs.com/search-jobs",
        "scraper_type": "static",  # Cards with div[class*=card]
        "enabled": True,
    },
    "etcareers": {
        "name": "ET Careers",
        "base_url": "https://etcareers.com",
        "list_url": "https://etcareers.com/jobs",
        "scraper_type": "json_api",  # JSON API at /jobs?format=json
        "enabled": True,
    },
    "ethiojobs": {
        "name": "Ethio Jobs",
        "base_url": "https://www.ethiojobs.net",
        "list_url": "https://www.ethiojobs.net/jobs",
        "scraper_type": "nextjs",  # __NEXT_DATA__ extraction
        "enabled": True,
    },
    "kebenajobs": {
        "name": "Kebena Jobs",
        "base_url": "https://kebenajobs.com",
        "list_url": "https://kebenajobs.com",
        "scraper_type": "static",  # li.job_listing structure (Jobify theme)
        "enabled": True,
    },
    "elelanajobs": {
        "name": "Elelana Jobs",
        "base_url": "https://elelanajobs.com",
        "list_url": "https://elelanajobs.com",
        "scraper_type": "static",  # li.job_listing structure (same Jobify theme)
        "enabled": True,
    },
}

# Scraping settings
RATE_LIMIT_DELAY = 2.0  # seconds between requests to the same site
REQUEST_TIMEOUT = 30  # seconds for HTTP requests
MAX_PAGES_PER_SITE = 5  # maximum pages to scrape per site per run
MAX_RETRIES = 2  # retry failed requests this many times

# User agent
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# Playwright settings
PLAYWRIGHT_HEADLESS = True
PLAYWRIGHT_TIMEOUT = 30000  # milliseconds

# HTTP headers
DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

# Logging
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
