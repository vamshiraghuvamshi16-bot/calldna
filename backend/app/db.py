"""Postgres access for Revenue X-Ray.

Uses the Supabase *database* connection string (Connect > Transaction pooler).
Put it in backend/.env as DATABASE_URL=postgresql://...
"""
import os
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

# Load backend/.env no matter which folder the server is started from.
# utf-8-sig also handles files saved by Notepad with a hidden BOM character.
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_FILE, encoding="utf-8-sig")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip().strip('"').strip("'")
if not DATABASE_URL:
    raise RuntimeError(
        f"DATABASE_URL is missing. Open {ENV_FILE} and add a line like:\n"
        "DATABASE_URL=postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    )

# prepare_threshold=None keeps it compatible with Supabase's pgbouncer pooler.
pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=5,
    kwargs={"row_factory": dict_row, "prepare_threshold": None},
    open=True,
)


@contextmanager
def cursor():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            yield cur


def fetch_all(sql: str, params: dict | None = None) -> list[dict]:
    with cursor() as cur:
        cur.execute(sql, params or {})
        return cur.fetchall()


def fetch_one(sql: str, params: dict | None = None) -> dict | None:
    with cursor() as cur:
        cur.execute(sql, params or {})
        return cur.fetchone()


def execute(sql: str, params: dict | None = None) -> None:
    with cursor() as cur:
        cur.execute(sql, params or {})
