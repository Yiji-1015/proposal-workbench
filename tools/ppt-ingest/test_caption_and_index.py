import tempfile
from pathlib import Path

from caption_and_index import generate_heuristic_metadata, process_and_index_slides


def main():
    metadata = generate_heuristic_metadata({
        "title": "보안 아키텍처",
        "raw_text": "수집 단계와 연계 흐름도를 검증한다.",
    })
    assert metadata["layout"] == "diagram"
    assert "연계" in metadata["tags"]
    assert metadata["image_description"].startswith("이 장표는 보안 아키텍처")

    overview = generate_heuristic_metadata({
        "title": "1. 제안 개요",
        "raw_text": "1.2 제안 목적 및 추진전략\nRAG 기반 AI 챗봇과 데이터 플랫폼 구축 방향을 제시한다.",
    })
    assert overview["slide_type"] == "overview"
    assert "RAG" in overview["tags"]
    assert "제안 목적 및 추진전략" in overview["image_description"]


def test_image_ref_requires_rendered_png():
    slide = {
        "slide_no": 1,
        "source_pptx": "sample.pptx",
        "title": "샘플 장표",
        "raw_text": "구성도",
        "html_file_name": "slide_01.html",
    }

    with tempfile.TemporaryDirectory() as tmp:
        data_dir = Path(tmp)
        docs, _ = process_and_index_slides([slide], "sample", data_dir, {}, rendered_pngs=[])
        assert docs[0]["image_ref"] == ""
        assert docs[0]["render_status"] == "failed"

        png_path = data_dir / "ingest_data" / "sample" / "slides" / "slide-1.png"
        png_path.parent.mkdir(parents=True)
        png_path.write_bytes(b"png")
        docs, _ = process_and_index_slides([slide], "sample", data_dir, {}, rendered_pngs=[str(png_path)])
        assert docs[0]["image_ref"].endswith("/slides/slide-1.png")
        assert docs[0]["render_status"] == "completed"


if __name__ == "__main__":
    main()
    test_image_ref_requires_rendered_png()
