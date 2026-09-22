"""
Scraper for ethiojobs.net - Next.js site with __NEXT_DATA__.
Jobs are embedded as JSON in the page source.
"""

import json
import logging
from typing import List, Dict, Any, Optional

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper
from config import MAX_PAGES_PER_SITE

logger = logging.getLogger(__name__)


class EthioJobsScraper(BaseScraper):
    """Scraper for Ethio Jobs using __NEXT_DATA__ extraction."""

    def scrape_jobs(self) -> List[Dict[str, Any]]:
        """Scrape all jobs from ethiojobs.net."""
        all_jobs = []
        page = 1

        # Ethiojobs has pagination in __NEXT_DATA__ - 12 jobs per page, 58+ pages
        while page <= MAX_PAGES_PER_SITE:
            if page == 1:
                page_url = self.list_url
            else:
                page_url = f"{self.list_url}?page={page}"

            logger.info("Scraping %s page %d: %s", self.site_name, page, page_url)

            jobs = self._scrape_page_next_data(page_url)
            if not jobs:
                # Fallback to HTML parsing
                jobs = self._scrape_page_html(page_url)

            if not jobs:
                logger.info("No jobs found on page %d, stopping", page)
                break

            all_jobs.extend(jobs)

            # If less than a full page, we've reached the end
            if len(jobs) < 12:
                logger.info("Less than a full page, stopping pagination")
                break

            page += 1

        logger.info("Scraped %d jobs from %s", len(all_jobs), self.site_name)
        return all_jobs

    def _scrape_page_next_data(self, page_url: str) -> List[Dict[str, Any]]:
        """Extract jobs from __NEXT_DATA__ JSON in page source."""
        jobs = []
        response = self.fetch(page_url)
        if not response:
            return jobs

        soup = BeautifulSoup(response.text, "html.parser")
        next_data_script = soup.find("script", id="__NEXT_DATA__")
        if not next_data_script:
            logger.info("No __NEXT_DATA__ found on %s", page_url)
            return jobs

        try:
            next_data = json.loads(next_data_script.string)
        except (json.JSONDecodeError, TypeError) as e:
            logger.error("Failed to parse __NEXT_DATA__: %s", e)
            return jobs

        # Navigate: props.pageProps.jobs.data contains the job list
        try:
            page_props = next_data["props"]["pageProps"]
            jobs_data_dict = page_props.get("jobs", {})
            jobs_data = jobs_data_dict.get("data", [])
            meta = jobs_data_dict.get("meta", {})
            logger.info(
                "Page %d: %d jobs, total=%d, lastPage=%d",
                meta.get("pageNumber", 0),
                len(jobs_data),
                meta.get("total", 0),
                meta.get("lastPage", 0),
            )
        except (KeyError, TypeError) as e:
            logger.error("Error navigating __NEXT_DATA__ structure: %s", e)
            return jobs

        for job_data in jobs_data:
            try:
                job = self._parse_next_data_job(job_data)
                if job and job.get("title"):
                    jobs.append(job)
            except Exception as e:
                logger.error("Error parsing __NEXT_DATA__ job: %s", e)

        return jobs

    def _parse_next_data_job(self, data: Dict) -> Optional[Dict[str, Any]]:
        """Parse a job from __NEXT_DATA__ JSON into our job dictionary."""
        job = self.create_job_dict()

        # Title
        job["title"] = data.get("title")
        if not job["title"]:
            return None

        # Source ID
        job["source_id"] = data.get("id")

        # Company - nested object
        company = data.get("company", {})
        if isinstance(company, dict):
            job["company"] = company.get("name")

        # Location - the 'state' field contains location info
        state = data.get("state", "")
        if state:
            job["location"] = state

        # Location type (Office, Remote, Hybrid)
        location_type = data.get("location_type", "")
        if location_type and job.get("location"):
            job["location"] = f"{job['location']} ({location_type})"

        # Salary - rarely present on ethiojobs, never fabricate
        # No salary field in the API data structure

        # Job type - 'type' is an integer, map it
        job_type_int = data.get("type")
        type_map = {
            1: "Full-time",
            2: "Part-time",
            3: "Contract",
            4: "Temporary",
            5: "Internship",
            10: "Full-time",  # Common default
        }
        if job_type_int:
            job["job_type"] = type_map.get(job_type_int, str(job_type_int))

        # Category - from catalogs
        catalogs = data.get("catalogs", [])
        if isinstance(catalogs, list) and catalogs:
            cat_names = []
            for cat in catalogs:
                if isinstance(cat, dict) and cat.get("name"):
                    cat_names.append(cat["name"])
            if cat_names:
                job["category"] = ", ".join(cat_names)

        # Description - HTML content
        description = data.get("description", "")
        if description:
            soup = BeautifulSoup(description, "html.parser")
            job["description"] = self.clean_text(soup.get_text())

        # Deadline - date_expiry
        date_expiry = data.get("date_expiry", "")
        if date_expiry:
            job["deadline"] = date_expiry[:10] if len(date_expiry) >= 10 else date_expiry

        # Posted date - date_published
        date_published = data.get("date_published", "")
        if date_published:
            job["posted_date"] = date_published[:10] if len(date_published) >= 10 else date_published

        # Level
        level = data.get("level", "")
        if level:
            level_map = {"1": "Entry Level", "2": "Mid Level", "3": "Senior Level", "4": "Executive"}
            # Store level info in job_type if not already set
            level_str = level_map.get(str(level), f"Level {level}")
            if job.get("job_type"):
                job["job_type"] = f"{job['job_type']} ({level_str})"

        # URLs - slug-based
        slug = data.get("slug", "")
        if slug:
            job["source_url"] = f"{self.base_url}/jobs/{slug}"
            job["apply_url"] = job["source_url"]

        # Application method
        app_method = data.get("application_method", "")
        if app_method:
            if app_method == "ATS":
                job["apply_method"] = "online"
            elif app_method == "EMAIL":
                job["apply_method"] = "email"
            else:
                job["apply_method"] = app_method.lower()

        # Application email
        app_email = data.get("application_email")
        if app_email:
            job["apply_method"] = "email"

        # Government exam check
        text_to_check = (str(job.get("title", "")) + " " + str(job.get("description", ""))).lower()
        gov_keywords = ["government", "civil service", "public service", "ministry", "federal"]
        if any(kw in text_to_check for kw in gov_keywords):
            job["is_gov_exam"] = 1

        return job

    def _scrape_page_html(self, page_url: str) -> List[Dict[str, Any]]:
        """Fallback: parse jobs from HTML when __NEXT_DATA__ is not available."""
        jobs = []
        response = self.fetch(page_url)
        if not response:
            return jobs

        soup = BeautifulSoup(response.text, "html.parser")
        # Look for job links in the rendered HTML
        links = soup.find_all("a", href=True)
        for link in links:
            href = link.get("href", "")
            if "/jobs/" in href and href != "/jobs":
                job = self.create_job_dict()
                job["title"] = self.clean_text(link.get_text())
                job["source_url"] = self.make_absolute_url(href)
                job["apply_url"] = job["source_url"]
                if job["title"] and len(job["title"]) > 3:
                    jobs.append(job)

        return jobs
