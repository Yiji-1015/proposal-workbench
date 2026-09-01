#!/usr/bin/env python3
"""Read native PPTX/POTX structure for reusable proposal asset curation.

The module intentionally keeps the first pass deterministic and dependency-light:
OOXML is read directly from the package so POTX files work even when python-pptx
rejects their template content type.
"""

from __future__ import annotations

import posixpath
import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"

NS = {"a": A_NS, "p": P_NS, "r": R_NS}
EMU_PER_INCH = 914400
PX_PER_INCH = 96
SUPPORTED_DIRECT_SHAPES = {"sp", "cxnSp", "pic", "grpSp", "graphicFrame"}


def local_name(element: ET.Element) -> str:
    """Return the direct OOXML element name without its namespace."""

    return element.tag.rsplit("}", 1)[-1]


def shape_kind(element: ET.Element) -> str:
    """Classify only the current element; descendants must not affect it."""

    return {
        "grpSp": "group",
        "cxnSp": "connector",
        "pic": "picture",
        "graphicFrame": "unsupported_graphic",
        "sp": "shape",
    }.get(local_name(element), "unsupported")


def emu_to_px(value: int | float) -> float:
    return float(value) / EMU_PER_INCH * PX_PER_INCH


def _xml(package: zipfile.ZipFile, part: str) -> ET.Element:
    try:
        return ET.fromstring(package.read(part))
    except KeyError as exc:
        raise ValueError(f"Missing OOXML part: {part}") from exc
    except ET.ParseError as exc:
        raise ValueError(f"Invalid OOXML part: {part}") from exc


def _relationship_part(part: str) -> str:
    directory, filename = posixpath.split(part)
    return posixpath.join(directory, "_rels", f"{filename}.rels")


def _safe_target(part: str, target: str) -> str:
    if target.startswith("/"):
        resolved = posixpath.normpath(target.lstrip("/"))
    else:
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(part), target))
    if resolved == ".." or resolved.startswith("../"):
        raise ValueError(f"OOXML relationship escapes package: {part} -> {target}")
    return resolved


def _relationships(package: zipfile.ZipFile, part: str) -> dict[str, dict[str, str]]:
    rel_part = _relationship_part(part)
    try:
        root = _xml(package, rel_part)
    except ValueError as exc:
        if "Missing OOXML part" in str(exc):
            return {}
        raise
    result: dict[str, dict[str, str]] = {}
    for relationship in root:
        if local_name(relationship) != "Relationship":
            continue
        rid = relationship.get("Id")
        target = relationship.get("Target")
        if not rid or not target:
            continue
        result[rid] = {
            "type": relationship.get("Type", ""),
            "target": _safe_target(part, target),
            "target_mode": relationship.get("TargetMode", ""),
        }
    return result


def _relationship_target(
    package: zipfile.ZipFile,
    part: str,
    relationship_id: str | None,
    type_suffix: str | None = None,
) -> str | None:
    if not relationship_id:
        return None
    relationship = _relationships(package, part).get(relationship_id)
    if not relationship or relationship["target_mode"] == "External":
        return None
    if type_suffix and not relationship["type"].endswith(type_suffix):
        return None
    return relationship["target"]


def _content_types(package: zipfile.ZipFile) -> dict[str, str]:
    root = _xml(package, "[Content_Types].xml")
    defaults: dict[str, str] = {}
    overrides: dict[str, str] = {}
    for element in root:
        name = local_name(element)
        if name == "Default" and element.get("Extension") and element.get("ContentType"):
            defaults[element.get("Extension", "").lower()] = element.get("ContentType", "")
        elif name == "Override" and element.get("PartName") and element.get("ContentType"):
            overrides[element.get("PartName", "").lstrip("/")] = element.get("ContentType", "")
    result = dict(overrides)
    for part in package.namelist():
        result.setdefault(part, defaults.get(Path(part).suffix.lstrip(".").lower(), ""))
    return result


def _attr_int(element: ET.Element | None, name: str, default: int = 0) -> int:
    if element is None:
        return default
    try:
        return int(element.get(name, default))
    except (TypeError, ValueError):
        return default


def _direct_xfrm(element: ET.Element) -> ET.Element | None:
    for path in (
        "./p:spPr/a:xfrm",
        "./p:grpSpPr/a:xfrm",
        "./p:xfrm",
    ):
        found = element.find(path, NS)
        if found is not None:
            return found
    return None


def _xfrm_values(element: ET.Element) -> dict[str, int]:
    xfrm = _direct_xfrm(element)
    if xfrm is None:
        return {"x": 0, "y": 0, "w": 0, "h": 0, "cx": 0, "cy": 0, "cw": 0, "ch": 0}
    off = xfrm.find("./a:off", NS)
    ext = xfrm.find("./a:ext", NS)
    child_off = xfrm.find("./a:chOff", NS)
    child_ext = xfrm.find("./a:chExt", NS)
    return {
        "x": _attr_int(off, "x"),
        "y": _attr_int(off, "y"),
        "w": _attr_int(ext, "cx"),
        "h": _attr_int(ext, "cy"),
        "cx": _attr_int(child_off, "x", _attr_int(off, "x")),
        "cy": _attr_int(child_off, "y", _attr_int(off, "y")),
        "cw": _attr_int(child_ext, "cx", _attr_int(ext, "cx")),
        "ch": _attr_int(child_ext, "cy", _attr_int(ext, "cy")),
    }


def _transform_bounds(bounds: dict[str, int], transform: dict[str, int] | None) -> dict[str, int]:
    if not transform:
        return dict(bounds)
    source_width = transform["cw"] or transform["w"] or 1
    source_height = transform["ch"] or transform["h"] or 1
    scale_x = transform["w"] / source_width if transform["w"] else 1
    scale_y = transform["h"] / source_height if transform["h"] else 1
    x = transform["x"] + (bounds["x"] - transform["cx"]) * scale_x
    y = transform["y"] + (bounds["y"] - transform["cy"]) * scale_y
    return {
        "x": round(x),
        "y": round(y),
        "w": round(bounds["w"] * scale_x),
        "h": round(bounds["h"] * scale_y),
    }


def _shape_id_and_name(element: ET.Element) -> tuple[str, str]:
    for path in (
        "./p:nvSpPr/p:cNvPr",
        "./p:nvCxnSpPr/p:cNvPr",
        "./p:nvPicPr/p:cNvPr",
        "./p:nvGrpSpPr/p:cNvPr",
        "./p:nvGraphicFramePr/p:cNvPr",
    ):
        node = element.find(path, NS)
        if node is not None:
            return node.get("id", ""), node.get("name", "")
    return "", ""


def _shape_text(element: ET.Element) -> str:
    paragraphs = []
    for paragraph in element.findall(".//a:p", NS):
        value = "".join(text.text or "" for text in paragraph.findall(".//a:t", NS))
        if value:
            paragraphs.append(value)
    return "\n".join(paragraphs).strip()


def _placeholder(element: ET.Element) -> dict[str, str] | None:
    for node in element.findall("./p:nvSpPr/p:nvPr/p:ph", NS):
        return {
            "type": node.get("type", "body"),
            "idx": node.get("idx", "0"),
        }
    return None


def _color(element: ET.Element | None, path: str) -> str | None:
    if element is None:
        return None
    node = element.find(path, NS)
    if node is None:
        return None
    value = node.get("val") or node.get("lastClr")
    return f"#{value.upper()}" if value and re.fullmatch(r"[0-9A-Fa-f]{6}", value) else value


def _custom_geometry(element: ET.Element) -> list[dict[str, Any]]:
    geometry = element.find("./p:spPr/a:custGeom", NS)
    if geometry is None:
        return []
    paths: list[dict[str, Any]] = []
    for path in geometry.findall("./a:pathLst/a:path", NS):
        commands: list[dict[str, Any]] = []
        for command in path:
            name = local_name(command)
            if name == "close":
                commands.append({"close": {}})
                continue
            point = command.find("./a:pt", NS)
            if point is None or name not in {"moveTo", "lnTo"}:
                commands.append({"unsupported": name})
                continue
            commands.append({
                "moveTo" if name == "moveTo" else "lineTo": {
                    "x": _attr_int(point, "x"),
                    "y": _attr_int(point, "y"),
                }
            })
        paths.append({
            "width": _attr_int(path, "w"),
            "height": _attr_int(path, "h"),
            "commands": commands,
        })
    return paths


def _connector(element: ET.Element) -> dict[str, str] | None:
    node = element.find("./p:nvCxnSpPr/p:cNvCxnSpPr", NS)
    if node is None:
        return None
    start = node.find("./a:stCxn", NS)
    end = node.find("./a:endCxn", NS)
    if start is None and end is None:
        return None
    return {
        "start_id": start.get("id", "") if start is not None else "",
        "start_idx": start.get("idx", "0") if start is not None else "0",
        "end_id": end.get("id", "") if end is not None else "",
        "end_idx": end.get("idx", "0") if end is not None else "0",
    }


def _picture_media(package: zipfile.ZipFile, part: str, element: ET.Element, content_types: dict[str, str]) -> dict[str, str] | None:
    blip = element.find("./p:blipFill/a:blip", NS)
    if blip is None:
        return None
    relationship_id = blip.get(f"{{{R_NS}}}embed")
    target = _relationship_target(package, part, relationship_id)
    if not target:
        return None
    return {
        "relationship_id": relationship_id or "",
        "target": target,
        "content_type": content_types.get(target, ""),
    }


def _normalize_bounds(raw: dict[str, int], slide_size: tuple[int, int], kind: str) -> tuple[dict[str, float], bool, str | None]:
    slide_width, slide_height = slide_size
    x = raw["x"] / slide_width if slide_width else 0
    y = raw["y"] / slide_height if slide_height else 0
    width = raw["w"] / slide_width if slide_width else 0
    height = raw["h"] / slide_height if slide_height else 0
    if (raw["w"] <= 0 or raw["h"] <= 0) and kind != "connector":
        return {"x": x, "y": y, "w": width, "h": height}, True, "zero_size"
    if raw["x"] + raw["w"] <= 0 or raw["y"] + raw["h"] <= 0 or raw["x"] >= slide_width or raw["y"] >= slide_height:
        return {"x": x, "y": y, "w": width, "h": height}, True, "off_canvas"
    return {"x": x, "y": y, "w": width, "h": height}, False, None


def _direct_shape_children(element: ET.Element) -> list[ET.Element]:
    return [child for child in element if local_name(child) in SUPPORTED_DIRECT_SHAPES]


def _parse_shape(
    package: zipfile.ZipFile,
    part: str,
    element: ET.Element,
    source_scope: str,
    slide_size: tuple[int, int],
    content_types: dict[str, str],
    parent_transform: dict[str, int] | None = None,
    shape_path: str = "1",
) -> dict[str, Any]:
    kind = shape_kind(element)
    shape_id, name = _shape_id_and_name(element)
    xfrm = _xfrm_values(element)
    raw = _transform_bounds({"x": xfrm["x"], "y": xfrm["y"], "w": xfrm["w"], "h": xfrm["h"]}, parent_transform)
    bounds, excluded, exclusion_reason = _normalize_bounds(raw, slide_size, kind)
    placeholder = _placeholder(element)
    item: dict[str, Any] = {
        "shape_id": shape_id,
        "name": name,
        "kind": "picture_placeholder" if kind == "shape" and placeholder and placeholder["type"] == "pic" else kind,
        "source_scope": source_scope,
        "shape_path": shape_path,
        "bounds": bounds,
        "raw_bounds": raw,
        "excluded": excluded,
        "exclusion_reason": exclusion_reason,
        "text": _shape_text(element),
        "placeholder": placeholder,
        "fill": _color(element.find("./p:spPr", NS), "./a:solidFill/a:srgbClr"),
        "stroke": _color(element.find("./p:spPr", NS), "./a:ln/a:solidFill/a:srgbClr"),
    }
    if item["kind"] == "connector":
        item["connector"] = _connector(element)
    if item["kind"] == "picture":
        item["media"] = _picture_media(package, part, element, content_types)
    if item["kind"] in {"shape", "group"}:
        custom_paths = _custom_geometry(element)
        item["custom_geometry"] = custom_paths
    if kind == "group":
        item["group_transform"] = xfrm
        item["children"] = [
            _parse_shape(
                package,
                part,
                child,
                source_scope,
                slide_size,
                content_types,
                xfrm,
                f"{shape_path}.{index}",
            )
            for index, child in enumerate(_direct_shape_children(element), start=1)
        ]
        item["shape_count"] = sum(1 + int(child.get("shape_count", 0)) for child in item["children"])
    else:
        item["shape_count"] = 1
    return item


def _part_shapes(
    package: zipfile.ZipFile,
    part: str,
    source_scope: str,
    slide_size: tuple[int, int],
    content_types: dict[str, str],
) -> list[dict[str, Any]]:
    root = _xml(package, part)
    tree = root.find(".//p:spTree", NS)
    if tree is None:
        return []
    return [
        _parse_shape(package, part, child, source_scope, slide_size, content_types, shape_path=str(index))
        for index, child in enumerate(_direct_shape_children(tree), start=1)
    ]


def _part_basename(part: str | None) -> str:
    return Path(part).name if part else ""


def _effective_shapes(*scopes: tuple[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    placeholder_positions: dict[str, int] = {}
    for source_scope, shapes in scopes:
        for shape in shapes:
            item = dict(shape)
            item["source_scope"] = source_scope
            placeholder = item.get("placeholder")
            key = None
            if placeholder:
                key = f'{placeholder.get("type", "body")}:{placeholder.get("idx", "0")}'
            if key is not None and key in placeholder_positions:
                result[placeholder_positions[key]] = item
            else:
                if key is not None:
                    placeholder_positions[key] = len(result)
                result.append(item)
    return result


def _presentation_parts(package: zipfile.ZipFile) -> tuple[ET.Element, dict[str, dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    root = _xml(package, "ppt/presentation.xml")
    relationships = _relationships(package, "ppt/presentation.xml")
    masters: list[dict[str, str]] = []
    master_by_id: dict[str, dict[str, str]] = {}
    for node in root.findall("./p:sldMasterIdLst/p:sldMasterId", NS):
        rid = node.get(f"{{{R_NS}}}id")
        part = relationships.get(rid or "", {}).get("target")
        if not part:
            continue
        record = {"id": node.get("id", ""), "part": part, "name": _part_basename(part)}
        masters.append(record)
        master_by_id[part] = record

    layouts: list[dict[str, str]] = []
    for master in masters:
        master_root = _xml(package, master["part"])
        master_rels = _relationships(package, master["part"])
        for node in master_root.findall("./p:sldLayoutIdLst/p:sldLayoutId", NS):
            rid = node.get(f"{{{R_NS}}}id")
            part = master_rels.get(rid or "", {}).get("target")
            if not part:
                continue
            layouts.append({
                "id": node.get("id", ""),
                "part": part,
                "name": _part_basename(part),
                "master_part": master["part"],
            })

    slides: list[dict[str, str]] = []
    for node in root.findall("./p:sldIdLst/p:sldId", NS):
        rid = node.get(f"{{{R_NS}}}id")
        part = relationships.get(rid or "", {}).get("target")
        if not part:
            continue
        slide_rels = _relationships(package, part)
        layout_part = next(
            (
                relation["target"]
                for relation in slide_rels.values()
                if relation["type"].endswith("/slideLayout")
            ),
            "",
        )
        master_part = next((layout["master_part"] for layout in layouts if layout["part"] == layout_part), "")
        slides.append({
            "id": node.get("id", ""),
            "part": part,
            "name": _part_basename(part),
            "layout_part": layout_part,
            "master_part": master_part,
        })
    return root, master_by_id, layouts, slides


def inspect_package(source_path: str | Path) -> dict[str, Any]:
    """Inspect a PPTX/POTX package and return native, scope-aware dictionaries."""

    path = Path(source_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"PowerPoint source not found: {path}")
    if path.suffix.lower() not in {".pptx", ".potx"}:
        raise ValueError("Only .pptx and .potx sources are supported.")

    with zipfile.ZipFile(path) as package:
        content_types = _content_types(package)
        presentation_root, master_by_id, layout_records, slide_records = _presentation_parts(package)
        presentation_type = content_types.get("ppt/presentation.xml", "")
        source_type = "potx" if ".template." in presentation_type or path.suffix.lower() == ".potx" else "pptx"
        size_node = presentation_root.find("./p:sldSz", NS)
        slide_size_emu = (_attr_int(size_node, "cx"), _attr_int(size_node, "cy"))
        slide_size_px = (emu_to_px(slide_size_emu[0]), emu_to_px(slide_size_emu[1]))

        masters: list[dict[str, Any]] = []
        for record in master_by_id.values():
            masters.append({
                **record,
                "local_shapes": _part_shapes(package, record["part"], "master", slide_size_emu, content_types),
            })
        layouts: list[dict[str, Any]] = []
        for record in layout_records:
            layouts.append({
                **record,
                "local_shapes": _part_shapes(package, record["part"], "layout", slide_size_emu, content_types),
            })

        master_map = {record["part"]: record for record in masters}
        layout_map = {record["part"]: record for record in layouts}
        slides: list[dict[str, Any]] = []
        for index, record in enumerate(slide_records, start=1):
            local_shapes = _part_shapes(package, record["part"], "slide", slide_size_emu, content_types)
            layout = layout_map.get(record["layout_part"], {"local_shapes": [], "part": "", "name": ""})
            master = master_map.get(record["master_part"], {"local_shapes": [], "part": "", "name": ""})
            slides.append({
                **record,
                "slide_no": index,
                "layout_id": layout.get("name", ""),
                "master_id": master.get("name", ""),
                "local_shapes": local_shapes,
                "effective_shapes": _effective_shapes(
                    ("master", master.get("local_shapes", [])),
                    ("layout", layout.get("local_shapes", [])),
                    ("slide", local_shapes),
                ),
            })

        media = [
            {
                "part": name,
                "content_type": content_types.get(name, ""),
            }
            for name in package.namelist()
            if name.startswith("ppt/media/")
        ]
        return {
            "source_type": source_type,
            "slide_size": {
                "emu": {"width": slide_size_emu[0], "height": slide_size_emu[1]},
                "px": {"width": slide_size_px[0], "height": slide_size_px[1]},
            },
            "masters": masters,
            "layouts": layouts,
            "slides": slides,
            "media": media,
        }


def _flatten_shapes(shapes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for shape in shapes:
        flattened.append(shape)
        if shape.get("kind") == "group":
            flattened.extend(_flatten_shapes(shape.get("children", [])))
    return flattened


def extract_index_slides(source_path: str | Path) -> list[dict[str, Any]]:
    """Return the text/identity subset ingest needs for PPTX and POTX."""

    package = inspect_package(source_path)
    slides = []
    for slide in package["slides"]:
        text_shapes = [
            shape
            for shape in _flatten_shapes(slide["effective_shapes"])
            if shape.get("text") and not shape.get("excluded")
        ]
        text_shapes.sort(key=lambda shape: (shape["bounds"]["y"], shape["bounds"]["x"]))
        raw_text = "\n".join(shape["text"] for shape in text_shapes)
        title = next(
            (
                shape["text"].splitlines()[0]
                for shape in text_shapes
                if shape["bounds"]["y"] <= 0.25 and len(shape["text"]) < 100
            ),
            (text_shapes[0]["text"].splitlines()[0] if text_shapes else f"슬라이드 {slide['slide_no']}"),
        )
        slides.append({
            "slide_no": slide["slide_no"],
            "title": title.strip(),
            "raw_text": raw_text,
            "text_count": len(text_shapes),
            "text_boxes": [
                {"text": shape["text"], "bounds": shape["bounds"]}
                for shape in text_shapes
            ],
            "layout_id": slide.get("layout_id", ""),
            "master_id": slide.get("master_id", ""),
        })
    return slides


def describe_source(source_path: str | Path) -> dict[str, Any]:
    package = inspect_package(source_path)
    return {
        "source_type": package["source_type"],
        "slide_size": package["slide_size"],
        "slide_count": len(package["slides"]),
        "layout_count": len(package["layouts"]),
        "master_count": len(package["masters"]),
        "media_count": len(package["media"]),
        "slides": [
            {
                "slide_no": slide["slide_no"],
                "layout_id": slide.get("layout_id", ""),
                "master_id": slide.get("master_id", ""),
            }
            for slide in package["slides"]
        ],
    }


# Discovery and promotion intentionally use small, deterministic heuristics.  They
# are a review aid, not a computer-vision classifier: the user still approves the
# candidate and edits its metadata before anything reaches the permanent library.
DISCOVERY_GAP = 0.045
MAX_BLOCK_SHAPES = 200
MIN_BLOCK_AREA = 0.05
MAX_BLOCK_AREA = 0.90
FORBIDDEN_PERMANENT_FIELDS = {"source_path", "original_file", "raw_text", "raw_texts"}
ASSET_KINDS = {
    "block_shell",
    "diagram_recipe",
    "composite_block",
    "icon_asset",
    "media_frame",
    "photo_asset",
}
MODULE_TYPES = {
    "process_chain",
    "mapping",
    "hub_spoke",
    "matrix",
    "feedback_loop",
    "lanes",
    "architecture",
    "shell",
    "icon",
    "media_frame",
    "photo",
    "unsupported_topology",
}
THEME_ROLES = {
    "primary": "#1769E0",
    "navy": "#123B78",
    "accent": "#4A8CF0",
    "pale": "#EEF5FF",
    "surface": "#F3F6FA",
    "ink": "#172033",
    "gray": "#5F6B7A",
    "line": "#C8D2DF",
    "white": "#FFFFFF",
}
DISPLAY_NAMES = {
    "process_chain": "단계형 프로세스 블록",
    "mapping": "좌우 매핑 블록",
    "hub_spoke": "허브-스포크 블록",
    "matrix": "매트릭스 블록",
    "feedback_loop": "피드백 루프 블록",
    "lanes": "병렬 레인 블록",
    "architecture": "아키텍처 흐름 블록",
    "shell": "재사용 블록 외형",
    "icon": "네이티브 아이콘",
    "media_frame": "사진 프레임",
    "photo": "사진 자산",
}
DESCRIPTIONS = {
    "process_chain": "여러 단계를 순차적으로 설명하는 반응형 네이티브 도식입니다.",
    "mapping": "두 영역의 항목과 관계를 좌우로 비교·연결하는 도식입니다.",
    "hub_spoke": "중앙 허브와 주변 항목의 관계를 설명하는 도식입니다.",
    "matrix": "행과 열의 기준을 교차해 비교하는 구조입니다.",
    "feedback_loop": "실행 결과가 다음 개선 단계로 되돌아가는 순환 구조입니다.",
    "lanes": "역할이나 채널별 흐름을 병렬 레인으로 설명하는 구조입니다.",
    "architecture": "시스템·데이터·서비스 구성요소의 흐름을 설명하는 구조입니다.",
    "shell": "제목·본문·강조영역을 재사용하는 블록 외형입니다.",
    "icon": "작은 네이티브 도형과 커스텀 패스로 구성한 재색상 가능 아이콘입니다.",
    "media_frame": "사진 없이 프레임·크롭·캡션 규칙만 재사용하는 영역입니다.",
    "photo": "사용 승인이 확인된 사진 파일을 별도로 참조하는 자산입니다.",
}
USE_CASES = {
    "process_chain": ["업무 흐름", "추진 절차", "로드맵"],
    "mapping": ["요구사항 대응", "전후 비교", "역할 매핑"],
    "hub_spoke": ["서비스 구성", "핵심 기능", "이해관계자 관계"],
    "matrix": ["기능 비교", "평가 기준", "요구사항 매핑"],
    "feedback_loop": ["운영 개선", "모니터링", "학습 순환"],
    "lanes": ["부서별 역할", "채널별 흐름", "병렬 업무"],
    "architecture": ["시스템 구성", "데이터 흐름", "연계 구조"],
    "shell": ["요구사항 설명", "핵심 포인트", "본문 카드"],
    "icon": ["카드 강조", "기능 아이콘", "범례"],
    "media_frame": ["사례 소개", "화면 설명", "사진 카드"],
    "photo": ["사례 이미지", "표지", "현장 설명"],
}
SEARCH_TAGS = {
    "process_chain": ["프로세스", "단계", "순차", "화살표"],
    "mapping": ["매핑", "비교", "대응", "좌우"],
    "hub_spoke": ["허브", "관계", "중앙", "연결"],
    "matrix": ["매트릭스", "표", "행렬", "비교"],
    "feedback_loop": ["피드백", "순환", "개선", "루프"],
    "lanes": ["레인", "병렬", "역할", "채널"],
    "architecture": ["아키텍처", "시스템", "데이터", "연계"],
    "shell": ["블록", "카드", "외형", "본문"],
    "icon": ["아이콘", "네이티브", "커스텀", "재색상"],
    "media_frame": ["사진 프레임", "미디어", "크롭", "캡션"],
    "photo": ["사진", "이미지", "현장", "미디어"],
}


def _shape_leaves(shapes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for shape in shapes:
        if shape.get("kind") == "group":
            result.extend(_shape_leaves(shape.get("children", [])))
        else:
            result.append(shape)
    return result


def _shape_area(shape: dict[str, Any]) -> float:
    bounds = shape.get("bounds", {})
    return max(0.0, float(bounds.get("w", 0))) * max(0.0, float(bounds.get("h", 0)))


def _bounds_union(shapes: list[dict[str, Any]]) -> dict[str, float]:
    visible = [shape for shape in shapes if not shape.get("excluded") and shape.get("bounds")]
    if not visible:
        return {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}
    left = min(float(shape["bounds"].get("x", 0)) for shape in visible)
    top = min(float(shape["bounds"].get("y", 0)) for shape in visible)
    right = max(left + float(shape["bounds"].get("w", 0)) for shape in visible)
    bottom = max(top + float(shape["bounds"].get("h", 0)) for shape in visible)
    return {"x": left, "y": top, "w": max(0.0, right - left), "h": max(0.0, bottom - top)}


def _bounds_overlap(first: dict[str, Any], second: dict[str, Any], gap: float = 0.0) -> bool:
    a = first.get("bounds", first)
    b = second.get("bounds", second)
    return not (
        float(a.get("x", 0)) + float(a.get("w", 0)) + gap < float(b.get("x", 0))
        or float(b.get("x", 0)) + float(b.get("w", 0)) + gap < float(a.get("x", 0))
        or float(a.get("y", 0)) + float(a.get("h", 0)) + gap < float(b.get("y", 0))
        or float(b.get("y", 0)) + float(b.get("h", 0)) + gap < float(a.get("y", 0))
    )


def _is_decorative_shape(shape: dict[str, Any]) -> bool:
    if shape.get("excluded"):
        return True
    text = str(shape.get("text", "")).strip()
    name = str(shape.get("name", "")).lower()
    if "sample" in text.lower() or "sample" in name:
        return True
    if any(token in text for token in ("사용 가이드", "페이지 번호", "page number")):
        return True
    bounds = shape.get("bounds", {})
    if float(bounds.get("y", 0)) >= 0.93:
        return True
    if float(bounds.get("h", 0)) <= 0.012 and shape.get("kind") != "connector":
        return True
    return any(token in name for token in ("footer", "page", "watermark", "guide"))


def _meaningful_leaves(shapes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [shape for shape in _shape_leaves(shapes) if not _is_decorative_shape(shape)]


def _connector_degrees(shapes: list[dict[str, Any]]) -> list[int]:
    degrees: Counter[str] = Counter()
    for shape in shapes:
        if shape.get("kind") != "connector":
            continue
        connector = shape.get("connector") or {}
        for key in ("start_id", "end_id"):
            shape_id = connector.get(key)
            if shape_id:
                degrees[str(shape_id)] += 1
    return sorted(degrees.values())


def _text_slot_signature(shapes: list[dict[str, Any]]) -> list[str]:
    signature = []
    for shape in sorted(shapes, key=lambda item: (item.get("bounds", {}).get("y", 0), item.get("bounds", {}).get("x", 0))):
        if not shape.get("text"):
            continue
        bounds = shape.get("bounds", {})
        y = float(bounds.get("y", 0))
        text_length = len(str(shape.get("text", "")))
        role = "title" if y < 0.20 else "metric" if text_length <= 12 and float(bounds.get("h", 0)) < 0.12 else "body"
        signature.append(role)
    return signature


def _topology_kind(shapes: list[dict[str, Any]], module_type: str | None = None) -> str:
    connectors = [shape for shape in shapes if shape.get("kind") == "connector"]
    degrees = _connector_degrees(shapes)
    if module_type:
        return module_type
    if not connectors:
        return "none"
    if degrees and max(degrees) >= 3:
        return "hub_spoke"
    if connectors and any(shape.get("connector", {}).get("start_id") == shape.get("connector", {}).get("end_id") for shape in connectors):
        return "feedback_loop"
    return "process_chain"


def infer_module_type(shapes: list[dict[str, Any]]) -> str:
    """Infer a reusable visual type from structure, never from source wording alone."""

    leaves = _meaningful_leaves(shapes)
    texts = " ".join(str(shape.get("text", "")) for shape in leaves).lower()
    kinds = Counter(shape.get("kind") for shape in leaves)
    connectors = [shape for shape in leaves if shape.get("kind") == "connector"]
    degrees = _connector_degrees(leaves)
    if leaves and all(shape.get("kind") == "picture" for shape in leaves):
        return "photo"
    if any(token in texts for token in ("roadmap", "로드맵", "timeline", "일정", "월차", "분기")):
        return "lanes"
    if any(token in texts for token in ("architecture", "아키텍처", "시스템", "api", "데이터 흐름")):
        return "architecture"
    if any(token in texts for token in ("matrix", "매트릭스", "행", "열", "기준")) or (kinds["shape"] >= 6 and not connectors):
        return "matrix"
    if connectors:
        if any(token in texts for token in ("피드백", "feedback", "순환", "개선")):
            return "feedback_loop"
        if degrees and max(degrees) >= 3:
            return "hub_spoke"
        if any(token in texts for token in ("좌", "우", "대응", "mapping", "매핑", "before", "after")):
            return "mapping"
        return "process_chain"
    if any(shape.get("custom_geometry") for shape in leaves) and len(leaves) <= 4 and _shape_area(leaves[0]) <= 0.08:
        return "icon"
    if len(leaves) <= 3:
        return "shell"
    if kinds["picture"] and not kinds["shape"]:
        return "photo"
    return "shell"


def _infer_asset_kind(shapes: list[dict[str, Any]], module_type: str) -> str:
    leaves = _meaningful_leaves(shapes)
    if not leaves:
        return "block_shell"
    if all(shape.get("kind") == "picture" for shape in leaves):
        return "photo_asset"
    if any(shape.get("kind") == "picture_placeholder" for shape in leaves):
        return "media_frame"
    if module_type == "icon" or (len(leaves) <= 3 and any(shape.get("custom_geometry") for shape in leaves)):
        return "icon_asset"
    if any(shape.get("kind") == "connector" for shape in leaves):
        return "composite_block" if any(_shape_area(shape) >= 0.25 for shape in leaves if shape.get("kind") != "connector") else "diagram_recipe"
    return "block_shell"


def _shape_is_picture_slot(shape: dict[str, Any]) -> str | None:
    if shape.get("kind") == "picture_placeholder":
        return "media_slot"
    if shape.get("kind") != "picture":
        return None
    bounds = shape.get("bounds", {})
    name = str(shape.get("name", "")).lower()
    return "icon_slot" if "icon" in name or float(bounds.get("w", 0)) * float(bounds.get("h", 0)) <= 0.12 else "media_slot"


def _candidate_public(candidate: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "candidate_id", "slide_no", "source_scope", "layout_id", "master_id", "asset_kind", "module_type",
        "bounds", "shell", "header_zone", "body_zone", "footer_zone", "accent_shapes", "inner_candidates",
        "reading_order", "shape_ids", "shape_paths", "shape_count", "text_slot_count", "curation_status",
        "selection_reason", "cleanup_actions", "duplicate_of", "supported_variants", "lifecycle_status",
        "warnings", "media_refs", "signature",
    }
    result = {key: candidate[key] for key in allowed if key in candidate}
    result["media_refs"] = [
        {key: value for key, value in ref.items() if key in {"role", "content_type", "bounds"}}
        for ref in candidate.get("media_refs", [])
    ]
    return result


def _candidate_from_shapes(scope: dict[str, Any], shapes: list[dict[str, Any]], ordinal: int) -> dict[str, Any]:
    leaves = _meaningful_leaves(shapes)
    bounds = _bounds_union(leaves)
    module_type = infer_module_type(leaves)
    asset_kind = _infer_asset_kind(leaves, module_type)
    shape_ids = [str(shape.get("shape_id", "")) for shape in shapes if shape.get("shape_id")]
    shape_paths = [str(shape.get("shape_path", "")) for shape in shapes if shape.get("shape_path")]
    scopes = sorted({str(shape.get("source_scope", scope.get("source_scope", "slide"))) for shape in shapes})
    source_scope = scopes[0] if len(scopes) == 1 else "mixed"
    source_key = str(scope.get("source_key", "source"))
    seed = json.dumps(
        {"source_key": source_key, "slide_no": scope.get("slide_no"), "source_scope": source_scope, "shape_paths": shape_paths, "ordinal": ordinal},
        ensure_ascii=False,
        sort_keys=True,
    ).encode("utf-8")
    candidate_id = f"cand_{hashlib.sha256(seed).hexdigest()[:16]}"
    shell_shape = max((shape for shape in leaves if shape.get("kind") not in {"connector", "picture"}), key=_shape_area, default=None)
    text_shapes = [shape for shape in leaves if shape.get("text")]
    header = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 0.18 if text_shapes else 0.0, "text_slot": "title"}
    body_y = header["h"] + 0.04
    body = {"x": 0.04, "y": body_y, "w": 0.92, "h": max(0.0, 0.96 - body_y)}
    accent_shapes = [
        {"shape_id": str(shape.get("shape_id", "")), "kind": shape.get("kind"), "anchor": "left"}
        for shape in leaves
        if _shape_area(shape) <= max(bounds["w"] * bounds["h"] * 0.08, 0.005)
        and float(shape.get("bounds", {}).get("x", 0)) <= bounds["x"] + bounds["w"] * 0.12
    ]
    media_refs = []
    for shape in leaves:
        slot = _shape_is_picture_slot(shape)
        if slot:
            media = shape.get("media") or {}
            media_refs.append({
                "shape_id": shape.get("shape_id", ""),
                "role": slot,
                "target": media.get("target", ""),
                "content_type": media.get("content_type", ""),
                "bounds": dict(shape.get("bounds", {})),
            })
    candidate = {
        "candidate_id": candidate_id,
        "slide_no": scope.get("slide_no"),
        "source_scope": source_scope,
        "layout_id": scope.get("layout_id", ""),
        "master_id": scope.get("master_id", ""),
        "bounds": bounds,
        "shell": {"shape_id": shell_shape.get("shape_id", "") if shell_shape else "", "kind": shell_shape.get("kind", "shape") if shell_shape else "shape"},
        "header_zone": header,
        "body_zone": body,
        "footer_zone": None,
        "accent_shapes": accent_shapes,
        "inner_candidates": [],
        "reading_order": [
            str(shape.get("shape_id", ""))
            for shape in sorted(leaves, key=lambda item: (item.get("bounds", {}).get("y", 0), item.get("bounds", {}).get("x", 0)))
        ],
        "shape_ids": shape_ids,
        "shape_paths": shape_paths,
        "shape_count": len(leaves),
        "text_slot_count": len(text_shapes),
        "asset_kind": asset_kind,
        "module_type": module_type,
        "source": {
            "source_path": scope.get("source_path", ""),
            "source_key": source_key,
            "source_type": scope.get("source_type", "pptx"),
            "slide_no": scope.get("slide_no"),
            "layout_id": scope.get("layout_id", ""),
            "master_id": scope.get("master_id", ""),
            "source_scope": source_scope,
            "shape_ids": shape_ids,
            "shape_paths": shape_paths,
        },
        "raw_shapes": shapes,
        "media_refs": media_refs,
        "warnings": [],
        "lifecycle_status": "discovered",
        "duplicate_of": None,
    }
    status, reason, cleanup = curate_candidate(candidate)
    candidate.update({
        "curation_status": status,
        "selection_reason": reason,
        "cleanup_actions": cleanup,
        "supported_variants": ["wide", "compact", "tall"] if status == "selected" else [],
    })
    candidate["signature"] = candidate_signature(candidate)
    candidate["sanitized_template"] = sanitize_candidate(candidate) if status == "selected" and candidate.get("asset_kind") != "photo_asset" else None
    return candidate


def build_block_candidates(scope: dict[str, Any]) -> list[dict[str, Any]]:
    """Discover explicit groups, shells, connector components, then spatial clusters."""

    shapes = scope.get("effective_shapes") or scope.get("shapes") or scope.get("local_shapes") or []
    top_level = [shape for shape in shapes if not _is_decorative_shape(shape)]
    candidates: list[list[dict[str, Any]]] = []
    used_paths: set[str] = set()

    # 1) PowerPoint-authored groups are the strongest block boundary.
    for shape in top_level:
        if shape.get("kind") != "group":
            continue
        leaves = _meaningful_leaves([shape])
        if len(leaves) >= 2:
            group_shapes = [shape] + _shape_leaves([shape])
            candidates.append(group_shapes)
            used_paths.update(str(item.get("shape_path")) for item in group_shapes)

    flat = [shape for shape in top_level if shape.get("kind") != "group" and str(shape.get("shape_path")) not in used_paths]

    # 2) A large containing shape is the shell of the block.
    for shell in flat:
        if shell.get("kind") not in {"shape", "picture_placeholder"}:
            continue
        area = _shape_area(shell)
        if not MIN_BLOCK_AREA <= area <= MAX_BLOCK_AREA:
            continue
        contained = [
            shape for shape in flat
            if shape is not shell and _bounds_overlap(shell, shape, 0.0)
        ]
        if contained:
            group_shapes = [shell] + contained
            key = {str(item.get("shape_path")) for item in group_shapes}
            if not any(key == {str(item.get("shape_path")) for item in existing} for existing in candidates):
                candidates.append(group_shapes)
                used_paths.update(key)

    # 3) Connector-connected components keep nodes and edges together.
    connector_shapes = [shape for shape in flat if shape.get("kind") == "connector"]
    by_id = {str(shape.get("shape_id")): shape for shape in flat if shape.get("shape_id")}
    adjacency: defaultdict[str, set[str]] = defaultdict(set)
    for connector in connector_shapes:
        relation = connector.get("connector") or {}
        start = str(relation.get("start_id", ""))
        end = str(relation.get("end_id", ""))
        if start and end and start in by_id and end in by_id:
            adjacency[start].add(end)
            adjacency[end].add(start)
            adjacency[start].add(str(connector.get("shape_id", "")))
            adjacency[end].add(str(connector.get("shape_id", "")))
    visited: set[str] = set()
    for start in sorted(adjacency):
        if start in visited:
            continue
        stack = [start]
        ids: set[str] = set()
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            ids.add(current)
            stack.extend(adjacency.get(current, set()) - visited)
        component = [shape for shape in flat if str(shape.get("shape_id")) in ids]
        if len([shape for shape in component if shape.get("kind") != "connector"]) >= 2:
            key = {str(item.get("shape_path")) for item in component}
            if not any(key == {str(item.get("shape_path")) for item in existing} for existing in candidates):
                candidates.append(component)
                used_paths.update(key)

    # 4) Nearby ungrouped shapes become one spatial block; connected components
    # already claimed above are left alone.
    remaining = [shape for shape in flat if str(shape.get("shape_path")) not in used_paths]
    visited_indices: set[int] = set()
    for index, shape in enumerate(remaining):
        if index in visited_indices:
            continue
        cluster = [index]
        visited_indices.add(index)
        changed = True
        while changed:
            changed = False
            for other_index, other in enumerate(remaining):
                if other_index in visited_indices:
                    continue
                if any(_bounds_overlap(remaining[current], other, DISCOVERY_GAP) for current in cluster):
                    cluster.append(other_index)
                    visited_indices.add(other_index)
                    changed = True
        cluster_shapes = [remaining[item] for item in cluster]
        if len(cluster_shapes) >= 2:
            candidates.append(cluster_shapes)

    result = []
    for ordinal, candidate_shapes in enumerate(candidates, start=1):
        result.append(_candidate_from_shapes(scope, candidate_shapes, ordinal))
    return result


def candidate_signature(candidate: dict[str, Any]) -> str:
    """Hash only normalized structure; source wording and filenames never affect it."""

    shapes = _meaningful_leaves(candidate.get("raw_shapes") or candidate.get("shapes") or [])
    bounds = candidate.get("bounds", {})
    shape_signature = [
        {
            "kind": shape.get("kind"),
            "bounds": [round(float(shape.get("bounds", {}).get(key, 0)), 3) for key in ("x", "y", "w", "h")],
            "custom": bool(shape.get("custom_geometry")),
        }
        for shape in sorted(shapes, key=lambda item: (item.get("kind", ""), item.get("bounds", {}).get("x", 0), item.get("bounds", {}).get("y", 0)))
    ]
    payload = {
        "aspect": round(float(bounds.get("w", 0)) / float(bounds.get("h", 1) or 1), 3),
        "kinds": dict(sorted(Counter(shape.get("kind", "unknown") for shape in shapes).items())),
        "shapes": shape_signature,
        "degrees": _connector_degrees(shapes),
        "topology": _topology_kind(shapes, candidate.get("module_type")),
        "text_slots": _text_slot_signature(shapes),
    }
    return f"sha256:{hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()}"


def curate_candidate(candidate: dict[str, Any]) -> tuple[str, str, list[str]]:
    leaves = _meaningful_leaves(candidate.get("raw_shapes") or candidate.get("shapes") or [])
    if not leaves:
        return "rejected", "재사용 가능한 네이티브 도형이 없어 후보로 유지하지 않습니다.", []
    unsupported = [shape for shape in leaves if shape.get("kind") == "unsupported_graphic"]
    native = [shape for shape in leaves if shape.get("kind") in {"shape", "connector", "group"}]
    pictures = [shape for shape in leaves if shape.get("kind") == "picture"]
    cleanup = []
    for picture in pictures:
        slot = _shape_is_picture_slot(picture)
        if slot and slot not in cleanup:
            cleanup.append(slot)
    if unsupported and not native:
        return "rejected", "핵심 구조가 지원하지 않는 차트·SmartArt 계열이라 네이티브 재사용을 보장할 수 없습니다.", cleanup
    if pictures and not native:
        candidate["asset_kind"] = "photo_asset"
        candidate["module_type"] = "photo"
        return "selected", "네이티브 블록이 아닌 독립 사진 후보로 분리할 수 있습니다.", []
    if unsupported:
        return "rejected", "블록의 핵심에 지원하지 않는 그래픽이 포함되어 네이티브 구조로 승격하지 않습니다.", cleanup
    if len(leaves) > MAX_BLOCK_SHAPES:
        return "deferred", "구조는 보존할 수 있지만 도형 수가 많아 다른 크기에서의 재배치를 먼저 검토해야 합니다.", cleanup
    module_type = candidate.get("module_type", "unsupported_topology")
    if module_type == "unsupported_topology":
        return "deferred", "형태는 남아 있으나 토폴로지를 안정적으로 추론하지 못해 수동 확인이 필요합니다.", cleanup
    if pictures:
        return "selected", "네이티브 shell·도식은 유지하고 포함 이미지는 슬롯으로 치환할 수 있습니다.", cleanup
    return "selected", "네이티브 도형과 연결 구조가 블록 단위로 보존되어 다른 내용에도 재배치할 수 있습니다.", cleanup


def _theme_role(color: str | None, *, stroke: bool = False) -> str:
    if not color:
        return "line" if stroke else "surface"
    normalized = color.upper()
    exact = {value.upper(): key for key, value in THEME_ROLES.items()}
    if normalized in exact:
        return exact[normalized]
    if stroke:
        return "line"
    return "pale" if normalized.startswith("#F") or normalized.startswith("#E") else "accent"


def _slot_for_shape(shape: dict[str, Any], candidate: dict[str, Any]) -> str | None:
    if not shape.get("text"):
        return None
    ordered = candidate.get("reading_order", [])
    shape_id = str(shape.get("shape_id", ""))
    if shape_id == (ordered[0] if ordered else ""):
        return "title"
    module_type = candidate.get("module_type")
    if module_type == "process_chain":
        return "steps[]"
    if module_type == "matrix":
        return "items[]"
    if module_type in {"hub_spoke", "mapping", "lanes", "architecture"}:
        return "items[]"
    if len(str(shape.get("text", ""))) <= 12:
        return "metrics[]"
    return "conclusion"


def _local_bounds(bounds: dict[str, Any], frame: dict[str, Any]) -> dict[str, float]:
    width = float(frame.get("w", 0)) or 1.0
    height = float(frame.get("h", 0)) or 1.0
    values = {
        "x": (float(bounds.get("x", 0)) - float(frame.get("x", 0))) / width,
        "y": (float(bounds.get("y", 0)) - float(frame.get("y", 0))) / height,
        "w": float(bounds.get("w", 0)) / width,
        "h": float(bounds.get("h", 0)) / height,
    }
    return {key: round(min(1.0, max(0.0, value)), 6) for key, value in values.items()}


def build_native_template(candidate: dict[str, Any]) -> dict[str, Any]:
    frame = candidate.get("bounds", {})
    leaves = _meaningful_leaves(candidate.get("raw_shapes") or candidate.get("shapes") or [])
    primitives = []
    for shape in leaves:
        kind = shape.get("kind")
        if kind == "unsupported_graphic":
            continue
        slot = _shape_is_picture_slot(shape)
        primitive = {
            "kind": "rect" if kind == "picture_placeholder" else kind,
            "bounds": _local_bounds(shape.get("bounds", {}), frame),
            "fill": _theme_role(shape.get("fill")),
            "stroke": _theme_role(shape.get("stroke"), stroke=True),
        }
        if kind == "connector":
            primitive["connector"] = {
                key: value for key, value in (shape.get("connector") or {}).items() if key.endswith("_id")
            }
        if shape.get("custom_geometry"):
            primitive["custom_geometry"] = [
                {
                    "width": path.get("width", 0),
                    "height": path.get("height", 0),
                    "commands": [command for command in path.get("commands", []) if set(command) <= {"moveTo", "lineTo", "close"}],
                }
                for path in shape.get("custom_geometry", [])
            ]
        if shape.get("text"):
            primitive["text_slot"] = _slot_for_shape(shape, candidate)
        if slot:
            primitive["kind"] = slot
            primitive["slot"] = slot
        primitives.append(primitive)
    module_type = candidate.get("module_type", "shell")
    if module_type == "photo":
        module_type = "photo"
    template = {
        "version": 1,
        "module_id": candidate.get("candidate_id", "candidate"),
        "asset_kind": candidate.get("asset_kind", "block_shell"),
        "module_type": module_type,
        "renderer_key": "responsive_native_template",
        "shell": {
            "container": {"kind": "roundRect", "fill": "white", "stroke": "line"},
            "header_zone": dict(candidate.get("header_zone") or {}),
            "body_zone": dict(candidate.get("body_zone") or {"x": 0.04, "y": 0.2, "w": 0.92, "h": 0.72}),
            "accent_shapes": list(candidate.get("accent_shapes") or []),
        },
        "diagram": {
            "topology": {
                "kind": module_type,
                "repeat_source": "steps" if module_type == "process_chain" else "items",
                "nodes": [{"id": "node", "kind": "roundRect", "repeat": module_type == "process_chain", "text_slot": "steps[]" if module_type == "process_chain" else "items[]"}],
                "edges": [{"from": "node[n]", "to": "node[n+1]", "kind": "connector", "arrow": "end"}] if module_type == "process_chain" else [],
            },
            "variants": {
                "wide": {"layout": "row", "columns": "all"},
                "compact": {"layout": "grid", "columns": 2},
                "tall": {"layout": "column", "columns": 1},
            },
        },
        "style": {"node_fill": "pale", "node_stroke": "primary", "text_color": "navy"},
        "constraints": {"padding_ratio": 0.05, "gap_ratio": 0.03, "min_font_size": 9, "min_nodes": 2, "max_nodes": 8},
        "primitives": primitives,
        "content_slots": {"title": "string", "steps": "string[]", "items": "string[]", "metrics": "string[]", "conclusion": "string"},
        "source_aspect_ratio": round(float(frame.get("w", 0)) / float(frame.get("h", 1) or 1), 4),
    }
    return template


def validate_native_template(template: dict[str, Any]) -> None:
    if template.get("renderer_key") != "responsive_native_template":
        raise ValueError("native template renderer_key is required")
    if template.get("asset_kind") not in ASSET_KINDS - {"photo_asset"}:
        raise ValueError("native template asset_kind is unsupported")
    if template.get("module_type") not in MODULE_TYPES - {"photo"}:
        raise ValueError("native template module_type is unsupported")
    for primitive in template.get("primitives", []):
        if primitive.get("kind") in {"unsupported_graphic", "picture"}:
            raise ValueError("unsupported primitive in native template")
        bounds = primitive.get("bounds", {})
        if any(float(bounds.get(key, -1)) < 0 or float(bounds.get(key, 2)) > 1 for key in ("x", "y", "w", "h")):
            raise ValueError("native template bounds must be normalized")
    serialized = json.dumps(template, ensure_ascii=False)
    if any(token in serialized for token in ("source_path", "original_file", "raw_text", "raw_texts")):
        raise ValueError("source text/path fields are not allowed in native template")


def sanitize_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    template = build_native_template(candidate)
    validate_native_template(template)
    return template


def infer_design_traits(candidate: dict[str, Any]) -> list[str]:
    traits = []
    if candidate.get("header_zone", {}).get("h", 0):
        traits.append("헤더 분리")
    if candidate.get("shell", {}).get("kind") in {"shape", "group"}:
        traits.append("네이티브 컨테이너")
    if candidate.get("accent_shapes"):
        traits.append("강조 요소")
    if any(shape.get("kind") == "connector" for shape in _meaningful_leaves(candidate.get("raw_shapes", []))):
        traits.append("연결선 흐름")
    if candidate.get("asset_kind") == "icon_asset":
        traits.append("커스텀 geometry")
    return traits or ["구조화된 도형 배치"]


def draft_metadata(candidate: dict[str, Any]) -> dict[str, Any]:
    module_type = candidate.get("module_type", "shell")
    return {
        "display_name": DISPLAY_NAMES.get(module_type, "재사용 네이티브 블록"),
        "description": DESCRIPTIONS.get(module_type, "요구사항 내용을 구조화해 설명하는 네이티브 블록입니다."),
        "design_traits": infer_design_traits(candidate),
        "use_cases": USE_CASES.get(module_type, ["제안서 본문", "요구사항 설명"]),
        "search_tags": SEARCH_TAGS.get(module_type, [module_type]),
    }


def _data_root(data_dir: str | Path) -> Path:
    return Path(data_dir).resolve()


def _write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _scope_for_slide(package: dict[str, Any], slide: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_key": package.get("source_key", "source"),
        "source_path": package.get("source_path", ""),
        "source_type": package.get("source_type", "pptx"),
        "slide_no": slide.get("slide_no"),
        "layout_id": slide.get("layout_id", ""),
        "master_id": slide.get("master_id", ""),
        "effective_shapes": slide.get("effective_shapes", []),
    }


def discover_candidates(package: dict[str, Any], slide_no: int | None = None) -> list[dict[str, Any]]:
    """Return curation candidates for slides and, for POTX, reusable scopes."""

    scopes: list[dict[str, Any]] = []
    slides = [slide for slide in package.get("slides", []) if slide_no is None or slide.get("slide_no") == slide_no]
    for slide in slides:
        scopes.append(_scope_for_slide(package, slide))
    if package.get("source_type") == "potx" and slide_no is None:
        for master in package.get("masters", []):
            scopes.append({
                "source_key": package.get("source_key", "source"),
                "source_path": package.get("source_path", ""),
                "source_type": "potx",
                "slide_no": None,
                "master_id": master.get("name", ""),
                "source_scope": "master",
                "shapes": master.get("local_shapes", []),
            })
        for layout in package.get("layouts", []):
            scopes.append({
                "source_key": package.get("source_key", "source"),
                "source_path": package.get("source_path", ""),
                "source_type": "potx",
                "slide_no": None,
                "layout_id": layout.get("name", ""),
                "master_id": layout.get("master_part", ""),
                "source_scope": "layout",
                "shapes": layout.get("local_shapes", []),
            })

    candidates: list[dict[str, Any]] = []
    for scope in scopes:
        candidates.extend(build_block_candidates(scope))
    # Keep the first structurally identical candidate as the representative.  A
    # later slide remains visible to the reviewer but never creates a second asset.
    representatives: dict[str, str] = {}
    for candidate in candidates:
        signature = candidate_signature(candidate)
        candidate["signature"] = signature
        if signature in representatives:
            candidate["duplicate_of"] = representatives[signature]
        else:
            representatives[signature] = candidate["candidate_id"]
    return candidates


def _expected_evidence_files(manifest: dict[str, Any], data_root: Path) -> list[Path]:
    source_key = str(manifest.get("source_key", ""))
    output_dir = data_root / "ingest_data" / source_key
    render = manifest.get("render") if isinstance(manifest.get("render"), dict) else {}
    listed = render.get("expected_files") or render.get("files") or []
    paths = []
    for item in listed:
        path = Path(str(item))
        paths.append(path if path.is_absolute() else output_dir / path)
    if paths:
        return paths
    for slide in manifest.get("slides", []):
        image_ref = slide.get("image_ref") or ""
        path = Path(str(image_ref).replace("/storage/", "", 1)) if image_ref.startswith("/storage/") else output_dir / "slides" / f"slide-{slide.get('slide_no')}.png"
        paths.append(path if path.is_absolute() else data_root / path)
    return paths


def assess_selection_evidence(manifest: dict[str, Any], package: dict[str, Any], data_dir: str | Path) -> dict[str, Any]:
    """Classify evidence without treating a failed renderer as successful."""

    data_root = _data_root(data_dir)
    expected_total = int(manifest.get("total_slides") or len(package.get("slides", [])) or 0)
    extracted = int((manifest.get("extract") or {}).get("completed", len(package.get("slides", []))))
    extraction_complete = expected_total == 0 or (extracted >= expected_total and len(package.get("slides", [])) >= expected_total)
    expected_files = _expected_evidence_files(manifest, data_root)
    missing = [str(path) for path in expected_files if not path.exists()]
    render = manifest.get("render") if isinstance(manifest.get("render"), dict) else {}
    exit_code = render.get("exit_code", render.get("returncode", 0))
    renderer_failed = bool(render.get("status") in {"failed", "warning", "partial"} or (isinstance(exit_code, int) and exit_code != 0))
    if missing or not extraction_complete:
        status = "partial"
    elif renderer_failed:
        status = "warning"
    else:
        status = "complete"
    return {
        "status": status,
        "direct_ooxml_extraction": "complete" if extraction_complete else "partial",
        "render_files": {"expected": len(expected_files), "missing": missing},
        "renderer": {"status": render.get("status", "unknown"), "exit_code": exit_code},
    }


def _candidate_json_path(candidate_id: str, data_root: Path) -> Path:
    if not re.fullmatch(r"cand_[A-Za-z0-9_-]{8,64}", candidate_id):
        raise ValueError("invalid candidate id")
    return data_root / "asset_candidates" / candidate_id / "candidate.json"


def _candidate_source_package(candidate: dict[str, Any]) -> Path:
    source_path = Path(str(candidate.get("source", {}).get("source_path", ""))).expanduser()
    if not source_path.is_file():
        raise FileNotFoundError("candidate source file is missing")
    return source_path.resolve()


def _public_report_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    result = _candidate_public(candidate)
    metadata = draft_metadata(candidate)
    result["metadata_draft"] = metadata
    result["template_ready"] = bool(candidate.get("sanitized_template"))
    return result


def discover_from_manifest(manifest_path: str | Path, data_dir: str | Path, slide_no: int | None = None) -> dict[str, Any]:
    manifest_file = Path(manifest_path).resolve()
    if not manifest_file.is_file():
        raise FileNotFoundError(f"manifest not found: {manifest_file}")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    source_value = manifest.get("source_path")
    if not source_value:
        raise FileNotFoundError("Original PPTX/POTX path is missing. Re-ingest this source once.")
    source_path = Path(str(source_value)).expanduser()
    if not source_path.is_absolute():
        source_path = (manifest_file.parent / source_path).resolve()
    package = inspect_package(source_path)
    package["source_path"] = str(source_path)
    package["source_key"] = manifest.get("source_key", manifest_file.parent.name)
    candidates = discover_candidates(package, slide_no)
    data_root = _data_root(data_dir)
    for candidate in candidates:
        _write_json_atomic(data_root / "asset_candidates" / candidate["candidate_id"] / "candidate.json", candidate)
    return {
        "source_key": package["source_key"],
        "source_type": package["source_type"],
        "slide_no": slide_no,
        "candidate_count": len(candidates),
        "candidates": [_public_report_candidate(candidate) for candidate in candidates],
        "evidence": assess_selection_evidence(manifest, package, data_root),
    }


class AssetConflictError(ValueError):
    """A valid request that conflicts with an existing permanent asset."""


def _walk_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [item for key, child in value.items() for item in ([key] + _walk_strings(child))]
    if isinstance(value, list):
        return [item for child in value for item in _walk_strings(child)]
    return []


def _reject_source_payload(value: Any, candidate: dict[str, Any]) -> None:
    def visit(item: Any) -> None:
        if isinstance(item, dict):
            for key, child in item.items():
                if key in FORBIDDEN_PERMANENT_FIELDS:
                    raise ValueError("source text/path fields are not allowed in approved metadata")
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)
        elif isinstance(item, str):
            lower = item.lower()
            if "source text" in lower or "raw text" in lower:
                raise ValueError("source text is not allowed in approved metadata")
            source_path = str(candidate.get("source", {}).get("source_path", ""))
            source_name = Path(source_path).name.lower()
            if source_name and source_name in lower:
                raise ValueError("source filename is not allowed in approved metadata")
            for shape in _shape_leaves(candidate.get("raw_shapes", [])):
                raw_text = str(shape.get("text", "")).strip()
                if len(raw_text) >= 3 and raw_text in item:
                    raise ValueError("source text is not allowed in approved metadata")
    visit(value)


def _safe_module_id(module_id: str) -> str:
    if not isinstance(module_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", module_id):
        raise ValueError("module_id must contain only letters, numbers, '_' or '-'")
    return module_id


def _catalog_path(pattern_root: Path) -> Path:
    return pattern_root / "unified-visual-module-catalog.json"


def _load_catalog(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    value = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(value, dict):
        value = value.get("assets", [])
    if not isinstance(value, list):
        raise ValueError("asset catalog must be a JSON array")
    return value


def _replace_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def _restore_file(path: Path, previous: bytes | None) -> None:
    if previous is None:
        if path.exists():
            path.unlink()
        return
    _replace_bytes(path, previous)


def _read_png_info(data: bytes) -> dict[str, Any] | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) < 26:
        return None
    width, height = struct.unpack(">II", data[16:24])
    color_type = data[25]
    transparent = color_type in {4, 6}
    cursor = 8
    while cursor + 12 <= len(data):
        length = struct.unpack(">I", data[cursor:cursor + 4])[0]
        chunk = data[cursor + 4:cursor + 8]
        if chunk == b"tRNS":
            transparent = True
        cursor += 12 + length
        if chunk == b"IEND":
            break
    return {"width_px": width, "height_px": height, "transparent": transparent, "mime_type": "image/png", "extension": "png"}


def _read_jpeg_info(data: bytes) -> dict[str, Any] | None:
    if not data.startswith(b"\xff\xd8"):
        return None
    cursor = 2
    sof_markers = set(range(0xC0, 0xC4)) | set(range(0xC5, 0xC8)) | set(range(0xC9, 0xCC)) | set(range(0xCD, 0xD0))
    while cursor + 9 < len(data):
        if data[cursor] != 0xFF:
            cursor += 1
            continue
        marker = data[cursor + 1]
        cursor += 2
        if marker in {0xD8, 0xD9}:
            continue
        if cursor + 2 > len(data):
            break
        length = struct.unpack(">H", data[cursor:cursor + 2])[0]
        if marker in sof_markers and cursor + 7 <= len(data):
            height, width = struct.unpack(">HH", data[cursor + 3:cursor + 7])
            return {"width_px": width, "height_px": height, "transparent": False, "mime_type": "image/jpeg", "extension": "jpg"}
        cursor += max(length, 2)
    return None


def _image_info(data: bytes, content_type: str = "") -> dict[str, Any]:
    info = _read_png_info(data) or _read_jpeg_info(data)
    if not info:
        raise ValueError("photo asset must be a PNG or JPEG")
    if content_type and content_type.startswith("image/"):
        info["mime_type"] = content_type
    info["aspect_ratio"] = round(info["width_px"] / info["height_px"], 6) if info["height_px"] else 0
    return info


def _photo_bytes(candidate: dict[str, Any], request: dict[str, Any]) -> tuple[bytes, str]:
    if request.get("photo_path"):
        photo_path = Path(str(request["photo_path"])).expanduser().resolve()
        if not photo_path.is_file():
            raise FileNotFoundError("photo_path not found")
        return photo_path.read_bytes(), ""
    source_path = _candidate_source_package(candidate)
    media_refs = candidate.get("media_refs") or []
    target = next((str(ref.get("target")) for ref in media_refs if ref.get("target")), "")
    if not target:
        raise ValueError("photo candidate has no media relationship")
    with zipfile.ZipFile(source_path) as package:
        try:
            return package.read(target), str(next((ref.get("content_type", "") for ref in media_refs if ref.get("target") == target), ""))
        except KeyError as exc:
            raise FileNotFoundError("photo media relationship target is missing") from exc


def _required_request_fields(request: dict[str, Any]) -> None:
    required = {"module_id", "display_name", "module_type", "asset_kind", "description", "design_traits", "use_cases", "search_tags", "usage_mode"}
    missing = sorted(field for field in required if field not in request)
    if missing:
        raise ValueError(f"missing metadata: {', '.join(missing)}")
    for field in ("display_name", "description"):
        if not isinstance(request[field], str) or not request[field].strip():
            raise ValueError(f"{field} is required")
    for field in ("design_traits", "use_cases", "search_tags"):
        if not isinstance(request[field], list) or not request[field] or not all(isinstance(item, str) and item.strip() for item in request[field]):
            raise ValueError(f"{field} must be a non-empty string array")


def _permanent_entry(template: dict[str, Any], request: dict[str, Any], candidate: dict[str, Any], template_ref: str) -> dict[str, Any]:
    module_type = request["module_type"]
    entry = {
        "module_id": request["module_id"],
        "display_name": request["display_name"].strip(),
        "asset_kind": request["asset_kind"],
        "module_type": module_type,
        "description": request["description"].strip(),
        "design_traits": request["design_traits"],
        "use_cases": request["use_cases"],
        "search_tags": request["search_tags"],
        "renderer_key": "responsive_native_template",
        "template": template_ref,
        "usage_mode": request["usage_mode"],
        "render_mode": "native_powerpoint_shapes",
        "provenance_ref": candidate.get("signature", "sha256:" + "0" * 64),
        "license": request.get("license", "user-provided"),
        "license_status": request.get("license_status", "user_confirmed"),
        "approved_at": request.get("approved_at") or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
    entry.update({key: request[key] for key in ("icon_category", "recolorable", "frame_count", "crop_mode", "caption_slot") if key in request})
    if template.get("photo_info"):
        entry.update(template["photo_info"])
    return entry


def _validate_entry(entry: dict[str, Any]) -> None:
    required = {"module_id", "display_name", "asset_kind", "module_type", "description", "design_traits", "use_cases", "search_tags", "renderer_key", "template", "usage_mode", "render_mode", "provenance_ref", "license", "license_status", "approved_at"}
    missing = required - set(entry)
    if missing:
        raise ValueError(f"missing permanent metadata: {', '.join(sorted(missing))}")
    if entry["asset_kind"] not in ASSET_KINDS:
        raise ValueError("unsupported asset_kind")
    if entry["renderer_key"] not in {"responsive_native_template", "photo_asset_reference"}:
        raise ValueError("unsupported renderer_key")
    if any(field in entry for field in FORBIDDEN_PERMANENT_FIELDS):
        raise ValueError("source text/path fields are not allowed in permanent catalog")
    serialized = json.dumps(entry, ensure_ascii=False)
    if re.search(r"(?:[A-Za-z]:\\|\\\\|/storage/|/tmp/)", serialized):
        raise ValueError("absolute source path is not allowed in permanent catalog")


def promote_asset(candidate_id: str, request: dict[str, Any], data_dir: str | Path, pattern_root: str | Path) -> dict[str, Any]:
    """Promote one approved local candidate with rollback on every later rename."""

    data_root = _data_root(data_dir)
    candidate_path = _candidate_json_path(candidate_id, data_root)
    if not candidate_path.is_file():
        raise FileNotFoundError(f"candidate not found: {candidate_id}")
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    if not isinstance(request, dict):
        raise ValueError("promotion request must be an object")
    _required_request_fields(request)
    _reject_source_payload(request, candidate)
    module_id = _safe_module_id(request["module_id"])
    asset_kind = request["asset_kind"]
    module_type = request["module_type"]
    if asset_kind not in ASSET_KINDS or module_type not in MODULE_TYPES:
        raise ValueError("unsupported asset kind or module type")
    if candidate.get("curation_status") == "rejected":
        raise ValueError("rejected candidate cannot be promoted")
    candidate_asset_kind = candidate.get("asset_kind")
    if asset_kind == "photo_asset" and candidate_asset_kind != "photo_asset":
        raise ValueError("photo_asset requires an explicit photo candidate")
    if asset_kind != "photo_asset" and candidate_asset_kind == "photo_asset":
        raise ValueError("photo candidate cannot be promoted as a native block")

    root = Path(pattern_root).resolve()
    catalog_file = _catalog_path(root)
    catalog = _load_catalog(catalog_file)
    if any(item.get("module_id") == module_id for item in catalog):
        raise AssetConflictError(f"module_id already exists: {module_id}")

    old_catalog = catalog_file.read_bytes() if catalog_file.exists() else None
    old_candidate = candidate_path.read_bytes()
    asset_file: Path
    asset_bytes: bytes | None = None
    photo_info: dict[str, Any] | None = None
    template: dict[str, Any]
    if asset_kind == "photo_asset":
        if request.get("license_status") not in {"user_confirmed", "cc0", "cc-by", "cc-by-sa", "public-domain", "royalty-free"}:
            raise ValueError("photo_asset requires user_confirmed or an approved license status")
        asset_bytes, content_type = _photo_bytes(candidate, request)
        content_hash = hashlib.sha256(asset_bytes).hexdigest()
        photo_info = _image_info(asset_bytes, content_type)
        extension = photo_info["extension"]
        asset_file = root / "photos" / f"{content_hash}.{extension}"
        template = {"version": 1, "module_id": module_id, "asset_kind": "photo_asset", "module_type": "photo", "photo_info": {**photo_info, "content_sha256": content_hash}}
    else:
        template = candidate.get("sanitized_template") or sanitize_candidate(candidate)
        template = json.loads(json.dumps(template, ensure_ascii=False))
        template.update({"module_id": module_id, "asset_kind": asset_kind, "module_type": module_type})
        if isinstance(template.get("diagram"), dict) and isinstance(template["diagram"].get("topology"), dict):
            template["diagram"]["topology"]["kind"] = module_type
        validate_native_template(template)
        folder = {"icon_asset": "icons", "media_frame": "media-frames"}.get(asset_kind, "templates")
        asset_file = root / folder / f"{module_id}.json"
        asset_bytes = (json.dumps(template, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    template_ref = asset_file.relative_to(root).as_posix()
    entry = _permanent_entry(template, request, candidate, template_ref)
    if asset_kind == "photo_asset":
        entry["renderer_key"] = "photo_asset_reference"
        entry["render_mode"] = "native_powerpoint_shapes"
        entry.update(photo_info or {})
        entry["content_sha256"] = (template.get("photo_info") or {}).get("content_sha256", "")
    _validate_entry(entry)
    new_catalog = sorted([*catalog, entry], key=lambda item: item.get("module_id", ""))
    target_existed = asset_file.exists()
    catalog_replaced = False
    candidate_replaced = False
    try:
        if not target_existed and asset_bytes is not None:
            _replace_bytes(asset_file, asset_bytes)
        _write_json_atomic(catalog_file, new_catalog)
        catalog_replaced = True
        candidate["lifecycle_status"] = "promoted"
        candidate["promoted_module_id"] = module_id
        candidate["promoted_template"] = template_ref
        _write_json_atomic(candidate_path, candidate)
        candidate_replaced = True
    except Exception:
        try:
            _restore_file(candidate_path, old_candidate)
            _restore_file(catalog_file, old_catalog)
            if not target_existed and asset_file.exists():
                asset_file.unlink()
        except Exception:
            # Preserve the original exception; the next invocation can repair a
            # stale local candidate without creating a second catalog entry.
            pass
        raise
    return {"status": "promoted", "candidate_id": candidate_id, "asset": entry, "asset_path": str(asset_file)}


def verify_pptx(source_path: str | Path, allow_pictures: int = 0) -> dict[str, Any]:
    package = inspect_package(source_path)
    leaves = []
    for slide in package.get("slides", []):
        leaves.extend(_shape_leaves(slide.get("effective_shapes", [])))
    native_shapes = [shape for shape in leaves if shape.get("kind") in {"shape", "connector", "group"}]
    text_count = sum(1 for shape in leaves if shape.get("text"))
    picture_count = sum(1 for shape in leaves if shape.get("kind") == "picture")
    if picture_count > allow_pictures:
        raise ValueError(f"picture count {picture_count} exceeds allow-pictures {allow_pictures}")
    return {
        "source_type": package.get("source_type"),
        "slide_count": len(package.get("slides", [])),
        "native_shape_count": len(native_shapes),
        "text_count": text_count,
        "picture_count": picture_count,
        "unsupported_graphic_count": sum(1 for shape in leaves if shape.get("kind") == "unsupported_graphic"),
        "fidelity_passed": bool(native_shapes or text_count),
    }


def _cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Discover and promote editable PowerPoint assets.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    discover = subparsers.add_parser("discover")
    discover.add_argument("--manifest", required=True)
    discover.add_argument("--slide-no", type=int)
    discover.add_argument("--data-dir", default="storage")
    promote = subparsers.add_parser("promote")
    promote.add_argument("--candidate-id", required=True)
    promote.add_argument("--request-json", required=True)
    promote.add_argument("--data-dir", default="storage")
    promote.add_argument("--pattern-root", default="tools/pattern-library")
    verify = subparsers.add_parser("verify-pptx")
    verify.add_argument("--pptx", required=True)
    verify.add_argument("--allow-pictures", type=int, default=0)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        args = _cli_parser().parse_args(argv)
        if args.command == "discover":
            result = discover_from_manifest(args.manifest, args.data_dir, args.slide_no)
        elif args.command == "promote":
            payload = sys.stdin.read() if args.request_json == "-" else Path(args.request_json).read_text(encoding="utf-8")
            result = promote_asset(args.candidate_id, json.loads(payload), args.data_dir, args.pattern_root)
        else:
            result = verify_pptx(args.pptx, args.allow_pictures)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except AssetConflictError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 4
    except (FileNotFoundError, KeyError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 3
    except ValueError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 5


if __name__ == "__main__":
    raise SystemExit(main())
