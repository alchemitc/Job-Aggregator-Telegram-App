"""
Scraper for geezjobs.com - Job listing cards.
Jobs are in div[class*=card] elements on the search page.
"""

import logging
import re
from typing import List, Dict, Any, Optional

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper
from config import MAX_PAGES_PER_SITE

logger = logging.getLogger(__name__)


class GeezJobsScraper(BaseScraper):
    """Scraper for Geez Jobs site."""

    def scrape_jobs(self) -> List[Dict[str, Any]]:
        """Scrape all jobs from geezjobs.com."""
        all_jobs = []
        page = 1

        while page <= MAX_PAGES_PER_SITE:
            if page == 1:
                page_url = self.list_url
            else:
                page_url = f"{self.list_url}?page={page}"

            logger.info("Scraping %s page %d: %s", self.site_name, page, page_url)
            response = self.fetch(page_url)
            if not response:
                logger.warning("Failed to fetch page %d, stopping pagination", page)
                break

            soup = BeautifulSoup(response.text, "html.parser")

            # Cards with job listings
            cards = soup.select("div[class*=card]")
            job_cards = [c for c in cards if self._is_job_card(c)]

            if not job_cards:
                logger.info("No job cards found on page %d, stopping", page)
                break

            for card in job_cards:
                try:
                    job = self._parse_job_card(card)
                    if job and job.get("title"):
                        detail_job = self._scrape_detail(job)
                        if detail_job:
                            all_jobs.append(detail_job)
                        else:
                            all_jobs.append(job)
                except Exception as e:
                    logger.error("Error parsing job card on page %d: %s", page, e)

            # Check for next page
            if not self._has_next_page(soup):
                break

            page += 1

        logger.info("Scraped %d jobs from %s", len(all_jobs), self.site_name)
        return all_jobs

    def _is_job_card(self, card) -> bool:
        """Determine if a card element is a job listing card."""
        # Job cards contain headings with links to /job-detail/
        heading = card.find(["h2", "h3", "h4", "h5"])
        if heading:
            link = heading.find("a", href=True)
            if link and "/job-detail/" in link.get("href", ""):
                return True
        # Also check for deadline text
        text = card.get_text()
        if "Deadline" in text and ("Full-time" in text or "Part-time" in text or "Permanent" in text):
            return True
        return False

    def _parse_job_card(self, card) -> Optional[Dict[str, Any]]:
        """Parse a job card element into a job dictionary."""
        job = self.create_job_dict()

        # Title and link - in heading > a with /job-detail/ href
        heading = card.find(["h2", "h3", "h4", "h5"])
        if heading:
            link = heading.find("a", href=True)
            if link:
                job["title"] = self.clean_text(link.get_text())
                job["source_url"] = self.make_absolute_url(link["href"])
            else:
                job["title"] = self.clean_text(heading.get_text())

        if not job["title"]:
            return None

        # The card text contains structured data like:
        # "Job TitleCOMPANY NAMEAddis Ababa - EthiopiaDeadline: May 14, 2026Full-time / Permanent10 YearsPosted: 1 days agoView Detail"
        full_text = card.get_text(separator="|")

        # Extract company - it appears right after the title
        # Pattern: Title|Company|Location|Deadline|Type|Experience|Posted
        parts = [p.strip() for p in full_text.split("|") if p.strip()]

        # Find company by looking for common company patterns
        for i, part in enumerate(parts):
            part_lower = part.lower()
            if any(kw in part_lower for kw in ["plc", "sc", "ltd", "llc", "enterprise", "consult", "company", "organization"]):
                job["company"] = part
                break
            # Company is typically the 2nd element after title
            if i == 1 and not any(kw in part_lower for kw in ["deadline", "full", "part", "ethiopia", "addis"]):
                job["company"] = part

        # Extract location
        loc_match = re.search(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*-\s*Ethiopia)', full_text)
        if loc_match:
            job["location"] = loc_match.group(1)
        elif "Addis Ababa" in full_text:
            job["location"] = "Addis Ababa, Ethiopia"

        # Extract deadline
        deadline_match = re.search(r'Deadline:\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})', full_text)
        if deadline_match:
            job["deadline"] = deadline_match.group(1)

        # Extract job type
        type_match = re.search(r'(Full-time(?:\s*/\s*\w+)?|Part-time(?:\s*/\s*\w+)?|Contract|Temporary|Internship)', full_text)
        if type_match:
            job["job_type"] = type_match.group(1)

        # Extract posted date
        posted_match = re.search(r'Posted:\s*(\d+\s+\w+\s+ago)', full_text)
        if posted_match:
            job["posted_date"] = posted_match.group(1)

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

        # Extract description
        desc_selectors = [
            "div.job-description",
            "div.description",
            "div.job-detail",
            "div.entry-content",
            "div.content",
            "article",
        ]
        for selector in desc_selectors:
            desc_elem = soup.select_one(selector)
            if desc_elem:
                job["description"] = self.clean_text(desc_elem.get_text())
                break

        # Look for structured fields in the detail page
        if job.get("description"):
            desc_lower = job["description"].lower()

            if not job.get("company"):
                company_match = re.search(
                    r'(?:company|organization|employer)\s*:\s*([^\n,;]+)', desc_lower
                )
                if company_match:
                    job["company"] = self.clean_text(company_match.group(1))

            if not job.get("location"):
                if "addis ababa" in desc_lower:
                    job["location"] = "Addis Ababa, Ethiopia"

            if not job.get("deadline"):
                deadline_match = re.search(
                    r'(?:deadline|closing date)\s*:\s*([^\n]+)', desc_lower
                )
                if deadline_match:
                    job["deadline"] = self.clean_text(deadline_match.group(1))

        # Extract requirements
        page_text = soup.get_text()
        for keyword in ["requirement", "qualification", "skill"]:
            idx = page_text.lower().find(keyword)
            if idx != -1:
                start = max(0, idx - 10)
                end = min(len(page_text), idx + 500)
                job["requirements"] = self.clean_text(page_text[start:end])
                break

        # Extract category
        cat_elem = soup.find(class_=lambda c: c and "category" in str(c).lower())
        if cat_elem:
            job["category"] = self.clean_text(cat_elem.get_text())

        # Extract apply URL
        apply_link = soup.find("a", class_=lambda c: c and "apply" in str(c).lower())
        if apply_link and apply_link.get("href"):
            job["apply_url"] = self.make_absolute_url(apply_link["href"])

        # Government exam check
        text_to_check = (str(job.get("title", "")) + " " + str(job.get("description", ""))).lower()
        gov_keywords = ["government", "civil service", "public service", "ministry"]
        if any(kw in text_to_check for kw in gov_keywords):
            job["is_gov_exam"] = 1

        return job

    def _has_next_page(self, soup: BeautifulSoup) -> bool:
        """Check if there is a next page of results."""
        next_selectors = [
            "a.next",
            "li.next a",
            "a[rel='next']",
            "nav.pagination a.next",
        ]
        for selector in next_selectors:
            next_link = soup.select_one(selector)
            if next_link:
                return True
        return False
