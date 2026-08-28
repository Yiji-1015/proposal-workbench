#!/usr/bin/env python3
"""
ingest_pipeline.py
임의의 제안서 PPTX 파일을 입력받아:
1. 슬라이드별 고화질 PNG 렌더링 (PowerPoint COM)
2. 슬라이드 구조/텍스트/좌표 추출 및 HTML 생성 (python-pptx)
3. 메타데이터 생성 (Deterministic + AI 보완)
4. BGE-M3 임베딩 및 Elasticsearch 색인 (ES KNN)
을 한 번에 수행하는 통합 Ingest CLI 도구입니다.
"""

import argparse
import json
import os
import sys
from pathlib import Path

# 모듈 상대 임포트 경로 설정
CURRENT_DIR = Path(__file__).resolve().parent
WORKBENCH_ROOT = CURRENT_DIR.parent.parent

from extract_slide_structure import extract_slides
from caption_and_index import load_dotenv, process_and_index_slides


def run_ingest_pipeline(
    pptx_path: str,
    output_base_dir: str | None = None,
    skip_com_render: bool = False,
    no_es: bool = False,
    prefix_id: str | None = None,
) -> dict:
    pptx_file = Path(pptx_path).resolve()
    if not pptx_file.exists():
        raise FileNotFoundError(f"PPTX file not found: {pptx_file}")

    stem = pptx_file.stem.replace(" ", "_")
    prefix = prefix_id or stem[:20].lower()

    if output_base_dir:
        out_root = Path(output_base_dir).resolve() / stem
    else:
        out_root = WORKBENCH_ROOT / "storage" / "ingest_data" / stem

    out_slides_dir = out_root / "slides"
    out_html_dir = out_root / "html"
    out_slides_dir.mkdir(parents=True, exist_ok=True)
    out_html_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n==========================================")
    print(f"[PPT Ingest Pipeline] Starting: {pptx_file.name}")
    print(f"[Output Directory] {out_root}")
    print(f"==========================================\n")

    # Step 1: PowerPoint COM 고화질 PNG 렌더링
    rendered_pngs = []
    if not skip_com_render:
        try:
            from render_slides_com import render_pptx_to_png
            print("[Step 1/3] Rendering high-fidelity slide PNGs via PowerPoint COM...")
            rendered_pngs = render_pptx_to_png(str(pptx_file), str(out_slides_dir))
        except Exception as e:
            print(f"[Step 1/3 Warn] PowerPoint COM rendering failed or skipped: {e}")
    else:
        print("[Step 1/3] Skipping PowerPoint COM rendering (--skip-com-render specified)")

    # Step 2: python-pptx 슬라이드 구조, 텍스트 및 HTML 생성
    print("[Step 2/3] Extracting slide structure, texts, and absolute HTMLs...")
    extracted_slides = extract_slides(str(pptx_file), str(out_html_dir))

    # Step 3: 메타데이터 생성, BGE-M3 임베딩 및 Elasticsearch 색인
    print("[Step 3/3] Generating metadata, embeddings, and indexing into Elasticsearch...")
    env = {
        **load_dotenv(WORKBENCH_ROOT / ".env"),
        **load_dotenv(WORKBENCH_ROOT / "tools" / "reference-search" / ".env"),
        **os.environ,
    }

    indexed_docs = process_and_index_slides(
        extracted_slides=extracted_slides,
        env=env,
        prefix_id=prefix,
        no_es=no_es,
    )

    # Ingest Manifest 저장 (html_content 제외한 메타데이터 요약)
    manifest = {
        "source_pptx": pptx_file.name,
        "total_slides": len(extracted_slides),
        "rendered_png_count": len(rendered_pngs),
        "output_dir": str(out_root),
        "slides": [{k: v for k, v in doc.items() if k not in ["html", "description_vector"]} for doc in indexed_docs],
    }

    manifest_path = out_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n[PPT Ingest Complete] Successfully processed {len(extracted_slides)} slides!")
    print(f"[Manifest] {manifest_path}\n")

    return manifest


def main():
    parser = argparse.ArgumentParser(description="End-to-End PPTX Ingestion Pipeline.")
    parser.add_argument("--pptx", required=True, help="Path to the input PPTX file")
    parser.add_argument("--output-dir", help="Base output directory for slide images, HTMLs, and manifests")
    parser.add_argument("--skip-com-render", action="store_true", help="Skip PowerPoint COM PNG rendering")
    parser.add_argument("--no-es", action="store_true", help="Skip Elasticsearch indexing")
    parser.add_argument("--prefix-id", help="Prefix for slide_id (default: pptx filename stem)")

    args = parser.parse_args()

    try:
        run_ingest_pipeline(
            pptx_path=args.pptx,
            output_base_dir=args.output_dir,
            skip_com_render=args.skip_com_render,
            no_es=args.no_es,
            prefix_id=args.prefix_id,
        )
    except Exception as e:
        print(f"[Error] Pipeline failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
