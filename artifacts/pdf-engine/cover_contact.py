"""
cover_contact.py
----------------
Page 1 (cover) and contact/RM sign-off handlers, plus house-style formatters.
Uses batched redaction for speed and measured TemplateProfile geometry.
"""

from datetime import datetime
import re

import config
from pdf_ops import prepare_field_draw, draw_fields_batched
from fonts import ValidationWarning


_ORDINAL = {1: "st", 2: "nd", 3: "rd"}


def _ordinal(n: int) -> str:
    if 10 <= (n % 100) <= 20:
        return "th"
    return _ORDINAL.get(n % 10, "th")


def format_event_date(value: str) -> str:
    if value is None:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    # Flexible / TBC dates from Enquiry → show Date TBC on the proposal
    if re.search(r"\b(tbc|flexible|date\s*tbc)\b", raw, re.I) or raw.upper() == "TBC":
        return "Date TBC"
    months = "January February March April May June July August September October November December"
    if any(m in raw for m in months.split()) and re.search(r"\d", raw):
        return raw
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(raw[:10], fmt)
            return f"{dt.strftime('%A')} {dt.day}{_ordinal(dt.day)} {dt.strftime('%B %Y')}"
        except ValueError:
            continue
    return raw


def format_event_date_compact(value: str) -> str:
    """Shorter house style when the full weekday date won't fit the panel."""
    raw = format_event_date(value)
    if raw in ("", "TBC", "Date TBC"):
        return raw
    # Try parse back from house style or ISO
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(str(value).strip()[:10], fmt)
            return f"{dt.strftime('%a')} {dt.day}{_ordinal(dt.day)} {dt.strftime('%b %Y')}"
        except ValueError:
            continue
    # From already-formatted long date: Tuesday 14th July 2026 -> Tue 14th Jul 2026
    m = re.match(
        r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})(st|nd|rd|th)\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        raw,
    )
    if m:
        day_map = {
            "Monday": "Mon", "Tuesday": "Tue", "Wednesday": "Wed", "Thursday": "Thu",
            "Friday": "Fri", "Saturday": "Sat", "Sunday": "Sun",
        }
        mon_map = {
            "January": "Jan", "February": "Feb", "March": "Mar", "April": "Apr",
            "May": "May", "June": "Jun", "July": "Jul", "August": "Aug",
            "September": "Sep", "October": "Oct", "November": "Nov", "December": "Dec",
        }
        return f"{day_map[m.group(1)]} {m.group(2)}{m.group(3)} {mon_map[m.group(4)]} {m.group(5)}"
    return raw


def format_event_timings(value: str, *, include_tbc: bool = True) -> str:
    if value is None:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    times = re.findall(r"(\d{1,2}:\d{2})", raw)
    if len(times) >= 2:
        def norm(t):
            h, m = t.split(":")
            return f"{int(h):02d}:{m}"
        out = f"{norm(times[0])}hrs – {norm(times[1])}hrs"
    else:
        out = raw.replace("-", "–").replace(" - ", " – ")
        out = re.sub(r"(\d{1,2}:\d{2})(?!\s*hrs)", r"\1hrs", out)
    has_tbc = bool(re.search(r"\(?\s*TBC\s*\)?", raw, re.I))
    if has_tbc and "(TBC)" not in out:
        out = f"{out} (TBC)"
    return out


def format_quote_date(value: str) -> str:
    if value is None:
        return ""
    raw = str(value).strip()
    raw = re.split(r"\s*\|\s*Quotation valid", raw, maxsplit=1)[0].strip()
    months = "January February March April May June July August September October November December"
    if any(m in raw for m in months.split()):
        return raw
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            dt = datetime.strptime(raw[:10], fmt)
            return f"{dt.day} {dt.strftime('%B %Y')}"
        except ValueError:
            continue
    return raw


def format_guest_range(value) -> str:
    if value is None:
        return ""
    raw = str(value).strip()
    m = re.match(r"(\d+)\s*[-–—to]+\s*(\d+)", raw, re.I)
    if m:
        return f"{m.group(1)} \u2013 {m.group(2)}"
    return raw


def format_organisation(value: str, *, font_mgr=None, max_width: float | None = None, base_size: float = 4.63) -> str:
    """House-style abbreviations so long company names stay at template point size."""
    s = str(value or "").strip()
    if not s:
        return s
    s = re.sub(r"\bLimited\b", "Ltd", s, flags=re.I)
    s = re.sub(r"\bIncorporated\b", "Inc", s, flags=re.I)
    s = re.sub(r"\s*\(\s*T/A\s+", " (t/a ", s, flags=re.I)
    if font_mgr is not None and max_width:
        bold = False
        while font_mgr.text_length(s, base_size, bold) > max_width:
            if re.search(r"\([^)]+\)", s):
                s = re.sub(r"\s*\([^)]*\)\s*", "", s).strip()
                continue
            if " / " in s:
                s = s.split(" / ", 1)[0].strip()
                continue
            break
    return s


def format_event_type(value: str, *, font_mgr=None, max_width: float | None = None, base_size: float = 4.63) -> str:
    """Long catalogue event names must not shrink on the cover panel."""
    s = str(value or "").strip()
    if not s or font_mgr is None or not max_width:
        return s
    if font_mgr.text_length(s, base_size, False) <= max_width:
        return s
    if " or " in s:
        first = s.split(" or ", 1)[0].strip()
        if font_mgr.text_length(first, base_size, False) <= max_width:
            return first
    if " / " in s:
        first = s.split(" / ", 1)[0].strip()
        if font_mgr.text_length(first, base_size, False) <= max_width:
            return first
    return s


def format_cover_email(value: str, *, font_mgr=None, max_width: float | None = None, base_size: float = 4.63) -> str:
    """Dual emails: keep first address if pair won't fit at designed size."""
    s = str(value or "").strip()
    if not s or font_mgr is None or not max_width:
        return s
    if font_mgr.text_length(s, base_size, False) <= max_width:
        return s
    if " / " in s:
        first = s.split(" / ", 1)[0].strip()
        if font_mgr.text_length(first, base_size, False) <= max_width:
            return first
    return s


def format_prepared_by_name(lead: dict) -> str:
    """REP name only — gold keeps '| Client' + role on the template lines."""
    raw = str(lead.get("prepared_by") or "").strip()
    if not raw:
        return ""
    raw = re.sub(r"^\s*prepared\s+by\s+", "", raw, flags=re.I).strip()
    if "|" in raw:
        raw = raw.split("|", 1)[0].strip()
    return " ".join(raw.split())


def format_prepared_by_role(lead: dict) -> str:
    """
    Second cover line under Prepared by (regular weight), matching gold:
    'Relationship Manager' / 'Relationship Coordinator'.
    """
    title = str(lead.get("contact_title") or "").strip()
    if not title:
        raw = str(lead.get("prepared_by") or "")
        if "|" in raw:
            title = raw.split("|", 1)[1].strip()
    if not title:
        title = "Client Relationship Manager"
    title = re.sub(r"^\s*prepared\s+by\s+", "", title, flags=re.I).strip()
    # Gold drops the leading 'Client ' — that stays on line 1 after the pipe.
    title = re.sub(r"^\s*client\s+", "", title, flags=re.I).strip()
    return " ".join(title.split()) or "Relationship Manager"


def format_prepared_by(lead: dict) -> str:
    """Back-compat: name only for cover prepared_by field."""
    return format_prepared_by_name(lead)


def normalize_cover_lead(lead: dict) -> dict:
    out = dict(lead)
    if "prepared_by" in out or lead.get("contact_title"):
        if "prepared_by" in out or lead.get("prepared_by"):
            out["prepared_by"] = format_prepared_by_name(out if "prepared_by" in out else lead)
        out["prepared_by_role"] = format_prepared_by_role(out)
    if "event_date" in out:
        out["event_date"] = format_event_date(out["event_date"])
    if "event_timings" in out:
        original = str(lead.get("event_timings", ""))
        formatted = format_event_timings(original, include_tbc=False)
        if re.search(r"TBC", original, re.I) and "(TBC)" not in formatted:
            formatted = f"{formatted} (TBC)"
        out["event_timings"] = formatted
    if "quote_date" in out:
        out["quote_date"] = format_quote_date(out["quote_date"])
    if "guest_range" in out:
        out["guest_range"] = format_guest_range(out["guest_range"])
    if "guest_quote_n" in out:
        out["guest_quote_n"] = str(out["guest_quote_n"]).strip()
    return out


def _fit_cover_value(field_name: str, value: str, spec: dict, font_mgr) -> str:
    """Apply compact formatters before draw so cover stays at template point size."""
    base_size = spec.get("size", 4.63)
    max_w = spec.get("max_width", 56)
    if field_name == "organisation":
        return format_organisation(value, font_mgr=font_mgr, max_width=max_w, base_size=base_size)
    if field_name == "email":
        return format_cover_email(value, font_mgr=font_mgr, max_width=max_w, base_size=base_size)
    if field_name == "event_type":
        return format_event_type(value, font_mgr=font_mgr, max_width=max_w, base_size=base_size)
    if field_name == "client_name" and " / " in value:
        parts = [p.strip() for p in value.split(" / ") if p.strip()]
        if len(parts) == 2 and font_mgr.text_length(value, base_size, False) > max_w:
            shorter = f"{parts[0]} & {parts[1]}"
            if font_mgr.text_length(shorter, base_size, False) <= max_w:
                return shorter
    return value


def _prepare_gold_prepared_by(spec: dict, data: dict, font_mgr, warnings: list) -> list:
    """
    Match gold PDF typography:
      Prepared by {NAME} | Client     <- name+pipe bold (deep_bold), Client regular
      Relationship Coordinator        <- regular, second line
    """
    color = _cover_ink_from_template(spec.get("color"))
    size = float(spec.get("size") or 4.63)
    name = format_prepared_by_name(data)
    role = format_prepared_by_role(data)
    if not name:
        return []

    x0, y = spec["origin"]
    max_w = float(spec.get("max_width") or 80)
    client = " Client"
    pipe = " |"

    # Fit name so "NAME | Client" stays on line 1 at designed size when possible.
    def line1_width(sz):
        return (
            font_mgr.text_length(name, sz, False)
            + font_mgr.text_length(pipe, sz, False)
            + font_mgr.text_length(client, sz, False)
        )

    draw_size = size
    while draw_size > 2.8 and line1_width(draw_size) > max_w:
        draw_size = round(draw_size - 0.1, 1)
    if draw_size < size * 0.72:
        warnings.append(
            ValidationWarning(
                field="prepared_by",
                message=f"prepared_by shrunk from {size}pt to {draw_size}pt to fit gold line-1 layout.",
            )
        )

    items = []
    # Primary redact covers name + Client + role line.
    bold_spec = dict(
        bbox=spec["bbox"],
        origin=(x0, y),
        size=draw_size,
        bold=False,
        deep_bold=True,
        color=color,
        max_width=max_w,
        extra_redacts=list(spec.get("extra_redacts") or []),
    )
    items.append(prepare_field_draw(bold_spec, f"{name}{pipe}", font_mgr, warnings, "prepared_by"))

    name_w = font_mgr.text_length(name, draw_size, False)
    pipe_w = font_mgr.text_length(pipe, draw_size, False)
    client_x = x0 + name_w + pipe_w
    client_spec = dict(
        bbox=spec["bbox"],  # already redacted via first item
        origin=(client_x, y),
        size=draw_size,
        bold=False,
        deep_bold=False,
        color=color,
        max_width=max(max_w - (client_x - x0), 8.0),
        skip_redact=True,
    )
    items.append(prepare_field_draw(client_spec, client, font_mgr, warnings, "prepared_by_client"))

    role_origin = spec.get("role_origin") or (spec.get("label_x0", x0), y + 9.5)
    role_bbox = spec.get("role_bbox") or spec["bbox"]
    role_spec = dict(
        bbox=role_bbox,
        origin=role_origin,
        size=size,  # role stays at template size (gold 4.63)
        bold=False,
        deep_bold=False,
        color=color,
        max_width=max(float(role_bbox[2]) - float(role_bbox[0]), 20.0),
        skip_redact=True,
    )
    items.append(prepare_field_draw(role_spec, role, font_mgr, warnings, "prepared_by_role"))
    return items


def fill_cover_page(doc, data: dict, font_mgr, warnings: list, profile=None):
    page_index = profile.page_cover if profile else config.PAGE_COVER
    fields = profile.cover_fields if profile and profile.cover_fields else config.COVER_FIELDS
    page = doc[page_index]
    font_mgr.ensure_registered(page)
    data = normalize_cover_lead(data)

    prepared = []
    for field_name, spec in fields.items():
        if not spec:
            continue
        if field_name == "prepared_by" and spec.get("layout") == "gold_prepared_by":
            if not data.get("prepared_by"):
                continue
            prepared.extend(_prepare_gold_prepared_by(dict(spec), data, font_mgr, warnings))
            continue
        if field_name not in data:
            continue
        value = str(data[field_name])
        value = _fit_cover_value(field_name, value, spec, font_mgr)
        # If event_date won't fit at designed size, use compact form before shrink
        if field_name == "event_date":
            max_w = spec.get("max_width", 56)
            if font_mgr.text_length(value, spec["size"], spec.get("bold", False)) > max_w:
                value = format_event_date_compact(data[field_name])
        # Page 1 must stay pixel-perfect with the chosen template: measured
        # span colour + Century Gothic only. Page-13 pure-white / Fallback-Bold
        # styling must not leak onto the cover.
        spec = dict(spec)
        spec["color"] = _cover_ink_from_template(spec.get("color"))
        # Keep brand CG on cover even for "bold" fields (template-extracted CG
        # Bold subsets can't re-embed; Fallback Bold reads as a different face).
        want_weight = bool(spec.get("bold"))
        spec["bold"] = False
        spec["deep_bold"] = want_weight  # light echo approximates template bold
        prepared.append(prepare_field_draw(spec, value, font_mgr, warnings, field_name))

    draw_fields_batched(page, prepared, font_mgr, clear_graphics=False)


def _cover_ink_from_template(color) -> tuple:
    """
    Cover panel ink must match the template / gold PDFs.

    Wedding/corporate cover panels use dark gray RGB(50,50,50) on the frosted
    boxes — not Page-13 pure white and not the older near-white COVER_TEXT_COLOR.
    """
    if color and isinstance(color, (tuple, list)) and len(color) >= 3:
        return (float(color[0]), float(color[1]), float(color[2]))
    return (50 / 255, 50 / 255, 50 / 255)


def fill_contact_page(doc, data: dict, font_mgr, warnings: list, profile=None):
    fields = profile.contact_fields if profile and profile.contact_fields else config.CONTACT_FIELDS
    # Group by page for batched apply
    by_page: dict[int, list] = {}
    for field_name, spec in fields.items():
        if field_name not in data or not spec:
            continue
        page_i = spec.get("page", profile.page_contact if profile else config.PAGE_CONTACT)
        value = str(data[field_name])
        if field_name == "contact_email":
            value = re.sub(r"^\s*E:\s*", "", value, flags=re.I)
        page = doc[page_i]
        font_mgr.ensure_registered(page)
        item = prepare_field_draw(spec, value, font_mgr, warnings, field_name)
        by_page.setdefault(page_i, []).append(item)

    for page_i, items in by_page.items():
        draw_fields_batched(doc[page_i], items, font_mgr, clear_graphics=False)
