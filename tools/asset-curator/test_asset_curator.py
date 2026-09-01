#!/usr/bin/env python3
"""Synthetic package tests for the native PPTX/POTX asset reader."""

import sys
import json
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

try:
    from asset_curator import discover_from_manifest, inspect_package, promote_asset
except ModuleNotFoundError as exc:  # The first red phase should fail clearly.
    raise RuntimeError("Task 1 expects tools/asset-curator/asset_curator.py") from exc


P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def xml_header(body: str) -> bytes:
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>{body}'.encode("utf-8")


def rels(items: list[tuple[str, str, str]]) -> bytes:
    body = "<Relationships xmlns=\"%s\">%s</Relationships>" % (
        REL_NS,
        "".join(
            f'<Relationship Id="{rid}" Type="{kind}" Target="{target}"/>'
            for rid, kind, target in items
        ),
    )
    return xml_header(body)


def xfrm(x: int, y: int, width: int, height: int, *, children: tuple[int, int, int, int] | None = None) -> str:
    child_xml = ""
    if children:
        cx, cy, cw, chh = children
        child_xml = f'<a:chOff x="{cx}" y="{cy}"/><a:chExt cx="{cw}" cy="{chh}"/>'
    return f'<a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{width}" cy="{height}"/>{child_xml}</a:xfrm>'


def text_body(value: str) -> str:
    if not value:
        return ""
    escaped = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR"/><a:t>{escaped}</a:t></a:r><a:endParaRPr lang="ko-KR"/></a:p></p:txBody>'


def shape_xml(shape_id: int, name: str, x: int, y: int, width: int, height: int, *, text: str = "", custom: bool = False, zero: bool = False) -> str:
    if zero:
        width = 0
    geometry = (
        '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:pathLst>'
        '<a:path w="100000" h="100000"><a:moveTo><a:pt x="0" y="0"/></a:moveTo>'
        '<a:lnTo><a:pt x="100000" y="100000"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>'
        if custom else '<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>'
    )
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" name="{name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr>{xfrm(x, y, width, height)}{geometry}<a:solidFill><a:srgbClr val="1769E0"/></a:solidFill>'
        '<a:ln><a:solidFill><a:srgbClr val="1769E0"/></a:solidFill></a:ln></p:spPr>'
        f'{text_body(text)}</p:sp>'
    )


def connector_xml(shape_id: int, name: str, x: int, y: int, width: int, height: int, start_id: int, end_id: int) -> str:
    return (
        f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{shape_id}" name="{name}"/><p:cNvCxnSpPr>'
        f'<a:stCxn id="{start_id}" idx="2"/><a:endCxn id="{end_id}" idx="0"/>'
        '</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>'
        f'<p:spPr>{xfrm(x, y, width, height)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>'
        '<a:ln><a:solidFill><a:srgbClr val="4A8CF0"/></a:solidFill></a:ln></p:spPr></p:cxnSp>'
    )


def picture_xml(shape_id: int, name: str, x: int, y: int, width: int, height: int) -> str:
    return (
        f'<p:pic><p:nvPicPr><p:cNvPr id="{shape_id}" name="{name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
        '<p:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        f'<p:spPr>{xfrm(x, y, width, height)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    )


def placeholder_xml(shape_id: int, name: str, x: int, y: int, width: int, height: int) -> str:
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" name="{name}"/><p:cNvSpPr/><p:nvPr><p:ph type="pic" idx="1"/></p:nvPr></p:nvSpPr>'
        f'<p:spPr>{xfrm(x, y, width, height)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>'
    )


def group_xml() -> str:
    return (
        '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="Native process group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        f'<p:grpSpPr>{xfrm(1000000, 1000000, 4000000, 2000000, children=(1000000, 1000000, 4000000, 2000000))}</p:grpSpPr>'
        f'{shape_xml(11, "Node A", 1000000, 1100000, 1200000, 600000, text="원본 문구")}'
        f'{connector_xml(12, "Node connector", 2200000, 1300000, 1000000, 0, 11, 13)}'
        f'{shape_xml(13, "Node B", 3200000, 1100000, 1200000, 600000, text="두 번째")}'
        '</p:grpSp>'
    )


def shape_tree(children: str) -> str:
    return '<p:nvGrpSpPr><p:cNvPr id="0" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + children


def master_xml(children: str) -> bytes:
    return xml_header(
        f'<p:sldMaster xmlns:a="{A_NS}" xmlns:r="{R_NS}" xmlns:p="{P_NS}"><p:cSld name="Master"><p:spTree>{children}</p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'
    )


def layout_xml(children: str) -> bytes:
    return xml_header(
        f'<p:sldLayout xmlns:a="{A_NS}" xmlns:r="{R_NS}" xmlns:p="{P_NS}" type="title"><p:cSld name="Layout"><p:spTree>{children}</p:spTree></p:cSld><p:clrMapOvr/></p:sldLayout>'
    )


def slide_xml(children: str) -> bytes:
    return xml_header(
        f'<p:sld xmlns:a="{A_NS}" xmlns:r="{R_NS}" xmlns:p="{P_NS}"><p:cSld name="Slide"><p:spTree>{children}</p:spTree></p:cSld><p:clrMapOvr/></p:sld>'
    )


def presentation_xml(source_type: str) -> bytes:
    return xml_header(
        f'<p:presentation xmlns:a="{A_NS}" xmlns:r="{R_NS}" xmlns:p="{P_NS}"><p:sldMasterIdLst><p:sldMasterId id="1" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="1" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
    )


def content_types(source_type: str) -> bytes:
    presentation_type = (
        "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"
        if source_type == "potx"
        else "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
    )
    return xml_header(
        f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="{presentation_type}"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'
    )


def write_fixture(path: Path, source_type: str = "pptx", rich: bool = True) -> Path:
    master_children = shape_xml(1, "Master header", 400000, 300000, 5000000, 500000, text="마스터 제목")
    layout_children = shape_xml(2, "Layout footer", 400000, 6000000, 3000000, 300000, text="공통 각주")
    if not rich:
        slide_children = shape_xml(3, "Slide body", 700000, 1200000, 3000000, 1500000, text="슬라이드 본문")
    else:
        slide_children = (
            shape_xml(3, "Slide title", 500000, 200000, 5000000, 400000, text="SAMPLE")
            + group_xml()
            + placeholder_xml(20, "Picture placeholder", 7000000, 900000, 2500000, 1800000)
            + picture_xml(30, "Photo", 7000000, 3000000, 2500000, 1800000)
            + shape_xml(40, "Custom icon", 300000, 4000000, 700000, 700000, custom=True)
            + shape_xml(41, "Zero", 300000, 5000000, 700000, 700000, zero=True)
            + '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="50" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic/></p:graphicFrame>'
        )

    entries = {
        "[Content_Types].xml": content_types(source_type),
        "_rels/.rels": rels([("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "ppt/presentation.xml")]),
        "ppt/presentation.xml": presentation_xml(source_type),
        "ppt/_rels/presentation.xml.rels": rels([
            ("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster", "slideMasters/slideMaster1.xml"),
            ("rId2", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide", "slides/slide1.xml"),
        ]),
        "ppt/slideMasters/slideMaster1.xml": master_xml(master_children),
        "ppt/slideMasters/_rels/slideMaster1.xml.rels": rels([
            ("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout", "../slideLayouts/slideLayout1.xml"),
        ]),
        "ppt/slideLayouts/slideLayout1.xml": layout_xml(layout_children),
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels": rels([
            ("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster", "../slideMasters/slideMaster1.xml"),
        ]),
        "ppt/slides/slide1.xml": slide_xml(slide_children),
        "ppt/slides/_rels/slide1.xml.rels": rels([
            ("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout", "../slideLayouts/slideLayout1.xml"),
            ("rIdImage1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", "../media/image1.png"),
        ]),
        "ppt/media/image1.png": b"\x89PNG\r\n\x1a\nfixture",
    }
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name, value in entries.items():
            package.writestr(name, value)
    return path


class AssetCuratorPackageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        root = Path(self.temp.name)
        self.pptx_path = write_fixture(root / "rich.pptx", rich=True)
        self.potx_path = write_fixture(root / "template.potx", source_type="potx", rich=False)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_reads_potx_master_layout_and_slide_inheritance(self):
        package = inspect_package(self.potx_path)
        effective = package["slides"][0]["effective_shapes"]
        self.assertEqual(package["source_type"], "potx")
        self.assertEqual([shape["source_scope"] for shape in effective], ["master", "layout", "slide"])
        self.assertEqual(package["slides"][0]["layout_id"], "slideLayout1.xml")
        self.assertEqual(package["slides"][0]["master_id"], "slideMaster1.xml")

    def test_direct_group_tag_wins_over_descendant_connector(self):
        package = inspect_package(self.pptx_path)
        group = next(shape for shape in package["slides"][0]["local_shapes"] if shape["shape_id"] == "10")
        self.assertEqual(group["kind"], "group")
        self.assertEqual(group["children"][1]["kind"], "connector")
        self.assertEqual(group["children"][1]["connector"]["start_id"], "11")

    def test_reader_keeps_media_and_unsupported_types_explicit(self):
        slide = inspect_package(self.pptx_path)["slides"][0]
        by_id = {shape["shape_id"]: shape for shape in slide["local_shapes"]}
        self.assertEqual(by_id["20"]["kind"], "picture_placeholder")
        self.assertEqual(by_id["30"]["kind"], "picture")
        self.assertEqual(by_id["30"]["media"]["target"], "ppt/media/image1.png")
        self.assertEqual(by_id["50"]["kind"], "unsupported_graphic")
        self.assertTrue(by_id["40"]["custom_geometry"])

    def test_reader_marks_zero_size_and_off_canvas_shapes(self):
        slide = inspect_package(self.pptx_path)["slides"][0]
        by_id = {shape["shape_id"]: shape for shape in slide["local_shapes"]}
        self.assertTrue(by_id["41"]["excluded"])
        self.assertEqual(by_id["41"]["exclusion_reason"], "zero_size")


class AssetCuratorDiscoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = write_fixture(self.root / "source.pptx", rich=True)
        self.data_dir = self.root / "storage"
        self.source_key = "fixture"
        slide_dir = self.data_dir / "ingest_data" / self.source_key / "slides"
        slide_dir.mkdir(parents=True)
        (slide_dir / "slide-1.png").write_bytes(b"rendered")
        self.manifest = self.data_dir / "ingest_data" / self.source_key / "manifest.json"
        self.manifest.write_text(json.dumps({
            "status": "completed",
            "source_path": str(self.source),
            "source_key": self.source_key,
            "source_type": "pptx",
            "total_slides": 1,
            "extract": {"status": "completed", "completed": 1},
            "render": {"status": "completed", "completed": 1, "total": 1},
            "slides": [{"slide_no": 1, "image_ref": f"/storage/ingest_data/{self.source_key}/slides/slide-1.png"}],
        }, ensure_ascii=False), encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_selection_report_is_safe_and_evidence_is_complete(self):
        report = discover_from_manifest(self.manifest, self.data_dir)
        self.assertGreaterEqual(report["candidate_count"], 1)
        self.assertNotIn("SAMPLE", json.dumps(report, ensure_ascii=False))
        self.assertEqual(report["evidence"]["status"], "complete")
        candidate_id = report["candidates"][0]["candidate_id"]
        self.assertTrue((self.data_dir / "asset_candidates" / candidate_id / "candidate.json").is_file())
        self.assertNotIn("score", json.dumps(report, ensure_ascii=False).lower())

    def test_warning_and_partial_evidence_are_distinct(self):
        manifest = json.loads(self.manifest.read_text(encoding="utf-8"))
        manifest["render"]["status"] = "failed"
        manifest["render"]["exit_code"] = 1
        self.manifest.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        warning = discover_from_manifest(self.manifest, self.data_dir)
        self.assertEqual(warning["evidence"]["status"], "warning")
        (self.data_dir / "ingest_data" / self.source_key / "slides" / "slide-1.png").unlink()
        partial = discover_from_manifest(self.manifest, self.data_dir)
        self.assertEqual(partial["evidence"]["status"], "partial")

    def test_promote_removes_source_text_and_keeps_catalog_native(self):
        report = discover_from_manifest(self.manifest, self.data_dir)
        candidate = next(item for item in report["candidates"] if item["template_ready"])
        request = {
            "module_id": "fixture_process_001",
            "display_name": "단계형 프로세스 블록",
            "module_type": "process_chain",
            "asset_kind": "composite_block",
            "description": "업무 단계를 순차적으로 설명하는 반응형 블록입니다.",
            "design_traits": ["네이티브 컨테이너", "연결선 흐름"],
            "use_cases": ["업무 흐름"],
            "search_tags": ["프로세스", "단계"],
            "usage_mode": "structural",
            "license": "user-provided",
            "license_status": "user_confirmed",
        }
        pattern_root = self.root / "pattern-library"
        result = promote_asset(candidate["candidate_id"], request, self.data_dir, pattern_root)
        self.assertEqual(result["status"], "promoted")
        catalog = json.loads((pattern_root / "unified-visual-module-catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog[0]["asset_kind"], "composite_block")
        template = (pattern_root / "templates" / "fixture_process_001.json").read_text(encoding="utf-8")
        self.assertNotIn("원본 문구", template)
        self.assertEqual(json.loads((self.data_dir / "asset_candidates" / candidate["candidate_id"] / "candidate.json").read_text(encoding="utf-8"))["lifecycle_status"], "promoted")

    def test_source_text_request_is_rejected_before_permanent_write(self):
        report = discover_from_manifest(self.manifest, self.data_dir)
        candidate = next(item for item in report["candidates"] if item["template_ready"])
        request = {
            "module_id": "fixture_leak_001",
            "display_name": "누출 테스트",
            "module_type": "process_chain",
            "asset_kind": "composite_block",
            "description": "source text를 포함하면 안 됩니다.",
            "design_traits": ["테스트"],
            "use_cases": ["테스트"],
            "search_tags": ["테스트"],
            "usage_mode": "structural",
        }
        with self.assertRaisesRegex(ValueError, "source text"):
            promote_asset(candidate["candidate_id"], request, self.data_dir, self.root / "pattern-library")
        self.assertFalse((self.root / "pattern-library" / "unified-visual-module-catalog.json").exists())


if __name__ == "__main__":
    unittest.main()
