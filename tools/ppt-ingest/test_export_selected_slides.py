import tempfile
from pathlib import Path

from export_selected_slides_com import export_selected_slides, parse_slide_numbers


def main():
    assert parse_slide_numbers("28,3") == [28, 3]

    for invalid in ("", "0", "1,1", "a"):
        try:
            parse_slide_numbers(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Expected invalid slide list: {invalid!r}")

    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "source.pptx"
        source.write_bytes(b"pptx")
        try:
            export_selected_slides(str(source), str(source), [1])
        except ValueError as exc:
            assert "different" in str(exc).lower()
            assert source.exists()
        else:
            raise AssertionError("Source and output paths must not match")


if __name__ == "__main__":
    main()
