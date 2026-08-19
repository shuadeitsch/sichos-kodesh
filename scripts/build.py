#!/usr/bin/env python3
"""Build scans/*.jpg and data/pages.json from the vol-01 source (read-only)."""

from __future__ import annotations

import html
import json
import os
import re
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace/sichos-kodesh-2.0/vol-01")
SITE = Path("/workspace/sichos-kodesh-site")
TRANSCRIPTS = ROOT / "transcripts"
PAGES = ROOT / "pages"
OUT_SCANS = SITE / "scans"
OUT_DATA = SITE / "data"

HEADINGS = {
    "פתח דבר",
    "מפתח",
    "מפתח ענינים",
    "הוספות",
    "שיחות קודש",
}

MARK_LINE_RE = re.compile(
    r"^\s*(?:-\s*[^-]+?\s*-)(?:\s+-\s*[^-]+?\s*-)*\s*$"
)
MARK_TOKEN_RE = re.compile(r"-\s*([^-]+?)\s*-")
ORNAMENT_RE = re.compile(r"^\*\s*(?:\*\s*)+$")
FN_CONT_RE = re.compile(r"^\(\(fn-cont\)\)\s*$")
BOLD_RE = re.compile(r"__(.+?)__")
FIX_RE = re.compile(r"\[\[(.+?)\|\|(.+?)\]\]")
FOOTNOTE_START_RE = re.compile(r"^\(\d")
STUB_RE = re.compile(r"^\[.+\]$")


def convert_one(args: tuple[str, str]) -> int:
    src, dst = args
    im = Image.open(src)
    im = im.convert("RGB")
    w, h = im.size
    if w > 1400:
        nh = round(h * 1400 / w)
        im = im.resize((1400, nh), Image.Resampling.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    return os.path.getsize(dst)


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta: dict[str, str] = {}
    for line in parts[1].splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, val = line.split(":", 1)
        meta[key.strip()] = val.strip()
    body = parts[2]
    if body.startswith("\n"):
        body = body[1:]
    return meta, body


def apply_inline(text: str) -> str:
    escaped = html.escape(text, quote=False)

    def fix_sub(m: re.Match) -> str:
        ink = m.group(1).replace('"', "&quot;")
        fix = m.group(2)
        return f'<span class="fix" title="ink: {ink}">{fix}</span>'

    escaped = FIX_RE.sub(fix_sub, escaped)
    escaped = BOLD_RE.sub(r"<strong>\1</strong>", escaped)
    return escaped


def is_mark_line(line: str) -> bool:
    s = line.strip()
    return bool(s) and bool(MARK_LINE_RE.match(s))


def mark_tokens(line: str) -> list[str]:
    return [t.strip() for t in MARK_TOKEN_RE.findall(line.strip())]


SKIP_NOTE = {"catchword", "stamp-line"}


def p_tag(inner: str, cls: str | None = None, p_index: int | None = None) -> str:
    attrs: list[str] = []
    if cls:
        attrs.append(f'class="{cls}"')
    if p_index is not None:
        attrs.append(f'data-p="{p_index}"')
    attr = (" " + " ".join(attrs)) if attrs else ""
    return f"<p{attr}>{inner}</p>"


def classify_paragraph(text: str) -> str | None:
    stripped = text.strip()
    if stripped in HEADINGS:
        return "heading"
    if stripped.startswith('בס"ד') or stripped.startswith("בס״ד"):
        return "dateline"
    if stripped.startswith("(*"):
        return "sidenote"
    if stripped == "בלתי מוגה":
        return "stamp-line"
    if stripped in {"תש\"י", "תשי\"א", "תש״י", "תשי״א"}:
        return "kicker"
    if FOOTNOTE_START_RE.match(stripped):
        return "fn"
    return None


def emit_p(chunks: list[str], counter: list[int], inner: str, cls: str | None = None) -> None:
    if cls in SKIP_NOTE:
        chunks.append(p_tag(inner, cls))
        return
    chunks.append(p_tag(inner, cls, counter[0]))
    counter[0] += 1


def flush_para(
    buf: list[str], chunks: list[str], in_fn: bool, counter: list[int]
) -> bool:
    if not buf:
        return in_fn
    joined = " ".join(ln.strip() for ln in buf if ln.strip())
    buf.clear()
    if not joined:
        return in_fn
    cls = classify_paragraph(joined)
    if cls == "fn" and not in_fn:
        chunks.append('<div class="footnotes">')
        in_fn = True
        cls = None
    if "\t" in joined:
        left, right = joined.split("\t", 1)
        left_h = apply_inline(left.strip())
        right_h = apply_inline(right.strip())
        emit_p(
            chunks,
            counter,
            f'<span class="entry-text">{left_h}</span>'
            f'<span class="entry-page">{right_h}</span>',
            "entry",
        )
        return in_fn
    emit_p(chunks, counter, apply_inline(joined), cls)
    return in_fn


def render_body(body: str, print_page: str | None, page_type: str) -> str:
    if page_type == "skip":
        return ""

    lines = body.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    if page_type in {"cover", "title"}:
        return render_titlepage(lines)

    chunks: list[str] = []
    buf: list[str] = []
    in_fn = False
    counter = [0]
    print_norm = (print_page or "").strip()

    def ensure_fn() -> None:
        nonlocal in_fn
        if not in_fn:
            chunks.append('<div class="footnotes">')
            in_fn = True

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            in_fn = flush_para(buf, chunks, in_fn, counter)
            continue

        if STUB_RE.match(stripped) and page_type == "skip":
            continue

        if is_mark_line(stripped):
            in_fn = flush_para(buf, chunks, in_fn, counter)
            kept = [t for t in mark_tokens(stripped) if t != print_norm]
            for tok in kept:
                chunks.append(p_tag(apply_inline(tok), "catchword"))
            continue

        if ORNAMENT_RE.match(stripped):
            in_fn = flush_para(buf, chunks, in_fn, counter)
            chunks.append('<div class="ornament" aria-hidden="true">· · ·</div>')
            continue

        if FN_CONT_RE.match(stripped):
            in_fn = flush_para(buf, chunks, in_fn, counter)
            ensure_fn()
            continue

        if FOOTNOTE_START_RE.match(stripped):
            in_fn = flush_para(buf, chunks, in_fn, counter)
            buf.append(stripped)
            continue

        if "\t" in stripped:
            buf.append(stripped)
            in_fn = flush_para(buf, chunks, in_fn, counter)
            continue

        buf.append(stripped)

    in_fn = flush_para(buf, chunks, in_fn, counter)
    if in_fn:
        chunks.append("</div>")
    return "".join(chunks)


def render_titlepage(lines: list[str]) -> str:
    parts = ['<div class="titlepage">']
    counter = [0]
    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            parts.append('<div class="sp"></div>')
            continue
        if ORNAMENT_RE.match(stripped):
            parts.append('<div class="ornament" aria-hidden="true">· · ·</div>')
            continue
        if stripped == "שיחות קודש":
            emit_p(parts, counter, apply_inline(stripped), "display")
        elif stripped in {"בלתי מוגה", "הנחה בלתי מוגה"}:
            parts.append(p_tag(apply_inline(stripped), "stamp-line"))
        else:
            emit_p(parts, counter, apply_inline(stripped))
    parts.append("</div>")
    return "".join(parts)


def empty_to_none(val: str | None) -> str | None:
    if val is None:
        return None
    val = val.strip()
    return val or None


def normalize_sicha(sicha: str | None) -> str | None:
    if not sicha:
        return None
    # p56 frontmatter typo קסע → קטע
    return sicha.replace("קסע", "קטע")


def sicha_family(sicha: str) -> str:
    n = normalize_sicha(sicha) or ""
    if "שבועות" in n or 'חגה"ש' in n:
        return "shavuos"
    return n


LABEL_RULES: tuple[tuple[str, str], ...] = (
    ('י"ד שבט', 'י"ד שבט'),
    ("יתרו", "יתרו"),
    ('ויק"פ', 'ויק"פ'),
    ("אחרון של פסח", 'אחש"פ'),
    ('אחש"פ', 'אחש"פ'),
    ("שמיני", "שמיני"),
    ("ליל ב' אייר", "ליל ב' אייר"),
    ("פסח שני", "פסח שני"),
    ('ל"ג בעומר', 'ל"ג בעומר'),
    ("בהר", 'בה"ב'),
    ('בה"ב', 'בה"ב'),
    ('ר"ח סיון', 'ר"ח סיון'),
    ("שבועות", "יום ב' דחגה\"ש"),
    ('חגה"ש', "יום ב' דחגה\"ש"),
    ("כ' מנ\"א", "כ' מנ\"א"),
)


def mafteiach_label(sicha: str) -> str:
    for needle, label in LABEL_RULES:
        if needle in sicha:
            return label
    return sicha


def build_toc(records: list[dict]) -> dict:
    front_specs = (
        ("cover", "שער", "cover"),
        ("petach-davar", "פתח דבר", "petach-davar"),
        ("title", "שער פנימי", "title"),
        ("mafteiach", "מפתח", "mafteiach"),
        ("mafteiach-inyanim", "מפתח ענינים", "mafteiach-inyanim"),
    )
    front = []
    for typ, title, fid in front_specs:
        pages = [r for r in records if r["type"] == typ]
        if not pages:
            continue
        front.append(
            {
                "id": fid,
                "title": title,
                "label": title,
                "start": pages[0]["n"],
                "end": pages[-1]["n"],
                "printStart": pages[0]["print"],
                "printEnd": pages[-1]["print"],
            }
        )

    body = [r for r in records if r["type"] == "body" and r.get("sicha")]
    groups: list[dict] = []
    current: dict | None = None
    for r in body:
        key = sicha_family(r["sicha"])
        title = normalize_sicha(r["sicha"])
        if current and current["key"] == key:
            current["pages"].append(r)
        else:
            if current:
                groups.append(current)
            current = {"key": key, "title": title, "pages": [r]}
    if current:
        groups.append(current)

    farbrengens = []
    for g in groups:
        pages = g["pages"]
        title = g["title"]
        farbrengens.append(
            {
                "id": f"p{pages[0]['n']}",
                "title": title,
                "label": mafteiach_label(title),
                "start": pages[0]["n"],
                "end": pages[-1]["n"],
                "printStart": pages[0]["print"],
                "printEnd": pages[-1]["print"],
            }
        )
    return {"front": front, "farbrengens": farbrengens}


def main() -> None:
    OUT_SCANS.mkdir(parents=True, exist_ok=True)
    OUT_DATA.mkdir(parents=True, exist_ok=True)

    pngs = sorted(PAGES.glob("page-*.png"))
    jobs = []
    for png in pngs:
        dst = OUT_SCANS / (png.stem + ".jpg")
        if not dst.exists():
            jobs.append((str(png), str(dst)))

    if jobs:
        print(f"converting {len(jobs)} scans…")
        with ProcessPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as ex:
            sizes = list(ex.map(convert_one, jobs))
        print(f"  wrote {len(sizes)} jpegs")
    existing = list(OUT_SCANS.glob("*.jpg"))
    scan_bytes = sum(f.stat().st_size for f in existing)
    print(f"  {len(existing)} jpegs, {scan_bytes / 1_000_000:.1f} MB")

    records = []
    for path in sorted(TRANSCRIPTS.glob("page-*.txt")):
        text = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        n = int(meta.get("pdf_page") or path.stem.split("-")[1])
        print_page = empty_to_none(meta.get("print_page"))
        page_type = empty_to_none(meta.get("type")) or "body"
        status = empty_to_none(meta.get("status")) or "draft"
        sicha = empty_to_none(meta.get("sicha"))
        html_body = render_body(body, print_page, page_type)
        stem = f"page-{n:04d}"
        records.append(
            {
                "n": n,
                "print": print_page,
                "type": page_type,
                "status": status,
                "sicha": sicha,
                "html": html_body,
                "scan": f"scans/{stem}.jpg",
            }
        )

    records.sort(key=lambda r: r["n"])
    out = OUT_DATA / "pages.json"
    out.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {out} ({len(records)} pages, {out.stat().st_size / 1000:.1f} KB)")

    toc = build_toc(records)
    toc_path = OUT_DATA / "farbrengens.json"
    toc_path.write_text(
        json.dumps(toc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {toc_path} "
        f"({len(toc['front'])} front, {len(toc['farbrengens'])} farbrengens)"
    )

    # sanity
    p16 = next(r for r in records if r["n"] == 16)
    assert "שיחות" in p16["html"]
    assert "<strong>" in p16["html"]
    assert "catchword" in p16["html"]
    p17 = next(r for r in records if r["n"] == 17)
    assert "class=\"fix\"" in p17["html"]
    assert "טאטענס" in p17["html"]
    p2 = next(r for r in records if r["n"] == 2)
    assert p2["html"] == ""
    p16_html = p16["html"]
    assert 'data-p="' in p16_html
    assert "catchword" in p16_html
    assert 'data-p="' not in p16_html.split("catchword")[1].split("</p>")[0]
    shavuos = [f for f in toc["farbrengens"] if f["id"] == "p55"]
    assert len(shavuos) == 1 and shavuos[0]["end"] == 84
    assert shavuos[0]["label"] == 'יום ב\' דחגה"ש'
    assert any(f["label"] == 'י"ד שבט' for f in toc["farbrengens"])
    print("sanity checks ok")


if __name__ == "__main__":
    main()
