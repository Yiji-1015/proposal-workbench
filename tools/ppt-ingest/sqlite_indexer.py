import array
import json
import sqlite3
from pathlib import Path


def get_db_path(data_dir: Path) -> Path:
    return data_dir / "index" / "slides.sqlite3"


def init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS slides (
              slide_id TEXT PRIMARY KEY,
              source_key TEXT NOT NULL,
              source_pptx TEXT NOT NULL,
              slide_no INTEGER NOT NULL,
              title TEXT,
              content_text TEXT,
              image_description TEXT,
              tags_json TEXT,
              layout TEXT,
              slide_type TEXT,
              image_ref TEXT,
              html_ref TEXT,
              vector BLOB,
              vector_dim INTEGER,
              embedding_model TEXT,
              render_status TEXT,
              embedding_status TEXT,
              updated_at TEXT
            );
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_slides_source_key ON slides(source_key);
        """)
        try:
            conn.execute("ALTER TABLE slides ADD COLUMN slide_type TEXT")
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise
    return conn


def upsert_slides(conn: sqlite3.Connection, source_key: str, slides: list[dict]):
    with conn:
        conn.execute("DELETE FROM slides WHERE source_key = ?", (source_key,))
        insert_sql = """
            INSERT INTO slides (
              slide_id, source_key, source_pptx, slide_no, title,
              content_text, image_description, tags_json, layout, slide_type,
              image_ref, html_ref, vector, vector_dim, embedding_model,
              render_status, embedding_status, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?
            )
        """
        for s in slides:
            vec_blob = None
            vec_dim = 0
            if "vector" in s and s["vector"]:
                v = s["vector"]
                vec_blob = array.array("f", v).tobytes()
                vec_dim = len(v)

            tags_json = s.get("tags_json")
            if not tags_json:
                tags_json = json.dumps(s.get("tags", []), ensure_ascii=False)

            conn.execute(insert_sql, (
                s["slide_id"],
                source_key,
                s.get("source_pptx", ""),
                s.get("slide_no", 0),
                s.get("title", ""),
                s.get("content_text", ""),
                s.get("image_description", ""),
                tags_json,
                s.get("layout", "diagram"),
                s.get("slide_type", "content"),
                s.get("image_ref", ""),
                s.get("html_ref", ""),
                vec_blob,
                vec_dim,
                s.get("embedding_model", ""),
                s.get("render_status", "completed"),
                s.get("embedding_status", "skipped"),
                s.get("updated_at", "")
            ))
