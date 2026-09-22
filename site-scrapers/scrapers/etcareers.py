"""
Scraper for etcareers.com - JSON API based site.
Jobs are available via JSON API at /jobs?format=json
"""

import logging
from typing import List, Dict, Any, Optional

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper
from config import MAX_PAGES_PER_SITE

logger = logging.getLogger(__name__)


class ETCareersScraper(BaseScraper):
    """Scraper for ET Careers site using JSON API."""

    def scrape_jobs(self) -> List[Dict[str, Any]]:
        """Scrape all jobs from etcareers.com via JSON API."""
        all_jobs = []

        # ETcareers returns ALL jobs in a single JSON response
        # The API returns ~316 jobs at /jobs?format=json
        api_url = f"{self.list_url}?format=json"
        logger.info("Fetching jobs from %s API: %s", self.site_name, api_url)

        # Use the session with JSON accept header
        self.session.headers["Accept"] = "application/json"
        response = self.fetch(api_url)
        # Restore default accept header
        self.session.headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

        if not response:
            logger.error("Failed to fetch jobs from %s API", self.site_name)
            return all_jobs

        try:
            jobs_data = response.json()
        except ValueError as e:
            logger.error("Failed to parse JSON from %s: %s", self.site_name, e)
            return all_jobs

        if not isinstance(jobs_data, list):
            logger.error("Expected list from %s API, got %s", self.site_name, type(jobs_data).__name__)
            return all_jobs

        logger.info("Found %d jobs from %s API", len(jobs_data), self.site_name)

        for job_data in jobs_data:
            try:
                job = self._parse_api_job(job_data)
                if job and job.get("title"):
                    all_jobs.append(job)
            except Exception as e:
                logger.error("Error parsing API job: %s", e)

        logger.info("Scraped %d jobs from %s", len(all_jobs), self.site_name)
        return all_jobs

    def _parse_api_job(self, data: Dict) -> Optional[Dict[str, Any]]:
        """Parse a job from the JSON API response."""
        job = self.create_job_dict()

        # Title
        job["title"] = data.get("title")
        if not job["title"]:
            return None

        # Company - nested object
        company = data.get("company", {})
        if isinstance(company, dict):
            job["company"] = company.get("name")
            company_location = company.get("location")
            if company_location and not data.get("location"):
                # Don't set job location from company if not relevant
                pass

        # Location
        location = data.get("location", "")
        location_limits = data.get("location_limits", [])
        if location_limits and isinstance(location_limits, list):
            job["location"] = ", ".join(location_limits)
        elif isinstance(location, str) and location:
            # Map common location values
            location_map = {
                "onsite": "On-site",
                "remote": "Remote",
                "hybrid": "Hybrid",
            }
            if location.lower() in location_map:
                # This is location type, not actual location
                # Try to get from description or company
                pass
            else:
                job["location"] = location

        # Salary - only set if actually present
        salary_data = data.get("salary", {})
        if isinstance(salary_data, dict):
            salary_min = salary_data.get("minimum")
            salary_max = salary_data.get("maximum")
            if salary_min or salary_max:
                schedule = salary_data.get("schedule", "")
                if salary_min and salary_max:
                    job["salary"] = f"{salary_min} - {salary_max} ({schedule})"
                elif salary_max:
                    job["salary"] = f"Up to {salary_max} ({schedule})"
                else:
                    job["salary"] = f"From {salary_min} ({schedule})"

        # Job type / arrangement
        arrangement = data.get("arrangement", "")
        if arrangement:
            arrangement_map = {
                "fulltime": "Full-time",
                "parttime": "Part-time",
                "contract": "Contract",
                "temporary": "Temporary",
                "internship": "Internship",
                "volunteer": "Volunteer",
            }
            job["job_type"] = arrangement_map.get(arrangement.lower(), arrangement.title())

        # Category
        categories = data.get("categories", [])
        if isinstance(categories, list) and categories:
            cat_names = []
            for cat in categories:
                if isinstance(cat, dict) and cat.get("name"):
                    cat_names.append(cat["name"])
                elif isinstance(cat, str):
                    cat_names.append(cat)
            if cat_names:
                job["category"] = ", ".join(cat_names)

        # Description
        description = data.get("description", {})
        if isinstance(description, dict):
            html_desc = description.get("html", "")
            if html_desc:
                # Convert HTML to text
                soup = BeautifulSoup(html_desc, "html.parser")
                job["description"] = self.clean_text(soup.get_text())
        elif isinstance(description, str):
            soup = BeautifulSoup(description, "html.parser")
            job["description"] = self.clean_text(soup.get_text())

        # Deadline / expires_at
        expires_at = data.get("expires_at")
        if expires_at:
            job["deadline"] = expires_at[:10] if len(expires_at) >= 10 else expires_at

        # Posted date
        published_at = data.get("published_at")
        if published_at:
            job["posted_date"] = published_at[:10] if len(published_at) >= 10 else published_at

        # URLs
        links = data.get("links", {})
        if isinstance(links, dict):
            self_link = links.get("self", "")
            if self_link:
                job["source_url"] = self_link
                job["apply_url"] = self_link

        # Apply method
        application = data.get("application", {})
        if isinstance(application, dict):
            apply_url = application.get("url")
            apply_email = application.get("email")
            if apply_url:
                job["apply_url"] = apply_url
                job["apply_method"] = "online"
            elif apply_email:
                job["apply_method"] = "email"
            else:
                # Check application_link field
                app_link = data.get("application_link", "")
                if app_link and "@" in app_link:
                    job["apply_method"] = "email"
                elif app_link:
                    job["apply_url"] = app_link
                    job["apply_method"] = "online"

        # Government exam check
        text_to_check = (str(job.get("title", "")) + " " + str(job.get("description", ""))).lower()
        gov_keywords = ["government", "civil service", "public service", "ministry", "federal"]
        if any(kw in text_to_check for kw in gov_keywords):
            job["is_gov_exam"] = 1

        return job
