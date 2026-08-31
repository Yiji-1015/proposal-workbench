from caption_and_index import generate_heuristic_metadata


def main():
    metadata = generate_heuristic_metadata({
        "title": "보안 아키텍처",
        "raw_text": "수집 단계와 연계 흐름도를 검증한다.",
    })
    assert metadata["layout"] == "diagram"
    assert "연계" in metadata["tags"]
    assert metadata["image_description"].startswith("이 장표는 보안 아키텍처")


if __name__ == "__main__":
    main()
