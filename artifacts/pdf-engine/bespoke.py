"""
bespoke.py
----------
Everything about Page 13 ("Your Bespoke Package"), plus overflow onto Page 14:

1. render_financials       -- guest count / cost / VAT / grand total
2. render_upgrade_list     -- no-op: keep full template marketing catalogue
3. render_package_columns  -- overlay itinerary timings only; keep template columns
4. apply_menu_links        -- rewrite / attach current-year menu URLs
"""

import re

import fitz

import config
from pdf_ops import redact_zone, draw_text, draw_field

_HIRE_RE = re.compile(r"private venue hire|current itinerary|itinerary is as follows", re.I)
_TIME_RE = re.compile(r"Embark will begin|Boat departs|Returns to pier|Disembark completes", re.I)
_KEEP_RE = re.compile(r"Complimentary pier stop|Full event management", re.I)
_SKIP_ITEM_RE = re.compile(
    r"complimentary pier stop|assigned event planner|event coordinators|pier coordinator",
    re.I,
)


def render_financials(doc: "fitz.Document", calculations: dict, font_mgr, warnings: list, profile=None):
    from pdf_ops import prepare_field_draw, draw_fields_batched

    page_index = profile.page_bespoke if profile and profile.page_bespoke is not None else config.PAGE_BESPOKE_PACKAGE
    fields = profile.financial_fields if profile and profile.financial_fields else config.FINANCIAL_FIELDS
    page = doc[page_index]
    font_mgr.ensure_registered(page)

    mapping = {
        "pkg_guests": calculations.get("guests"),
        "pkg_cost": _money(calculations.get("package_cost")),
        "pkg_vat": _money(calculations.get("vat")),
        "pkg_total": _money(calculations.get("grand_total")),
    }
    prepared = []
    for field_name, value in mapping.items():
        if value is None:
            continue
        spec = fields.get(field_name)
        if not spec:
            continue
        # Force deep bold white for orange-table figures (template look)
        spec = dict(spec)
        spec["bold"] = True
        spec["color"] = (1.0, 1.0, 1.0)
        spec["deep_bold"] = True
        prepared.append(prepare_field_draw(spec, str(value), font_mgr, warnings, field_name))
    draw_fields_batched(page, prepared, font_mgr, clear_graphics=False)


def _money(value) -> str | None:
    if value is None or value == "":
        return None
    try:
        return f"{float(value):,.2f}"
    except (TypeError, ValueError):
        return None


def render_upgrade_list(doc: "fitz.Document", selected_upgrades, font_mgr, warnings: list, profile=None):
    """
    Leave the template's full marketing upgrade catalogue intact.

    The right-hand column ("Consider upgrading your bespoke package to the
    left with the below items..." + the complete bullet list) is sales copy
    and must remain on every proposal. Do not redact or conditionally trim it
    based on selectedUpgrades / vessel / season.
    """
    return


def render_package_columns(doc: "fitz.Document", package_wording: dict, font_mgr, warnings: list, profile=None):
    """
    Keep the template's three package columns (entertainment, catering, event
    management, upgrade sidebar). Only replace the itinerary heading + four
    timing lines in the left column.
    """
    itinerary = _itinerary_group(package_wording)
    if not itinerary:
        return False

    page_bespoke = profile.page_bespoke if profile and profile.page_bespoke is not None else config.PAGE_BESPOKE_PACKAGE
    columns = profile.package_columns if profile and profile.package_columns else config.PACKAGE_COLUMNS
    col_cfg = next((c for c in columns if c["name"] == "venue_and_management"), columns[0])

    page13 = doc[page_bespoke]
    font_mgr.ensure_registered(page13)

    block = _find_itinerary_block(page13, col_cfg)
    if not block:
        warnings.append(
            type("ValidationWarning", (), {
                "field": "packageWording",
                "message": "Page 13 itinerary block not found — left template column unchanged.",
            })()
        )
        return False

    redact_zone(page13, block["bbox"], clear_graphics=False)
    flow_cfg = dict(
        col_cfg,
        top_y=block["top_y"],
        max_y=block["max_y"],
    )
    lines = _flatten_groups([itinerary], font_mgr, col_cfg["width"] - 6)
    overflow_index = _flow_lines(page13, flow_cfg, lines, font_mgr)
    if overflow_index is not None:
        warnings.append(
            type("ValidationWarning", (), {
                "field": "packageWording",
                "message": "Itinerary timings did not fit the template itinerary slot.",
            })()
        )
    return False


def _itinerary_group(package_wording: dict) -> dict | None:
    groups = package_wording.get("venue_and_management") or package_wording.get("itinerary") or []
    if isinstance(groups, dict):
        groups = [groups]
    for group in groups:
        heading = str(group.get("heading") or "")
        items = [str(i).strip() for i in (group.get("items") or []) if str(i).strip()]
        items = [i for i in items if not _SKIP_ITEM_RE.search(i)]
        if _HIRE_RE.search(heading) or any(_TIME_RE.search(i) for i in items):
            return {"heading": heading, "items": items}
    return None


def _find_itinerary_block(page, col_cfg) -> dict | None:
    col_right = float(col_cfg.get("x", 24)) + float(col_cfg.get("width", 100))
    rows = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = "".join(s.get("text", "") for s in line.get("spans", [])).strip()
            if not text:
                continue
            rect = fitz.Rect(line["bbox"])
            if rect.x0 > col_right or rect.y0 < 150 or rect.y0 > 270:
                continue
            origin_y = line["spans"][0]["origin"][1] if line.get("spans") else rect.y1 - 1.2
            rows.append((rect, text, origin_y))
    rows.sort(key=lambda r: r[0].y0)
    start = None
    end = None
    stop_y = None
    for i, (rect, text, _origin_y) in enumerate(rows):
        if _KEEP_RE.search(text):
            stop_y = rect.y0 - 1.0
            break
        if start is None and (_HIRE_RE.search(text) or _TIME_RE.search(text)):
            start = i
        if start is not None:
            end = i
    if start is None or end is None:
        return None
    union = rows[start][0]
    for rect, _text, _origin_y in rows[start : end + 1]:
        union |= rect
    union.x0 = min(union.x0, float(col_cfg.get("x", 24)) - 1)
    union.x1 = max(union.x1, col_right)
    union.y0 -= 1.2
    union.y1 += 1.2
    max_y = stop_y if stop_y is not None else union.y1
    return {"bbox": union, "top_y": rows[start][2], "max_y": max_y}


def apply_menu_links(doc: "fitz.Document", menu_links: dict, warnings: list, profile=None):
    """
    Attach / rewrite Page 13 menu and mood-board URIs.

    `menu_links` keys match MENU_LINK_TARGETS (food_menu, street_food_menu,
    mood_board). Values are absolute https URLs for the current season/year.
    """
    if not menu_links:
        return

    page_index = profile.page_bespoke if profile and profile.page_bespoke is not None else config.PAGE_BESPOKE_PACKAGE
    targets = profile.menu_link_targets if profile and profile.menu_link_targets else config.MENU_LINK_TARGETS
    page = doc[page_index]
    existing = list(page.get_links())

    for key, uri in menu_links.items():
        if not uri:
            continue
        target = targets.get(key)
        if not target:
            warnings.append(
                type("ValidationWarning", (), {"field": "menu_links", "message": (
                    f"Unknown menu link key '{key}'. Known: {list(targets)}"
                )})()
            )
            continue

        click = fitz.Rect(target["click_bbox"])
        for link in existing:
            link_rect = fitz.Rect(link.get("from"))
            if link_rect.intersects(click):
                try:
                    page.delete_link(link)
                except Exception:
                    pass

        page.insert_link({
            "kind": fitz.LINK_URI,
            "from": click,
            "uri": str(uri),
        })


def _flatten_groups(groups, font_mgr, width):
    lines = []
    for group in groups:
        heading = group.get("heading")
        if heading:
            wrapped_h = _wrap(font_mgr, heading, config.PACKAGE_TEXT_SIZE, False, width)
            for i, ln in enumerate(wrapped_h):
                lines.append(("heading" if i == 0 else "heading_cont", ln))
        for item_text in group.get("items", []):
            wrapped = _wrap(font_mgr, item_text, config.PACKAGE_TEXT_SIZE, False, width)
            for i, ln in enumerate(wrapped):
                lines.append(("item" if i == 0 else "item_cont", ln))
    return lines


def _flow_lines(page, col_cfg, lines, font_mgr, start_index=0):
    cursor_y = col_cfg["top_y"]
    fontname = font_mgr.font_name(False)
    fontfile = font_mgr.regular_path
    i = start_index
    while i < len(lines):
        # cursor_y is the baseline; allow drawing while baseline itself is in range
        if cursor_y > col_cfg["max_y"]:
            return i
        kind, text = lines[i]
        is_heading = kind in ("heading", "heading_cont")
        indent = 0 if is_heading else 7.4
        bullet_x = col_cfg["x"] + indent
        text_x = col_cfg["text_x"] + indent
        # Only the first line of a heading/item gets a bullet (matches template)
        if kind in ("heading", "item"):
            draw_text(page, (bullet_x, cursor_y), "\u2022", fontname, config.PACKAGE_TEXT_SIZE, fontfile=fontfile)
        draw_text(page, (text_x, cursor_y), text, fontname, config.PACKAGE_TEXT_SIZE, fontfile=fontfile)
        cursor_y += config.PACKAGE_ROW_PITCH
        i += 1
    return None


def _create_continuation_page(doc: "fitz.Document", page_bespoke=None, page_extras=None) -> "fitz.Page":
    """
    Insert a continuation page after Added Extras. Prefer a branded blank
    from assets/overflow_blank.pdf if present; otherwise a minimal header.
    """
    page_bespoke = page_bespoke if page_bespoke is not None else config.PAGE_BESPOKE_PACKAGE
    page_extras = page_extras if page_extras is not None else config.PAGE_ADDED_EXTRAS
    template_rect = doc[page_bespoke].rect
    insert_at = page_extras + 1

    branded = os_path_overflow()
    if branded:
        src = fitz.open(branded)
        try:
            doc.insert_pdf(src, from_page=0, to_page=0, start_at=insert_at)
            return doc[insert_at]
        finally:
            src.close()

    page = doc.new_page(insert_at, width=template_rect.width, height=template_rect.height)
    page.insert_text((22.7, 30), "YOUR BESPOKE PACKAGE (CONTINUED)", fontsize=14, color=(0.13, 0.13, 0.13))
    page.draw_line((22.7, 35), (template_rect.width - 22.7, 35), color=(0.94, 0.55, 0.2), width=1.2)
    return page


def os_path_overflow():
    import os
    path = os.path.join(config.BASE_DIR, "assets", "overflow_blank.pdf")
    return path if os.path.exists(path) else None


def _wrap(font_mgr, text: str, size: float, bold: bool, max_width: float):
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if font_mgr.text_length(trial, size, bold) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines
