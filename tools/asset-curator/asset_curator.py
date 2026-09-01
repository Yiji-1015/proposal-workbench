#!/usr/bin/env python3
"""Read native PPTX/POTX structure for reusable proposal asset curation.

The module intentionally keeps the first pass deterministic and dependency-light:
OOXML is read directly from the package so POTX files work even when python-pptx
rejects their template content type.
"""

from __future__ import annotations

import posixpath
import re
import zipfile
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
