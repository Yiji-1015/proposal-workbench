#!/usr/bin/env python3
"""
caption_and_index.py
추출된 슬라이드 텍스트/이미지를 바탕으로 설명·태그를 구성하고, BGE-M3 임베딩 후 Elasticsearch에 색인합니다.
"""

import argparse
import base64
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_INDEX = "proposal_ppt_refs_v1"
DEFAULT_DIMS = 1024
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

    try:
        with urllib.request.urlopen(request, timeout=60, context=context) as response:
            text = response.read().decode("utf-8")
            return response.status, json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = text
        return exc.code, payload


def basic_auth_header(user, password):
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def join_url(base, path):
    return base.rstrip("/") + "/" + path.lstrip("/")


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

    return payload["data"][0]["embedding"]


def build_index_body(dims: int = DEFAULT_DIMS) -> dict:
    return {
        "mappings": {
            "properties": {
                "slide_id": {"type": "keyword"},
                "source_pptx": {"type": "keyword"},
                "slide_no": {"type": "integer"},
                "title": {"type": "text"},
                "image_description": {"type": "text"},
                "tags": {"type": "keyword"},
                "tags_text": {"type": "text"},
                "html": {"type": "text", "index": False},
                "html_ref": {"type": "keyword", "index": False},
                "image_ref": {"type": "keyword", "index": False},
                "layout": {"type": "keyword"},
                "year": {"type": "integer"},
                "description_vector": {
                    "type": "dense_vector",
                    "dims": dims,
                    "index": True,
                    "similarity": "cosine",
                },
                "created_at": {"type": "date"},
            }
        }
    }


def ensure_index(env: dict, index_name: str, dims: int = DEFAULT_DIMS):
    headers = {}
    if env.get("ELASTICSEARCH_USER") and env.get("ELASTICSEARCH_PASSWORD"):
        headers["Authorization"] = basic_auth_header(env["ELASTICSEARCH_USER"], env["ELASTICSEARCH_PASSWORD"])

    status, _ = request_json(join_url(env["ELASTICSEARCH_URL"], index_name), method="HEAD", headers=headers)
    if status == 200:
        return "exists"
    if status != 404:
        raise RuntimeError(f"Index check failed: HTTP {status}")

    status, payload = request_json(
        join_url(env["ELASTICSEARCH_URL"], index_name),
        method="PUT",
        body=build_index_body(dims),
        headers=headers,
    )
    if status >= 400:
        raise RuntimeError(f"Index create failed: HTTP {status} {payload}")
    return "created"


def index_document(env: dict, index_name: str, doc: dict):
    headers = {}
    if env.get("ELASTICSEARCH_USER") and env.get("ELASTICSEARCH_PASSWORD"):
        headers["Authorization"] = basic_auth_header(env["ELASTICSEARCH_USER"], env["ELASTICSEARCH_PASSWORD"])

    # slide_id를 고유 _id로 사용하여 중복 색인 방지 (Upsert)
    url = join_url(env["ELASTICSEARCH_URL"], f"{index_name}/_doc/{doc['slide_id']}")
    status, payload = request_json(url, method="PUT", body=doc, headers=headers)
    if status >= 400:
        raise RuntimeError(f"Index document failed: HTTP {status} {payload}")
    return payload


def generate_heuristic_metadata(slide: dict) -> dict:
    """텍스트 기반 기본 메타데이터 및 설명 생성 (AI 캡셔닝 전단계 또는 Fallback)"""
    title = slide.get("title", "")
    raw_text = slide.get("raw_text", "")
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

    # 태그 추출 (간단한 키워드 추출)
    words = re.findall(r"[가-힣A-Za-z0-9_]{2,}", raw_text)
    stop_words = {"제안", "사업", "추진", "방안", "시스템", "목표", "구축", "제공", "기능", "대하여", "통해", "위해"}
    freq = {}
    for w in words:
        if w not in stop_words and len(w) >= 2:
            freq[w] = freq.get(w, 0) + 1

    sorted_tags = sorted(freq.keys(), key=lambda x: freq[x], reverse=True)[:6]
    if not sorted_tags and title:
        sorted_tags = [title[:10]]

    # 레이아웃 판별 휴리스틱
    layout = "bullets"
    if any(k in raw_text for k in ["아키텍처", "구성도", "흐름도", "프로세스", "단계", "연계"]):
        layout = "diagram"
    elif any(k in raw_text for k in ["표", "매핑", "구분", "항목", "비교"]):
        layout = "table"
    elif any(k in raw_text for k in ["%", "건", "초", "TPS", "지표", "KPI"]):
        layout = "chart"

    # 기본 설명 텍스트
    description = f"이 장표는 {title}에 대한 제안 내용을 설명한다. 주요 내용: {', '.join(lines[:4])}"

    return {
        "image_description": description,
        "tags": sorted_tags,
        "tags_text": " ".join(sorted_tags),
        "layout": layout,
    }


def process_and_index_slides(
    extracted_slides: list[dict],
    env: dict,
    index_name: str = DEFAULT_INDEX,
    prefix_id: str = "slide",
    no_es: bool = False,
) -> list[dict]:
    created_at = datetime.now(timezone.utc).isoformat()
    if not no_es and env.get("ELASTICSEARCH_URL"):
        print(f"[Index] Index state: {ensure_index(env, index_name)}")

    indexed_docs = []

    for s in extracted_slides:
        slide_no = s["slide_no"]
        slide_id = f"{prefix_id}_{slide_no:03d}"
        
        # 메타데이터 생성 (휴리스틱 또는 추후 VLM 결과 적용)
        meta = generate_heuristic_metadata(s)

        doc = {
            "slide_id": slide_id,
            "source_pptx": s["source_pptx"],
            "slide_no": slide_no,
            "title": s["title"],
            "image_description": meta["image_description"],
            "tags": meta["tags"],
            "tags_text": meta["tags_text"],
            "layout": meta["layout"],
            "year": s.get("year", 2026),
            "html": s.get("html_content", ""),
            "html_ref": f"/html/{s.get('html_file_name', f'slide_{slide_no:02d}.html')}",
            "image_ref": f"/slides/slide-{slide_no}.png",
            "created_at": created_at,
        }

        # BGE-M3 임베딩 생성
        if env.get("EMBEDDING_API_URL"):
            try:
                embedding = embed_text(env, doc["image_description"])
                doc["description_vector"] = embedding
            except Exception as e:
                print(f"[Warn] Embedding failed for {slide_id}: {e}", file=sys.stderr)

        # Elasticsearch 색인
        if not no_es and env.get("ELASTICSEARCH_URL") and "description_vector" in doc:
            try:
                res = index_document(env, index_name, doc)
                print(f"[Index] {slide_id} -> ES OK ({res.get('result')})")
            except Exception as e:
                print(f"[Warn] ES indexing failed for {slide_id}: {e}", file=sys.stderr)

        indexed_docs.append(doc)

    return indexed_docs
