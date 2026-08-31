#!/usr/bin/env python3
"""
caption_and_index.py
슬라이드 텍스트에서 결정론적 메타데이터를 만들고 SQLite3에 색인한다.
BGE-M3 임베딩은 설정된 API가 있을 때만 선택적으로 요청한다.
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
HEADING_RE = re.compile(r"^\s*\d+(?:\.\d+)*\.?\s+(.+?)\s*$")
TOKEN_RE = re.compile(r"[가-힣A-Za-z][가-힣A-Za-z0-9_+./-]{1,}")


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


def request_json(url: str, method="GET", body=None, headers=None, insecure=False):
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

    insecure_tls = str(env.get("EMBEDDING_INSECURE_TLS", "")).lower() in {"1", "true", "yes"}
    status, payload = request_json(
        api_url,
        method="POST",
        body={"model": model, "input": text},
        headers=headers,
        insecure=insecure_tls,
    )
    if status >= 400:
        raise RuntimeError(f"Embedding failed: HTTP {status} {payload}")

    if "data" in payload and len(payload["data"]) > 0:
        return payload["data"][0]["embedding"]
    if "embedding" in payload:
        return payload["embedding"]
    raise RuntimeError("Embedding response missing vector payload.")


def extract_headings(raw_text: str) -> list[str]:
    headings = []
    for line in raw_text.splitlines():
        match = HEADING_RE.match(line.strip())
        if match and len(match.group(1)) <= 100:
            heading = match.group(1).strip()
            if heading not in headings:
                headings.append(heading)
    return headings


def classify_slide_type(title: str, headings: list[str], raw_text: str) -> str:
    # 제목/소제목을 우선한다. 본문에 '아키텍처'가 한 번 언급된 개요 장표가
    # architecture로 오분류되지 않게 하는 최소한의 보호 장치다.
    heading_text = " ".join([title, *headings]).lower()
    if any(k in heading_text for k in ["아키텍처", "구성도", "시스템 구성"]):
        return "architecture"
    if any(k in heading_text for k in ["제안 개요", "제안 목적", "특장점", "기대효과"]):
        return "overview"
    if any(k in heading_text for k in ["전략", "구축방안", "추진방안"]):
        return "strategy"
    if any(k in heading_text for k in ["요구사항", "수용표", "기능범위"]):
        return "requirements"
    if any(k in heading_text for k in ["일정", "수행계획", "wbs", "로드맵"]):
        return "plan"
    if any(k in heading_text for k in ["운영", "유지보수", "품질관리"]):
        return "operations"
    if any(k in raw_text.lower() for k in ["구성도", "흐름도", "프로세스"]):
        return "diagram"
    if any(k in raw_text for k in ["표", "매핑", "비교"]):
        return "table"
    return "content"


def generate_heuristic_metadata(slide: dict) -> dict:
    title = slide.get("title", "")
    raw_text = slide.get("raw_text", "")
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    headings = extract_headings(raw_text)
    slide_type = classify_slide_type(title, headings, raw_text)

    words = TOKEN_RE.findall(f"{title} {' '.join(headings)} {raw_text}")
    stop_words = {
        "제안", "사업", "추진", "방안", "시스템", "목표", "구축", "제공", "기능",
        "대하여", "통해", "위해", "대한", "기반", "내용", "관리", "확인", "구성",
    }
    freq = {}
    for w in words:
        if w in stop_words or len(w) < 2:
            continue
        freq[w] = freq.get(w, 0) + 1

    title_and_headings = " ".join([title, *headings])
    sorted_tags = sorted(
        freq.keys(),
        key=lambda word: (
            freq[word]
            + (3 if word in title_and_headings else 0)
            + (2 if re.search(r"[A-Z]", word) else 0),
            len(word),
        ),
        reverse=True,
    )[:10]
    if not sorted_tags and title:
        sorted_tags = [title[:10]]

    layout = "bullets"
    if any(k in raw_text for k in ["아키텍처", "구성도", "흐름도", "프로세스", "단계", "연계"]):
        layout = "diagram"
    elif any(k in raw_text for k in ["표", "매핑", "구분", "항목", "비교"]):
        layout = "table"
    elif any(k in raw_text for k in ["%", "건", "초", "TPS", "지표", "KPI"]):
        layout = "chart"

    primary_heading = headings[0] if headings else title
    body_lines = [
        line for line in lines
        if not HEADING_RE.match(line) and not re.fullmatch(r"\d+", line)
    ]
    lead = " ".join(body_lines[:3]).strip()
    if len(lead) > 320:
        lead = lead[:317].rstrip() + "..."
    description = (
        f"이 장표는 {primary_heading} 범위의 {slide_type} 내용을 설명한다. "
        f"핵심 주제: {', '.join(sorted_tags)}."
    )
    if lead:
        description += f" 주요 내용: {lead}"

    return {
        "image_description": description,
        "tags": sorted_tags,
        "tags_text": " ".join(sorted_tags),
        "layout": layout,
        "slide_type": slide_type,
        "headings": headings,
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
        image_path = data_dir / "ingest_data" / source_key / "slides" / f"slide-{slide_no}.png"
        image_ref = (
            f"/storage/ingest_data/{source_key}/slides/slide-{slide_no}.png"
            if is_rendered and image_path.is_file()
            else ""
        )

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
            "slide_type": meta["slide_type"],
            "headings": meta["headings"],
            "image_ref": image_ref,
            "html_ref": f"/storage/ingest_data/{source_key}/html/{s.get('html_file_name', f'slide_{slide_no:02d}.html')}",
            "vector": None,
            "embedding_model": None,
            "render_status": render_status,
            "embedding_status": "skipped",
            "updated_at": created_at,
        }

        # BGE-M3 임베딩 요청(선택)
        if env.get("EMBEDDING_API_URL"):
            try:
                embedding_input = "\n".join([
                    doc["title"],
                    doc["image_description"],
                    doc["content_text"],
                    doc["tags_text"],
                ])
                vec = embed_text(env, embedding_input)
                doc["vector"] = vec
                doc["embedding_model"] = env.get("EMBEDDING_MODEL_NAME") or env.get("EMBEDDING_MODEL") or DEFAULT_MODEL
                doc["embedding_status"] = "completed"
                has_embeddings = True
            except Exception as e:
                embedding_failures += 1
                doc["embedding_status"] = "failed"
                print(f"[Warn] Embedding failed for {slide_id}: {e}", file=sys.stderr)

        indexed_docs.append(doc)

    # SQLite3 색인용 문서와 임베딩을 준비한다.
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
