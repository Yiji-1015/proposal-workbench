#!/usr/bin/env python3
"""
render_slides_com.py
PowerPoint COM Automation을 사용하여 PPTX의 각 슬라이드를 고화질 PNG로 렌더링합니다.
(Windows 전용, Microsoft PowerPoint 설치 필요)
"""

import argparse
import os
import sys
from pathlib import Path


def render_pptx_to_png(pptx_path: str, output_dir: str, width: int = 1920, height: int = 1080) -> list[str]:
    pptx_file = Path(pptx_path).resolve()
    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if not pptx_file.exists():
        raise FileNotFoundError(f"PPTX file not found: {pptx_file}")

    try:
        import win32com.client
    except ImportError:
        raise RuntimeError("pywin32 (win32com.client) is required for PowerPoint COM rendering.")

    print(f"[COM Renderer] Opening PowerPoint to render: {pptx_file.name}")
    powerpoint = None
    presentation = None
    rendered_images = []

    try:
        # PowerPoint 애플리케이션 시작 (백그라운드)
        powerpoint = win32com.client.DispatchEx("PowerPoint.Application")
        # WithWindow=False 로 창 띄우지 않고 로드 (일부 환경에서 1=ReadOnly, 0=WithWindow)
        presentation = powerpoint.Presentations.Open(str(pptx_file), ReadOnly=1, Untitled=0, WithWindow=0)

        slide_count = presentation.Slides.Count
        print(f"[COM Renderer] Total slides found: {slide_count}")

        for i in range(1, slide_count + 1):
            slide = presentation.Slides(i)
            png_name = f"slide-{i}.png"
            png_path = out_dir / png_name
            # Export(Path, FilterName, ScaleWidth, ScaleHeight)
            slide.Export(str(png_path), "PNG", width, height)
            rendered_images.append(str(png_path))
            print(f"[COM Renderer] Exported: {png_name}")

    except Exception as e:
        print(f"[COM Renderer Error] Failed rendering via COM: {e}", file=sys.stderr)
        raise
    finally:
        if presentation:
            presentation.Close()
        if powerpoint:
            powerpoint.Quit()

    return rendered_images


def main():
    parser = argparse.ArgumentParser(description="Render PPTX slides to high-fidelity PNG using PowerPoint COM.")
    parser.add_argument("--pptx", required=True, help="Path to the .pptx file")
    parser.add_argument("--output-dir", required=True, help="Directory to save exported PNGs")
    parser.add_argument("--width", type=int, default=1920, help="Export image width (default: 1920)")
    parser.add_argument("--height", type=int, default=1080, help="Export image height (default: 1080)")

    args = parser.parse_args()
    results = render_pptx_to_png(args.pptx, args.output_dir, args.width, args.height)
    print(f"[COM Renderer] Complete! Exported {len(results)} slides to {args.output_dir}")


if __name__ == "__main__":
    main()
