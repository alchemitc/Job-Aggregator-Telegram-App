"""
SQLite database module for the Ethiopian Job Aggregation System.
Handles schema creation, inserts, deduplication, and queries.
"""

import sqlite3
import hashlib
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

from config import DATABASE_PATH

logger = logging.getLogger(__name__)


class JobDatabase:
    """Manages the SQLite database for job listings."""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or DATABASE_PATH
        self.conn = None

    def connect(self):
        """Create a database connection."""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        logger.info("Database connected: %s", self.db_path)

    def close(self):
        """Close the database connection."""
        if self.conn:
            self.conn.close()
            self.conn = None
            logger.info("Database connection closed")

    def create_tables(self):
        """Create the jobs table if it doesn't exist."""
        sql = """
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_site TEXT NOT NULL,
            source_url TEXT,
            source_id TEXT,
            title TEXT NOT NULL,
            company TEXT,
            location TEXT,
            salary TEXT,
            salary_currency TEXT,
            job_type TEXT,
            category TEXT,
            description TEXT,
            requirements TEXT,
            deadline TEXT,
            posted_date TEXT,
            apply_url TEXT,
            apply_method TEXT,
            is_gov_exam INTEGER DEFAULT 0,
            is_promo INTEGER DEFAULT 0,
            raw_text TEXT,
            content_hash TEXT UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
        self.conn.execute(sql)

        # Create indexes for common queries
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_source_site ON jobs(source_site)",
            "CREATE INDEX IF NOT EXISTS idx_content_hash ON jobs(content_hash)",
            "CREATE INDEX IF NOT EXISTS idx_title ON jobs(title)",
            "CREATE INDEX IF NOT EXISTS idx_company ON jobs(company)",
            "CREATE INDEX IF NOT EXISTS idx_location ON jobs(location)",
            "CREATE INDEX IF NOT EXISTS idx_posted_date ON jobs(posted_date)",
        ]
        for idx_sql in indexes:
            self.conn.execute(idx_sql)

        self.conn.commit()
        logger.info("Database tables created/verified")

    @staticmethod
    def compute_hash(job: Dict[str, Any]) -> str:
        """Compute a content hash for deduplication."""
        hash_parts = [
            str(job.get("source_site", "")),
            str(job.get("title", "")),
            str(job.get("company", "")),
            str(job.get("location", "")),
            str(job.get("deadline", "")),
        ]
        content = "|".join(hash_parts)
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def insert_job(self, job: Dict[str, Any]) -> bool:
        """
        Insert a job into the database. Returns True if inserted,
        False if duplicate (same content_hash already exists).
        """
        now = datetime.utcnow().isoformat()

        content_hash = self.compute_hash(job)
        job["content_hash"] = content_hash
        job["created_at"] = now
        job["updated_at"] = now

        # Check for duplicate
        existing = self.conn.execute(
            "SELECT id FROM jobs WHERE content_hash = ?",
            (content_hash,)
        ).fetchone()
        if existing:
            logger.debug("Duplicate job skipped: %s", job.get("title", "unknown"))
            return False

        sql = """
        INSERT INTO jobs (
            source_site, source_url, source_id, title, company, location,
            salary, salary_currency, job_type, category, description,
            requirements, deadline, posted_date, apply_url, apply_method,
            is_gov_exam, is_promo, raw_text, content_hash,
            created_at, updated_at
        ) VALUES (
            :source_site, :source_url, :source_id, :title, :company, :location,
            :salary, :salary_currency, :job_type, :category, :description,
            :requirements, :deadline, :posted_date, :apply_url, :apply_method,
            :is_gov_exam, :is_promo, :raw_text, :content_hash,
            :created_at, :updated_at
        )
        """
        try:
            self.conn.execute(sql, job)
            self.conn.commit()
            logger.info("Inserted job: %s from %s", job.get("title", "unknown"), job.get("source_site"))
            return True
        except sqlite3.IntegrityError:
            logger.debug("Duplicate job (integrity): %s", job.get("title", "unknown"))
            return False
        except Exception as e:
            logger.error("Error inserting job: %s", e)
            self.conn.rollback()
            return False

    def insert_jobs(self, jobs: List[Dict[str, Any]]) -> Dict[str, int]:
        """Insert multiple jobs. Returns count of inserted and skipped."""
        inserted = 0
        skipped = 0
        for job in jobs:
            if self.insert_job(job):
                inserted += 1
            else:
                skipped += 1
        return {"inserted": inserted, "skipped": skipped}

    def get_jobs(
        self,
        source_site: Optional[str] = None,
        search: Optional[str] = None,
        location: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Query jobs with optional filters."""
        sql = "SELECT * FROM jobs WHERE 1=1"
        params = []

        if source_site:
            sql += " AND source_site = ?"
            params.append(source_site)

        if search:
            sql += " AND (title LIKE ? OR company LIKE ? OR description LIKE ?)"
            search_term = f"%{search}%"
            params.extend([search_term, search_term, search_term])

        if location:
            sql += " AND location LIKE ?"
            params.append(f"%{location}%")

        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = self.conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]

    def count_jobs(
        self,
        source_site: Optional[str] = None,
        search: Optional[str] = None,
        location: Optional[str] = None,
    ) -> int:
        """Count jobs matching the given filters."""
        sql = "SELECT COUNT(*) FROM jobs WHERE 1=1"
        params = []

        if source_site:
            sql += " AND source_site = ?"
            params.append(source_site)

        if search:
            sql += " AND (title LIKE ? OR company LIKE ? OR description LIKE ?)"
            search_term = f"%{search}%"
            params.extend([search_term, search_term, search_term])

        if location:
            sql += " AND location LIKE ?"
            params.append(f"%{location}%")

        return self.conn.execute(sql, params).fetchone()[0]

    def get_job_by_id(self, job_id: int) -> Optional[Dict[str, Any]]:
        """Get a single job by ID."""
        row = self.conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def get_stats(self) -> Dict[str, Any]:
        """Get database statistics."""
        total = self.conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        by_site = self.conn.execute(
            "SELECT source_site, COUNT(*) as cnt FROM jobs GROUP BY source_site ORDER BY cnt DESC"
        ).fetchall()
        return {
            "total_jobs": total,
            "by_site": {row["source_site"]: row["cnt"] for row in by_site},
        }

    def get_all_jobs(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """Get all jobs for export."""
        rows = self.conn.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]
