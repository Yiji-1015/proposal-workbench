#!/usr/bin/env python3
"""
caption_and_index.py
??? ???? ???? ???? ?????(??/??/????)? ????
????? BGE-M3 ??? ? SQLite3 ??????? ?????.
"""

import hashlib
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from sqlite_indexer import get_db_path, init_db, upsert_slides

DEFAULT_MODEL = "BAAI/bge-m3"


def load_dotenv(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def request_json(url: str, method="GET", body=None, headers=None, insecure=True):
    data = None
    request_headers = dict(headers or {})
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    context = ssl._create_unverified_context() if insecure else None
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)

    with urllib.request.urlopen(request, timeout=30, context=context) as response:
        text = response.read().decode("utf-8")
        return response.status, json.loads(text) if text else {}


def embed_text(env: dict, text: str) -> list[float]:
    model = env.get("EMBEDDING_MODEL_NAME") or env.get("EMBEDDING_MODEL") or DEFAULT_MODEL
    api_url = env.get("EMBEDDING_API_URL")
    if not api_url:
        raise ValueError("EMBEDDING_API_URL is missing in environment.")

    headers = {}
    if env.get("EMBEDDING_API_KEY"):
        headers["Authorization"] = f"Bearer {env['EMBEDDING_API_KEY']}"

    status, payload = request_json(api_url, method="POST", body={"model": model, "input": text}, headers=headers)
    if status >= 400:
        raise RuntimeError(f"Embedding failed: HTTP {status} {payload}")

    if "data" in payload and len(payload["data"]) > 0:
        return payload["data"][0]["embedding"]
    if "embedding" in payload:
        return payload["embedding"]
    raise RuntimeError("Embedding response missing vector payload.")


def generate_heuristic_metadata(slide: dict) -> dict:
    title = slide.get("title", "")
    raw_text = slide.get("raw_text", "")
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

    words = re.findall(r"[?-?A-Za-z0-9_]{2,}", raw_text)
    stop_words = {"??", "??", "??", "??", "???", "??", "??", "??", "??", "???", "??", "??"}
    freq = {}
    for w in words:
        if w not in stop_words and len(w) >= 2:
            freq[w] = freq.get(w, 0) + 1

    sorted_tags = sorted(freq.keys(), key=lambda x: freq[x], reverse=True)[:6]
    if not sorted_tags and title:
        sorted_tags = [title[:10]]

    layout = "bullets"
    if any(k in raw_text for k in ["????", "???", "???", "????", "??", "??"]):
        layout = "diagram"
    elif any(k in raw_text for k in ["?", "??", "??", "??", "??"]):
        layout = "table"
    elif any(k in raw_text for k in ["%", "?", "?", "TPS", "??", "KPI"]):
        layout = "chart"

    description = f"? ??? {title}? ?? ?? ??? ????. ?? ??: {', '.join(lines[:4])}"

    return {
        "image_description": description,
        "tags": sorted_tags,
        "tags_text": " ".join(sorted_tags),
        "layout": layout,
    }


def process_and_index_slides(
    extracted_slides: list[dict],
    source_key: str,
    data_dir: Path,
    env: dict,
    rendered_pngs: list[str] | None = None,
) -> tuple[list[dict], dict]:
    created_at = datetime.now(timezone.utc).isoformat()
    indexed_docs = []
    has_embeddings = False
    embedding_failures = 0

    rendered_slide_nos = set()
    if rendered_pngs:
        for p in rendered_pngs:
            match = re.search(r"slide[-_](\d+)", Path(p).stem, re.IGNORECASE)
            if match:
                rendered_slide_nos.add(int(match.group(1)))

    for s in extracted_slides:
        slide_no = s["slide_no"]
        slide_id = f"{source_key}_s{slide_no:03d}"
        meta = generate_heuristic_metadata(s)

        is_rendered = slide_no in rendered_slide_nos if rendered_pngs is not None else False
        render_status = "completed" if is_rendered else ("skipped" if rendered_pngs is None else "failed")

        doc = {
            "slide_id": slide_id,
            "source_key": source_key,
            "source_pptx": s["source_pptx"],
            "slide_no": slide_no,
            "title": s["title"],
            "content_text": s.get("raw_text", ""),
            "image_description": meta["image_description"],
            "tags": meta["tags"],
            "tags_json": json.dumps(meta["tags"], ensure_ascii=False),
            "tags_text": meta["tags_text"],
            "layout": meta["layout"],
            "image_ref": f"/storage/ingest_data/{source_key}/slides/slide-{slide_no}.png",
            "html_ref": f"/storage/ingest_data/{source_key}/html/{s.get('html_file_name', f'slide_{slide_no:02d}.html')}",
            "vector": None,
            "embedding_model": None,
            "render_status": render_status,
            "embedding_status": "skipped",
            "updated_at": created_at,
        }

        # BGE-M3 ??? ?? (???)
        if env.get("EMBEDDING_API_URL"):
            try:
                vec = embed_text(env, doc["image_description"])
                doc["vector"] = vec
                doc["embedding_model"] = env.get("EMBEDDING_MODEL_NAME") or env.get("EMBEDDING_MODEL") or DEFAULT_MODEL
                doc["embedding_status"] = "completed"
                has_embeddings = True
            except Exception as e:
                embedding_failures += 1
                doc["embedding_status"] = "failed"
                print(f"[Warn] Embedding failed for {slide_id}: {e}", file=sys.stderr)

        indexed_docs.append(doc)

    # SQLite3 ??????? ?? ?????? ??? ??
    db_path = get_db_path(data_dir)
    conn = init_db(db_path)
    try:
        upsert_slides(conn, source_key, indexed_docs)
        print(f"[SQLite Index] Successfully indexed {len(indexed_docs)} slides into {db_path}")
    finally:
        conn.close()

    embedding_summary = {
        "status": "completed" if has_embeddings and embedding_failures == 0 else ("partial" if has_embeddings else "skipped"),
        "mode": "semantic" if has_embeddings else "lexical",
        "completed": sum(1 for d in indexed_docs if d["embedding_status"] == "completed"),
        "total": len(indexed_docs),
    }

    return indexed_docs, embedding_summary
