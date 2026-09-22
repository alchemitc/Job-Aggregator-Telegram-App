"""
Scraper for effoysira.com - WordPress block theme.
Jobs are in article.wp-block-post elements.
"""

import logging
from typing import List, Dict, Any, Optional

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper
from config import MAX_PAGES_PER_SITE

logger = logging.getLogger(__name__)


class EffoySiraScraper(BaseScraper):
    """Scraper for Effoy Sira job site (WordPress block theme)."""

    def scrape_jobs(self) -> List[Dict[str, Any]]:
        """Scrape all jobs from effoysira.com."""
        all_jobs = []
        page = 1

        while page <= MAX_PAGES_PER_SITE:
            if page == 1:
                page_url = self.list_url
            else:
                # WordPress uses /page/N/ pattern
                page_url = f"{self.list_url}/page/{page}"

            logger.info("Scraping %s page %d: %s", self.site_name, page, page_url)
            response = self.fetch(page_url)
            if not response:
                logger.warning("Failed to fetch page %d, stopping pagination", page)
                break

            soup = BeautifulSoup(response.text, "html.parser")

            # WordPress block theme: articles with class wp-block-post
            # Exclude the first article which is usually the page itself
            articles = soup.select("article.wp-block-post")
            # Filter out page-type articles (the page header)
            job_articles = [
                a for a in articles
                if "type-page" not in " ".join(a.get("class", []))
            ]

            if not job_articles:
                logger.info("No job articles found on page %d, stopping", page)
                break

            for article in job_articles:
                try:
                    job = self._parse_job_card(article)
                    if job and job.get("title"):
                        # Scrape detail page for full description
                        detail_job = self._scrape_detail(job)
                        if detail_job:
                            all_jobs.append(detail_job)
                        else:
                            all_jobs.append(job)
                except Exception as e:
                    logger.error("Error parsing article on page %d: %s", page, e)

            # Check for next page
            if not self._has_next_page(soup):
                logger.info("No next page found, stopping pagination")
                break

            page += 1

        logger.info("Scraped %d jobs from %s", len(all_jobs), self.site_name)
        return all_jobs

    def _parse_job_card(self, article) -> Optional[Dict[str, Any]]:
        """Parse a WordPress article element into a job dictionary."""
        job = self.create_job_dict()

        # WordPress block theme: title is in h2 > a
        heading = article.find(["h2", "h3", "h4"])
        if heading:
            link = heading.find("a", href=True)
            if link:
                job["title"] = self.clean_text(link.get_text())
                job["source_url"] = self.make_absolute_url(link["href"])
            else:
                job["title"] = self.clean_text(heading.get_text())

        if not job["title"]:
            return None

        # Company is often in the post content or categories
        # Check for category tags
        categories = article.find_all("a", rel="category tag")
        if categories:
            cat_names = [self.clean_text(c.get_text()) for c in categories if self.clean_text(c.get_text())]
            if cat_names:
                job["category"] = ", ".join(cat_names)

        # Check for tags (may contain company info)
        tags = article.find_all("a", rel="tag")
        if tags:
            tag_names = [self.clean_text(t.get_text()) for t in tags if self.clean_text(t.get_text())]
            if tag_names:
                # Tags often contain company name and job type
                for tag_text in tag_names:
                    tag_lower = tag_text.lower()
                    if any(kw in tag_lower for kw in ["company", "plc", "sc", "ltd", "enterprise", "consult"]):
                        job["company"] = tag_text
                    elif any(kw in tag_lower for kw in ["full time", "part time", "contract"]):
                        job["job_type"] = tag_text

        # Try to get post date
        time_elem = article.find("time")
        if time_elem:
            datetime_val = time_elem.get("datetime") or time_elem.get_text()
            if datetime_val:
                job["posted_date"] = self.clean_text(str(datetime_val))

        # Apply URL defaults to source URL
        if job["source_url"]:
            job["apply_url"] = job["source_url"]

        return job

    def _scrape_detail(self, job: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Scrape the detail page for a job to get full description."""
        detail_url = job.get("source_url")
        if not detail_url:
            return None

        response = self.fetch(detail_url)
        if not response:
            return None

        soup = BeautifulSoup(response.text, "html.parser")

        # WordPress block theme: content in entry-content or wp-block-post-content
        desc_selectors = [
            "div.wp-block-post-content",
            "div.entry-content",
            "div.post-content",
            "article div.content",
        ]
        for selector in desc_selectors:
            desc_elem = soup.select_one(selector)
            if desc_elem:
                job["description"] = self.clean_text(desc_elem.get_text())
                break

        # Try to extract structured data from the description text
        if job.get("description"):
            desc_lower = job["description"].lower()

            # Look for company name in description
            if not job.get("company"):
                # Common pattern: "Company: XYZ" or "Organization: XYZ"
                import re
                company_match = re.search(
                    r'(?:company|organization|employer|institution)\s*:\s*([^\n,;]+)',
                    desc_lower
                )
                if company_match:
                    job["company"] = self.clean_text(company_match.group(1))

            # Look for location
            if not job.get("location"):
                location_match = re.search(
                    r'(?:location|place of work|work place)\s*:\s*([^\n,;]+)',
                    desc_lower
                )
                if location_match:
                    job["location"] = self.clean_text(location_match.group(1))
                elif "addis ababa" in desc_lower:
                    job["location"] = "Addis Ababa"

            # Look for deadline
            if not job.get("deadline"):
                deadline_match = re.search(
                    r'(?:deadline|closing date|apply before|last date)\s*:\s*([^\n]+)',
                    desc_lower
                )
                if deadline_match:
                    job["deadline"] = self.clean_text(deadline_match.group(1))

            # Look for salary
            if not job.get("salary"):
                salary_match = re.search(
                    r'(?:salary|remuneration|compensation|pay)\s*:\s*([^\n]+)',
                    desc_lower
                )
                if salary_match:
                    salary_text = self.clean_text(salary_match.group(1))
                    if salary_text and "negotiable" not in salary_text.lower() and "n/a" not in salary_text.lower():
                        job["salary"] = salary_text

        # Look for requirements section
        req_keywords = ["requirement", "qualification", "skill", "competenc"]
        page_text = soup.get_text()
        for keyword in req_keywords:
            idx = page_text.lower().find(keyword)
            if idx != -1:
                # Grab text around the keyword
                start = max(0, idx - 10)
                end = min(len(page_text), idx + 500)
                job["requirements"] = self.clean_text(page_text[start:end])
                break

        # Check for apply link
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
        # WordPress pagination patterns
        next_selectors = [
            "a.next.page-numbers",
            "a.next",
            "li.next a",
            "nav.pagination a.next",
            "a[rel='next']",
        ]
        for selector in next_selectors:
            next_link = soup.select_one(selector)
            if next_link:
                return True
        return False
