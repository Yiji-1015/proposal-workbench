#!/usr/bin/env python3
"""
ingest_pipeline.py
PPTX를 슬라이드 이미지, 구조/텍스트 HTML, 메타데이터, SQLite3 색인으로 변환한다.
PowerPoint COM 렌더링과 BGE-M3 임베딩은 선택 기능이다.
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
WORKBENCH_ROOT = CURRENT_DIR.parent.parent

from extract_slide_structure import extract_slides
from caption_and_index import load_dotenv, process_and_index_slides


def generate_source_key(pptx_path: Path) -> str:
    path_bytes = str(pptx_path.resolve()).encode("utf-8")
    stem_clean = re_stem = "".join(c if c.isalnum() or c in "_-" else "_" for c in pptx_path.stem)
    h = hashlib.sha256(path_bytes).hexdigest()[:8]
    return f"{stem_clean}_{h}"


def run_ingest_pipeline(
    pptx_path: str,
    data_dir: str | None = None,
    skip_com_render: bool = False,
) -> dict:
    pptx_file = Path(pptx_path).resolve()
    if not pptx_file.exists():
        raise FileNotFoundError(f"PowerPoint source not found: {pptx_file}")
    if pptx_file.suffix.lower() not in {".pptx", ".potx"}:
        raise ValueError("Only .pptx and .potx sources are supported.")

    data_root = Path(data_dir).resolve() if data_dir else (WORKBENCH_ROOT / "storage")
    source_key = generate_source_key(pptx_file)

    out_root = data_root / "ingest_data" / source_key
    out_slides_dir = out_root / "slides"
    out_html_dir = out_root / "html"
    out_slides_dir.mkdir(parents=True, exist_ok=True)
    out_html_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n==========================================")
    print(f"[PPT Ingest Pipeline] Starting: {pptx_file.name}")
    print(f"[Source Key] {source_key}")
    print(f"[Output Directory] {out_root}")
    print(f"==========================================\n")

    source_type = "potx" if pptx_file.suffix.lower() == ".potx" else "pptx"

    # Step 1: PowerPoint COM 고화질 PNG 렌더링
    rendered_pngs = []
    render_status = {"status": "skipped", "completed": 0, "total": 0}
    if source_type == "potx":
        render_status["reason"] = "POTX template source has no reliable COM slide render."
        print("[Step 1/3] Skipping PowerPoint COM rendering for POTX template source")
    elif not skip_com_render:
        try:
            from render_slides_com import render_pptx_to_png
            print("[Step 1/3] Rendering high-fidelity slide PNGs via PowerPoint COM...")
            rendered_pngs = render_pptx_to_png(str(pptx_file), str(out_slides_dir))
            render_status = {
                "status": "completed" if len(rendered_pngs) > 0 else "failed",
                "completed": len(rendered_pngs),
                "total": len(rendered_pngs),
            }
        except Exception as e:
            render_status = {
                "status": "failed",
                "completed": 0,
                "error": str(e),
            }
            print(f"[Step 1/3 Note] PowerPoint COM rendering unavailable: {e}")
    else:
        print("[Step 1/3] Skipping PowerPoint COM rendering (--skip-com-render specified)")

    # Step 2: python-pptx 슬라이드 구조/텍스트 추출 및 HTML 생성
    print("[Step 2/3] Extracting slide structure, texts, and HTMLs...")
    extracted_slides = extract_slides(str(pptx_file), str(out_html_dir))

    # Step 3: 메타데이터 생성 및 SQLite3 색인
    print("[Step 3/3] Generating metadata and indexing into SQLite3 database...")
    env = {
        **load_dotenv(WORKBENCH_ROOT / ".env"),
        **load_dotenv(WORKBENCH_ROOT / "tools" / "reference-search" / ".env"),
        **os.environ,
    }

    indexed_docs, embedding_summary = process_and_index_slides(
        extracted_slides=extracted_slides,
        source_key=source_key,
        data_dir=data_root,
        env=env,
        # None means intentionally skipped; an empty list means rendering failed.
        rendered_pngs=rendered_pngs if not skip_com_render and source_type == "pptx" else None,
    )

    for doc, extracted in zip(indexed_docs, extracted_slides):
        doc["source_type"] = extracted.get("source_type", source_type)
        doc["layout_id"] = extracted.get("layout_id", "")
        doc["master_id"] = extracted.get("master_id", "")

    # Ingest Manifest 저장
    overall_status = "completed" if render_status["status"] in ["completed", "skipped"] else "partial"
    manifest = {
        "status": overall_status,
        "source_pptx": pptx_file.name,
        "source_path": str(pptx_file),
        "source_key": source_key,
        "source_type": source_type,
        "total_slides": len(extracted_slides),
        "render": render_status,
        "extract": {"status": "completed", "completed": len(extracted_slides)},
        "embedding": embedding_summary,
        "index": {
            "status": "completed",
            "db": str(data_root / "index" / "slides.sqlite3"),
            "completed": len(indexed_docs),
        },
        "output_dir": str(out_root),
        "slides": [{k: v for k, v in doc.items() if k not in ["vector", "html"]} for doc in indexed_docs],
    }

    manifest_path = out_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n[PPT Ingest Complete] Status: {overall_status} ({len(extracted_slides)} slides processed)")
    print(f"[Manifest] {manifest_path}\n")

    return manifest


def main():
    parser = argparse.ArgumentParser(description="End-to-End PPTX/POTX Ingestion Pipeline.")
    parser.add_argument("--source", "--pptx", dest="source_path", required=True, help="Path to the input .pptx or .potx file")
    parser.add_argument("--data-dir", help="Base data directory (default: storage/)")
    parser.add_argument("--skip-com-render", action="store_true", help="Skip PowerPoint COM PNG rendering")

    args = parser.parse_args()

    try:
        run_ingest_pipeline(
            pptx_path=args.source_path,
            data_dir=args.data_dir,
            skip_com_render=args.skip_com_render,
        )
    except Exception as e:
        print(f"[Error] Pipeline failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
