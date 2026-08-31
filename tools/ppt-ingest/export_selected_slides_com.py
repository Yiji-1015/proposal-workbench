#!/usr/bin/env python3
"""선택한 원본 슬라이드를 편집 가능한 PPTX로 추출한다."""

import argparse
import os
from pathlib import Path
from uuid import uuid4


def parse_slide_numbers(value: str) -> list[int]:
    try:
        numbers = [int(item.strip()) for item in value.split(",") if item.strip()]
    except ValueError as exc:
        raise ValueError("Slide numbers must be comma-separated integers.") from exc
    if not numbers or any(number < 1 for number in numbers) or len(set(numbers)) != len(numbers):
        raise ValueError("Slide numbers must be unique positive integers.")
    return numbers


def export_selected_slides(pptx_path: str, output_pptx: str, slide_numbers: list[int]) -> Path:
    source_path = Path(pptx_path).resolve()
    output_path = Path(output_pptx).resolve()
    if not source_path.is_file() or source_path.suffix.lower() != ".pptx":
        raise FileNotFoundError(f"PPTX file not found: {source_path}")
    if source_path == output_path or (output_path.exists() and source_path.samefile(output_path)):
        raise ValueError("Source and output PPTX paths must be different.")
    if not slide_numbers or any(number < 1 for number in slide_numbers):
        raise ValueError("At least one positive slide number is required.")

    try:
        import win32com.client
    except ImportError as exc:
        raise RuntimeError("pywin32 is required for editable PPTX export.") from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = output_path.parent / ".pptx-export-tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"{uuid4().hex}.pptx"
    powerpoint = None
    source = None
    exported = None
    succeeded = False
    try:
        powerpoint = win32com.client.DispatchEx("PowerPoint.Application")
        source = powerpoint.Presentations.Open(str(source_path), ReadOnly=1, Untitled=0, WithWindow=0)
        total = source.Slides.Count
        invalid = [number for number in slide_numbers if number > total]
        if invalid:
            raise ValueError(f"Slide number exceeds deck size ({total}): {invalid[0]}")

        source.SaveCopyAs(str(temp_path), 24)  # ppSaveAsOpenXMLPresentation
        source.Close()
        source = None

        exported = powerpoint.Presentations.Open(str(temp_path), ReadOnly=0, Untitled=0, WithWindow=0)
        selected = set(slide_numbers)
        for slide_number in range(total, 0, -1):
            if slide_number not in selected:
                exported.Slides(slide_number).Delete()
        exported.Save()
        succeeded = True
    finally:
        for handle, method in ((exported, "Close"), (source, "Close"), (powerpoint, "Quit")):
            if handle is not None:
                try:
                    getattr(handle, method)()
                except Exception:
                    pass
        if not succeeded and temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass

    if not temp_path.is_file():
        raise RuntimeError("PowerPoint did not create the temporary PPTX.")
    try:
        os.replace(temp_path, output_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()
        try:
            temp_dir.rmdir()
        except OSError:
            pass
    if not output_path.is_file():
        raise RuntimeError("PowerPoint did not publish the output PPTX.")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Export selected source slides to editable PPTX.")
    parser.add_argument("--pptx", required=True)
    parser.add_argument("--output-pptx", required=True)
    parser.add_argument("--slides", required=True, help="Comma-separated 1-based slide numbers")
    args = parser.parse_args()
    result = export_selected_slides(args.pptx, args.output_pptx, parse_slide_numbers(args.slides))
    print(result)


if __name__ == "__main__":
    main()
