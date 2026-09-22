"""
Scraper for elelanajobs.com - Jobify WordPress theme.
Jobs are in li.job_listing elements (same theme as kebenajobs).
"""

import logging
import re
from typing import List, Dict, Any, Optional

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper
from config import MAX_PAGES_PER_SITE

logger = logging.getLogger(__name__)


class ElelanaJobsScraper(BaseScraper):
    """Scraper for Elelana Jobs site (Jobify theme - same as kebenajobs)."""

    def scrape_jobs(self) -> List[Dict[str, Any]]:
        """Scrape all jobs from elelanajobs.com."""
        all_jobs = []
        page = 1

        while page <= MAX_PAGES_PER_SITE:
            if page == 1:
                page_url = self.list_url
            else:
                page_url = f"{self.base_url}/page/{page}/"

            logger.info("Scraping %s page %d: %s", self.site_name, page, page_url)
            response = self.fetch(page_url)
            if not response:
                logger.warning("Failed to fetch page %d, stopping pagination", page)
                break

            soup = BeautifulSoup(response.text, "html.parser")
            job_listings = soup.select("li.job_listing")

            if not job_listings:
                logger.info("No job listings found on page %d, stopping", page)
                break

            for listing in job_listings:
                try:
                    job = self._parse_job_listing(listing)
                    if job and job.get("title"):
                        detail_job = self._scrape_detail(job)
                        if detail_job:
                            all_jobs.append(detail_job)
                        else:
                            all_jobs.append(job)
                except Exception as e:
                    logger.error("Error parsing job listing on page %d: %s", page, e)

            if not self._has_next_page(soup):
                break

            page += 1

        logger.info("Scraped %d jobs from %s", len(all_jobs), self.site_name)
        return all_jobs

    def _parse_job_listing(self, listing) -> Optional[Dict[str, Any]]:
        """Parse a li.job_listing element."""
        job = self.create_job_dict()

        # Position heading contains the main link
        position = listing.find(class_="position")
        if position:
            link = position.find("a", href=True)
            if link:
                job["title"] = self.clean_text(link.get_text())
                job["source_url"] = self.make_absolute_url(link["href"])
            else:
                heading = position.find(["h1", "h2", "h3", "h4", "h5"])
                if heading:
                    job["title"] = self.clean_text(heading.get_text())

        if not job["title"]:
            link = listing.find("a", href=True)
            if link:
                job["title"] = self.clean_text(link.get_text())
                job["source_url"] = self.make_absolute_url(link["href"])

        if not job["title"]:
            return None

        # Location
        location_elem = listing.find(class_="location")
        if location_elem:
            job["location"] = self.clean_text(location_elem.get_text())

        # Job type
        job_type_elem = listing.find(class_=lambda c: c and "job-type" in str(c).lower())
        if job_type_elem:
            job["job_type"] = self.clean_text(job_type_elem.get_text())

        # Company
        company_elem = listing.find(class_="company")
        if company_elem:
            company_text = self.clean_text(company_elem.get_text())
            if company_text and company_text != job["title"]:
                job["company"] = company_text

        # Date
        date_elem = listing.find(class_="date")
        if date_elem:
            job["posted_date"] = self.clean_text(date_elem.get_text())

        # Apply URL
        if job["source_url"]:
            job["apply_url"] = job["source_url"]

        return job

    def _scrape_detail(self, job: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Scrape the detail page for a job."""
        detail_url = job.get("source_url")
        if not detail_url:
            return None

        response = self.fetch(detail_url)
        if not response:
            return None

        soup = BeautifulSoup(response.text, "html.parser")

        # Description
        desc_selectors = [
            "div.job_description",
            "div.job-description",
            "div.description",
            "div.listing-content",
            "div.entry-content",
            "div.content",
        ]
        for selector in desc_selectors:
            desc_elem = soup.select_one(selector)
            if desc_elem:
                job["description"] = self.clean_text(desc_elem.get_text())
                break

        # Extract structured fields from description
        if job.get("description"):
            desc_lower = job["description"].lower()

            if not job.get("company"):
                company_match = re.search(
                    r'(?:company|organization|employer)\s*:\s*([^\n,;]+)', desc_lower
                )
                if company_match:
                    job["company"] = self.clean_text(company_match.group(1))

            if not job.get("location"):
                loc_match = re.search(
                    r'(?:location|place of work)\s*:\s*([^\n,;]+)', desc_lower
                )
                if loc_match:
                    job["location"] = self.clean_text(loc_match.group(1))
                elif "addis ababa" in desc_lower:
                    job["location"] = "Addis Ababa"

            if not job.get("deadline"):
                deadline_match = re.search(
                    r'(?:deadline|closing date)\s*:\s*([^\n]+)', desc_lower
                )
                if deadline_match:
                    job["deadline"] = self.clean_text(deadline_match.group(1))

        # Requirements
        req_selectors = [
            "div.job-requirements",
            "div.requirements",
            "div.qualifications",
        ]
        for selector in req_selectors:
            req_elem = soup.select_one(selector)
            if req_elem:
                job["requirements"] = self.clean_text(req_elem.get_text())
                break

        if not job.get("requirements") and job.get("description"):
            for keyword in ["requirement", "qualification", "skill"]:
                idx = job["description"].lower().find(keyword)
                if idx != -1:
                    start = max(0, idx - 10)
                    end = min(len(job["description"]), idx + 500)
                    job["requirements"] = job["description"][start:end]
                    break

        # Category
        cat_elem = soup.find(class_=lambda c: c and "category" in str(c).lower())
        if cat_elem:
            job["category"] = self.clean_text(cat_elem.get_text())

        # Apply URL
        apply_link = soup.find("a", class_=lambda c: c and "apply" in str(c).lower())
        if apply_link and apply_link.get("href"):
            job["apply_url"] = self.make_absolute_url(apply_link["href"])

        # Government exam check
        text_to_check = (str(job.get("title", "")) + " " + str(job.get("description", ""))).lower()
        gov_keywords = ["government", "civil service", "public service", "ministry", "federal"]
        if any(kw in text_to_check for kw in gov_keywords):
            job["is_gov_exam"] = 1

        return job

    def _has_next_page(self, soup: BeautifulSoup) -> bool:
        """Check if there is a next page of results."""
        next_selectors = [
            "a.next",
            "li.next a",
            "a.next.page-numbers",
            "a[rel='next']",
            "nav.pagination a.next",
        ]
        for selector in next_selectors:
            next_link = soup.select_one(selector)
            if next_link:
                return True
        return False
