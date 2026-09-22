"""
Base scraper class for the Ethiopian Job Aggregation System.
All site-specific scrapers inherit from this class.
"""

import abc
import logging
import time
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse

import requests
from requests.exceptions import RequestException

from config import (
    DEFAULT_HEADERS,
    RATE_LIMIT_DELAY,
    REQUEST_TIMEOUT,
    MAX_RETRIES,
    MAX_PAGES_PER_SITE,
)

logger = logging.getLogger(__name__)


class BaseScraper(abc.ABC):
    """Abstract base class for all job scrapers."""

    def __init__(self, site_key: str, site_config: Dict[str, Any]):
        self.site_key = site_key
        self.site_name = site_config.get("name", site_key)
        self.base_url = site_config.get("base_url", "")
        self.list_url = site_config.get("list_url", "")
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self._last_request_time = 0.0

    def rate_limit(self):
        """Enforce rate limiting between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            time.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()

    def fetch(self, url: str, retries: int = None) -> Optional[requests.Response]:
        """
        Fetch a URL with rate limiting and retry logic.
        Returns the Response object or None on failure.
        """
        retries = retries if retries is not None else MAX_RETRIES
        self.rate_limit()

        for attempt in range(retries + 1):
            try:
                logger.info("Fetching: %s (attempt %d/%d)", url, attempt + 1, retries + 1)
                response = self.session.get(url, timeout=REQUEST_TIMEOUT)
                response.raise_for_status()
                return response
            except RequestException as e:
                logger.warning("Fetch error for %s: %s", url, e)
                if attempt < retries:
                    time.sleep(2 ** attempt)  # exponential backoff
                else:
                    logger.error("Failed to fetch %s after %d attempts", url, retries + 1)
                    return None
        return None

    def fetch_json(self, url: str, retries: int = None) -> Optional[Dict]:
        """Fetch a URL and parse as JSON."""
        response = self.fetch(url, retries)
        if response:
            try:
                return response.json()
            except ValueError as e:
                logger.error("JSON parse error for %s: %s", url, e)
        return None

    def make_absolute_url(self, url: str) -> str:
        """Convert a relative URL to absolute using the site's base URL."""
        if not url:
            return ""
        if url.startswith("http"):
            return url
        return urljoin(self.base_url, url)

    @abc.abstractmethod
    def scrape_jobs(self) -> List[Dict[str, Any]]:
        """
        Main method to scrape all jobs from this site.
        Must be implemented by each site-specific scraper.
        Returns a list of job dictionaries.
        """
        pass

    def create_job_dict(self) -> Dict[str, Any]:
        """Create a job dictionary with all fields initialized to None."""
        return {
            "source_site": self.site_key,
            "source_url": None,
            "source_id": None,
            "title": None,
            "company": None,
            "location": None,
            "salary": None,
            "salary_currency": None,
            "job_type": None,
            "category": None,
            "description": None,
            "requirements": None,
            "deadline": None,
            "posted_date": None,
            "apply_url": None,
            "apply_method": None,
            "is_gov_exam": 0,
            "is_promo": 0,
            "raw_text": None,
        }

    def clean_text(self, text: Optional[str]) -> Optional[str]:
        """Clean up whitespace in scraped text."""
        if not text:
            return None
        cleaned = " ".join(text.split())
        return cleaned.strip() if cleaned else None
