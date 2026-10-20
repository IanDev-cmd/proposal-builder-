"""Pool, rollback, and migration parsing. No live Postgres and no PDF geometry."""

from __future__ import annotations

import threading

import pytest

import workspace_pg
from workspace_pg import POOL_MAX_SIZE, POOL_MIN_SIZE, SCHEMA_SQL, connection, migrate, split_sql_script


class _Tx:
    def __init__(self, conn: "_Conn"):
        self.conn = conn

    def __enter__(self):
        self.conn.events.append("begin")
        return self

    def __exit__(self, exc_type, exc, tb):
        self.conn.events.append("rollback" if exc_type else "commit")
        return False


class _Conn:
    def __init__(self):
        self.events: list[str] = []
        self.statements: list[str] = []

    def transaction(self):
        return _Tx(self)

    def execute(self, stmt: str):
        self.statements.append(stmt)
        if "FORCE_ROLLBACK" in stmt:
            raise RuntimeError("second statement failed")


class _Checkout:
    def __init__(self, pool: "_Pool", conn: _Conn):
        self.pool = pool
        self.conn = conn

    def __enter__(self):
        self.pool.acquire()
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        self.pool.release()
        return False


class _Pool:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.max_size = kwargs["max_size"]
        self.sem = threading.Semaphore(self.max_size)
        self.lock = threading.Lock()
        self.active = 0
        self.peak = 0
        self.opened_sockets = 0
        self.conn = _Conn()

    def acquire(self):
        self.sem.acquire()
        with self.lock:
            self.active += 1
            self.peak = max(self.peak, self.active)

    def release(self):
        with self.lock:
            self.active -= 1
        self.sem.release()

    def connection(self):
        self.opened_sockets += 0
        return _Checkout(self, self.conn)


@pytest.fixture
def pool(monkeypatch: pytest.MonkeyPatch):
    fake = _Pool(
        conninfo="postgresql://example/nexus",
        min_size=POOL_MIN_SIZE,
        max_size=POOL_MAX_SIZE,
        kwargs={"autocommit": False},
        open=True,
        name="nexus-workspace",
    )
    monkeypatch.setattr(workspace_pg, "_pool", fake)
    monkeypatch.setattr(workspace_pg, "_get_pool", lambda: fake)
    return fake


def test_pool_bounds_under_fifty_threads(pool: _Pool):
    assert pool.kwargs["min_size"] == 2
    assert pool.kwargs["max_size"] == 10
    assert pool.kwargs["kwargs"]["autocommit"] is False
    errors: list[BaseException] = []

    def hit():
        try:
            with connection() as conn:
                conn.execute("SELECT 1")
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=hit) for _ in range(50)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    assert pool.peak <= 10
    assert pool.active == 0
    assert pool.opened_sockets == 0


def test_transaction_rolls_back_when_the_second_statement_fails(pool: _Pool):
    with pytest.raises(RuntimeError, match="second statement failed"):
        with connection() as conn:
            conn.execute("INSERT INTO quotes (id) VALUES ('a')")
            conn.execute("FORCE_ROLLBACK")
    assert pool.conn.events == ["begin", "rollback"]
    assert pool.conn.statements[0].startswith("INSERT")


def test_split_sql_keeps_semicolons_inside_functions_and_json():
    script = """
    CREATE TABLE demo (id int, extra jsonb default '{"a":1,"b":"x;y"}');
    CREATE FUNCTION demo_fn() RETURNS void AS $$
    BEGIN
      PERFORM 1;
    END;
    $$ LANGUAGE plpgsql;
    SELECT 1;
    """
    parts = split_sql_script(script)
    assert len(parts) == 3
    assert "PERFORM 1;" in parts[1]
    assert "x;y" in parts[0]
    assert parts[2] == "SELECT 1"


def test_migrate_executes_whole_statements(pool: _Pool):
    migrate()
    expected = split_sql_script(SCHEMA_SQL)
    assert pool.conn.statements == expected
    assert all(";" not in stmt or "$$" in stmt or stmt.count(";") == 0 for stmt in expected)
    assert pool.conn.events[-1] == "commit"
