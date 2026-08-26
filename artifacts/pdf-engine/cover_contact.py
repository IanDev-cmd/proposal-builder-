"""
cover_contact.py
----------------
Page 1 (cover) and contact/RM sign-off handlers, plus house-style formatters.
Uses batched redaction for speed and measured TemplateProfile geometry.
"""

from datetime import datetime
import logging
import re

import fitz

import config
from pdf_ops import prepare_field_draw, draw_fields_batched
from fonts import ValidationWarning

_log = logging.getLogger("weott.cover_contact")


def _parse_iso_datetime(raw: str):
    """Prefer ISO-8601 from the API. Returns datetime or None."""
    s = raw.strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        pass
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError:
        return None


_ORDINAL = {1: "st", 2: "nd", 3: "rd"}
# Cover second line lives on the template under Event date requested.
# Engine keeps this marker in the formatted string for flexible-date rules,
# then draws the calendar date only so the template line is not duplicated.
FLEX_DATE_TBC = "(Date TBC)"
_FLEX_TAIL_RE = re.compile(r"(?i)\s*\n\s*(\(\s*date\s*tbc\s*\)|\(\s*tbc\s*\)|tbc)\s*$")


def _ordinal(n: int) -> str:
    if 10 <= (n % 100) <= 20:
        return "th"
    return _ORDINAL.get(n % 10, "th")


def _is_flexible_event_date(raw: str, date_flexible: bool | None) -> bool:
    if date_flexible is True:
        return True
    if date_flexible is False:
        return False
    return bool(_FLEX_TAIL_RE.search(raw))


def format_event_date(value: str, *, date_flexible: bool | None = None) -> str:
    if value is None:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    # Pure TBC (no calendar date) → Date TBC
    if re.match(r"^(date\s*)?tbc$", raw, re.I):
        return "Date TBC"

    flexible = _is_flexible_event_date(raw, date_flexible)

    date_part = _FLEX_TAIL_RE.sub("", raw)
    date_part = re.sub(r"(?i)\s*\(date\s*tbc\)\s*", "", date_part)
    date_part = re.sub(r"(?i)\s*\(tbc\)\s*", "", date_part)
    date_part = re.sub(r"(?i)\s*\bflexible\b\s*", "", date_part).strip()
    # Bare trailing / standalone TBC left after stripping wrappers
    date_part = re.sub(r"(?i)\s*\btbc\b\s*$", "", date_part).strip()

    if not date_part or re.match(r"^(date\s*)?tbc$", date_part, re.I):
        return "Date TBC"

    iso = _parse_iso_datetime(date_part)
    if iso:
        formatted = f"{iso.strftime('%A')} {iso.day}{_ordinal(iso.day)} {iso.strftime('%B %Y')}"
    else:
        _log.info("event_date regex fallback for %r", date_part[:80])
        months = "January February March April May June July August September October November December"
        if any(m in date_part for m in months.split()) and re.search(r"\d", date_part):
            formatted = date_part
        else:
            formatted = date_part
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    dt = datetime.strptime(date_part[:10], fmt)
                    formatted = f"{dt.strftime('%A')} {dt.day}{_ordinal(dt.day)} {dt.strftime('%B %Y')}"
                    break
                except ValueError:
                    continue

    if flexible:
        return f"{formatted}\n{FLEX_DATE_TBC}"
    return formatted


def format_event_date_compact(value: str) -> str:
    """Shorter house style when the full weekday date won't fit the panel."""
    raw = format_event_date(value)
    if raw in ("", "TBC", "Date TBC"):
        return raw
    flexible = _FLEX_TAIL_RE.search(raw) is not None
    date_only = _FLEX_TAIL_RE.sub("", raw).strip()
    # Try parse back from house style or ISO
    source = str(value).strip().split("\n")[0]
    source = re.sub(r"(?i)\s*\(date\s*tbc\)\s*", "", source).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(source[:10], fmt)
            compact = f"{dt.strftime('%a')} {dt.day}{_ordinal(dt.day)} {dt.strftime('%b %Y')}"
            return f"{compact}\n{FLEX_DATE_TBC}" if flexible else compact
        except ValueError:
            continue
    # From already-formatted long date: Tuesday 14th July 2026 -> Tue 14th Jul 2026
    m = re.match(
        r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})(st|nd|rd|th)\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        date_only,
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
        compact = f"{day_map[m.group(1)]} {m.group(2)}{m.group(3)} {mon_map[m.group(4)]} {m.group(5)}"
        return f"{compact}\n{FLEX_DATE_TBC}" if flexible else compact
    return raw


def format_event_timings(value: str, *, include_tbc: bool = True, departure: str | None = None, return_time: str | None = None) -> str:
    if value is None:
        value = ""
    raw = str(value).strip()
    start = _norm_hhmm(departure)
    end = _norm_hhmm(return_time)
    if start and end:
        out = f"{start}hrs – {end}hrs"
    else:
        times = re.findall(r"(\d{1,2}:\d{2})", raw)
        if len(times) >= 2:
            out = f"{_norm_hhmm(times[0])}hrs – {_norm_hhmm(times[1])}hrs"
        else:
            out = raw.replace("-", "–").replace(" - ", " – ")
            out = re.sub(r"(\d{1,2}:\d{2})(?!\s*hrs)", r"\1hrs", out)
    has_tbc = bool(re.search(r"\(?\s*TBC\s*\)?", raw, re.I))
    if include_tbc and has_tbc and "(TBC)" not in out:
        out = f"{out} (TBC)"
    return out


def _norm_hhmm(value) -> str:
    m = re.match(r"^\s*(\d{1,2}):(\d{2})", str(value or ""))
    if not m:
        return ""
    return f"{int(m.group(1)):02d}:{m.group(2)}"


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


def _ellipsis_to_width(value: str, font_mgr, max_width: float, base_size: float) -> str:
    """Keep one cover line at designed size — ellipsis rather than clipping mid-glyph."""
    raw = " ".join(str(value or "").split())
    if not raw or font_mgr.text_length(raw, base_size, False) <= max_width:
        return raw
    ell = "…"
    cut = raw
    while cut and font_mgr.text_length(cut + ell, base_size, False) > max_width:
        cut = cut[:-1]
    return (cut + ell) if cut else raw[:40]


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
        s = first
    if " / " in s:
        first = s.split(" / ", 1)[0].strip()
        if font_mgr.text_length(first, base_size, False) <= max_width:
            return first
        s = first
    return _ellipsis_to_width(s, font_mgr, max_width, base_size)


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


_PHONE_PLACEHOLDERS = {"", "—", "-", "–", "n/a", "na", "none", "tbc"}
_PHONE_LABEL_RE = re.compile(r"^\s*(?:t|m|tel|mob(?:ile)?|phone)\s*[:.\-]?\s*", re.I)
_LABELED_PHONE_RE = re.compile(
    r"(?:^|[\s,;/|])(?:(tel|t)|(mobile|mob|m))\s*[:.\-]?\s*([\d+()\s.-]{7,})",
    re.I,
)


def strip_phone_label(raw: str) -> str:
    return _PHONE_LABEL_RE.sub("", str(raw or "")).strip()


def _phone_digits(raw: str) -> str:
    d = re.sub(r"\D", "", str(raw or ""))
    if d.startswith("44") and len(d) > 10:
        d = d[2:]
    if d and not d.startswith("0") and len(d) == 10:
        d = "0" + d
    return d


def format_uk_phone(raw) -> str:
    """House-style UK number. Never includes T: / M: labels."""
    s = str(raw or "").strip()
    if not s:
        return ""
    if s.lower() in _PHONE_PLACEHOLDERS:
        return "—" if s == "—" else ""
    stripped = strip_phone_label(s)
    if stripped.lower() in _PHONE_PLACEHOLDERS:
        return "—" if stripped == "—" else ""
    d = _phone_digits(stripped)
    if len(d) != 11:
        return stripped
    if d.startswith("02"):
        return f"{d[:3]} {d[3:7]} {d[7:]}"
    if d.startswith(("07", "03")):
        return f"{d[:5]} {d[5:8]} {d[8:]}"
    if d.startswith("08"):
        return f"{d[:4]} {d[4:7]} {d[7:]}"
    if d.startswith("01"):
        if d[1:3] in ("11", "21", "31", "41", "51", "61", "71", "81", "91"):
            return f"{d[:4]} {d[4:7]} {d[7:]}"
        return f"{d[:5]} {d[5:8]} {d[8:]}"
    return f"{d[:5]} {d[5:8]} {d[8:]}"


def parse_phone_fields(raw) -> dict:
    """Split CRM blobs such as 'T: 03309 005 500 M: 07407 780 281'."""
    text = str(raw or "").strip()
    if not text:
        return {"landline": "", "mobile": "", "display": "", "telephone": ""}
    if text == "—":
        return {"landline": "", "mobile": "", "display": "—", "telephone": "—"}

    landline = ""
    mobile = ""
    extras = []
    for match in _LABELED_PHONE_RE.finditer(text):
        formatted = format_uk_phone(match.group(3))
        if match.group(1):
            landline = landline or formatted
        elif match.group(2):
            mobile = mobile or formatted

    remainder = _LABELED_PHONE_RE.sub(" ", text)
    remainder = re.sub(r"\b(?:t|m|tel|mob(?:ile)?|phone)\s*[:.\-]?\s*", " ", remainder, flags=re.I)
    for part in re.split(r"\s*(?:[/|,;]|\band\b)\s*", remainder, flags=re.I):
        if re.search(r"\d", part or ""):
            formatted = format_uk_phone(part)
            if formatted and formatted not in extras:
                extras.append(formatted)

    def _kind(formatted: str) -> str:
        d = _phone_digits(formatted)
        if d.startswith("07"):
            return "mobile"
        if len(d) >= 10:
            return "landline"
        return ""

    if not landline and not mobile and not extras:
        one = format_uk_phone(text)
        if _kind(one) == "mobile":
            mobile = one
        else:
            landline = one
    else:
        for extra in extras:
            kind = _kind(extra)
            if kind == "mobile" and not mobile:
                mobile = extra
            elif not landline:
                landline = extra
            elif not mobile:
                mobile = extra

    display = " / ".join(p for p in (landline, mobile) if p)
    return {
        "landline": landline,
        "mobile": mobile,
        "display": display,
        "telephone": landline or mobile,
    }


_STAFF_FULL_NAMES = {
    "natasha": "Natasha Minter",
    "katherine": "Katherine Bulaon",
    "sapphire": "Sapphire Adams",
    "elizabeth": "Elizabeth Hillier",
    "ellie": "Ellie Kirotar",
    "lily-may": "Lily-May Cameron",
    "lily may": "Lily-May Cameron",
}


def format_prepared_by_name(lead: dict) -> str:
    """REP name with surname — gold keeps '| Client' + role on the template lines."""
    raw = str(lead.get("prepared_by") or "").strip()
    if not raw:
        return ""
    raw = re.sub(r"^\s*prepared\s+by\s+", "", raw, flags=re.I).strip()
    if "|" in raw:
        raw = raw.split("|", 1)[0].strip()
    raw = " ".join(raw.split())
    key = raw.lower()
    if key in _STAFF_FULL_NAMES:
        return _STAFF_FULL_NAMES[key]
    first = key.split()[0] if key else ""
    if first in _STAFF_FULL_NAMES and " " not in raw:
        return _STAFF_FULL_NAMES[first]
    return raw


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
        out["event_date"] = format_event_date(
            out["event_date"],
            date_flexible=lead.get("date_flexible"),
        )
    if "event_timings" in out:
        original = str(lead.get("event_timings", ""))
        formatted = format_event_timings(
            original,
            include_tbc=False,
            departure=lead.get("departure") or lead.get("event_start"),
            return_time=lead.get("returnTime") or lead.get("return_time") or lead.get("event_end"),
        )
        if re.search(r"TBC", original, re.I) and "(TBC)" not in formatted:
            formatted = f"{formatted} (TBC)"
        out["event_timings"] = formatted
    if "quote_date" in out:
        out["quote_date"] = format_quote_date(out["quote_date"])
    if "telephone" in out:
        parsed = parse_phone_fields(out.get("telephone"))
        out["telephone"] = parsed["display"] or parsed["telephone"]
    if "contact_phone" in out:
        parsed = parse_phone_fields(out.get("contact_phone"))
        out["contact_phone"] = parsed["landline"] or parsed["telephone"]
        if parsed["mobile"] and not out.get("contact_mobile"):
            out["contact_mobile"] = parsed["mobile"]
    if "contact_mobile" in out:
        parsed = parse_phone_fields(out.get("contact_mobile"))
        out["contact_mobile"] = parsed["mobile"] or parsed["telephone"]
    if "guest_range" in out:
        out["guest_range"] = format_guest_range(out["guest_range"])
    if "guest_quote_n" in out:
        out["guest_quote_n"] = str(out["guest_quote_n"]).strip()
    if out.get("key_items"):
        out["key_items"] = " ".join(str(out["key_items"]).split())
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
    if field_name == "key_items":
        return _ellipsis_to_width(value, font_mgr, max_w, base_size)
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
    max_w = float(spec.get("max_width") or 120)
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

    # Draw the divider as its own run so surnames cannot clip the dash.

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

    role_origin = spec.get("role_origin") or (spec.get("label_x0", x0), y + 7.0)
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


def _snap_quote_date_spec(spec: dict) -> dict:
    """Keep the full template day number (e.g. leftover '27') inside the redact box."""
    spec = dict(spec)
    bbox = list(spec.get("bbox") or (227.3, 67.1, 268.0, 73.7))
    origin = list(spec.get("origin") or (227.3, 72.3))
    bbox[0] = min(float(bbox[0]), 227.3)
    bbox[2] = max(float(bbox[2]), 268.0)
    origin[0] = min(float(origin[0]), 227.3)
    spec["bbox"] = tuple(bbox)
    spec["origin"] = tuple(origin)
    spec["max_width"] = max(float(spec.get("max_width") or 0), bbox[2] - bbox[0])
    return spec


def _cover_slot_is_location(page, spec: dict) -> bool:
    bbox = spec.get("bbox") or (385.6, 152.0, 470, 168.0)
    probe = fitz.Rect(350, float(bbox[1]) - 8, float(bbox[0]) + 8, float(bbox[3]) + 8)
    clip = page.get_text("text", clip=probe) or ""
    return bool(re.search(r"Location\s*\|", clip, re.I))


def fill_cover_page(doc, data: dict, font_mgr, warnings: list, profile=None):
    page_index = profile.page_cover if profile else config.PAGE_COVER
    fields = dict(profile.cover_fields) if profile and profile.cover_fields else dict(config.COVER_FIELDS)
    if "key_items" not in fields and config.COVER_FIELDS.get("key_items"):
        fields["key_items"] = dict(config.COVER_FIELDS["key_items"])
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
        if field_name == "key_items" and _cover_slot_is_location(page, spec):
            continue
        spec = dict(spec)
        if field_name == "quote_date":
            spec = _snap_quote_date_spec(spec)
        value = str(data[field_name])
        value = _fit_cover_value(field_name, value, spec, font_mgr)
        if field_name == "event_date":
            flexible = bool(data.get("date_flexible"))
            if "\n" in value:
                parts = value.split("\n", 1)
                value = parts[0].strip()
                flexible = flexible or bool(re.search(r"tbc", parts[1], re.I))
            max_w = spec.get("max_width", 56)
            measure_src = value
            if font_mgr.text_length(measure_src, spec["size"], spec.get("bold", False)) > max_w:
                compact = format_event_date_compact(data[field_name])
                if "\n" in compact:
                    cparts = compact.split("\n", 1)
                    value = cparts[0].strip()
                    flexible = True
                else:
                    value = compact
            # Flexible: leave the template "(Date TBC)" under Event date requested.
            # Fixed: wipe that template line so it does not stay on a confirmed date.
            if not flexible:
                x0, y0 = spec["origin"]
                bbox = list(spec["bbox"])
                bbox[3] = max(float(bbox[3]), float(y0) + 7.5)
                spec["bbox"] = tuple(bbox)
                spec["max_width"] = max(float(spec.get("max_width") or 0), bbox[2] - bbox[0])
        # Page 1 must stay pixel-perfect with the chosen template: measured
        # span colour + Century Gothic only. Page-13 pure-white / Fallback-Bold
        # styling must not leak onto the cover.
        spec = dict(spec)
        if field_name == "key_items":
            spec["color"] = config.TEXT_COLOR
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


def fill_contact_page(doc, data: dict, font_mgr, warnings: list, profile=None, page_shift: int = 0):
    fields = profile.contact_fields if profile and profile.contact_fields else config.CONTACT_FIELDS
    # Group by page for batched apply
    by_page: dict[int, list] = {}
    shift = int(page_shift or 0)
    for field_name, spec in fields.items():
        if field_name not in data or not spec:
            continue
        page_i = int(spec.get("page", profile.page_contact if profile else config.PAGE_CONTACT)) + shift
        if page_i < 0 or page_i >= doc.page_count:
            warnings.append(
                type(
                    "ValidationWarning",
                    (),
                    {
                        "field": field_name,
                        "message": f"Contact page index {page_i} out of range after overflow shift {shift}",
                    },
                )()
            )
            continue
        value = str(data[field_name])
        if field_name == "contact_email":
            value = re.sub(r"^\s*E:\s*", "", value, flags=re.I)
        elif field_name == "contact_phone":
            parsed = parse_phone_fields(value)
            value = parsed["landline"] or parsed["telephone"]
        elif field_name == "contact_mobile":
            parsed = parse_phone_fields(value)
            value = parsed["mobile"] or parsed["telephone"]
        page = doc[page_i]
        font_mgr.ensure_registered(page)
        item = prepare_field_draw(spec, value, font_mgr, warnings, field_name)
        by_page.setdefault(page_i, []).append(item)

    for page_i, items in by_page.items():
        draw_fields_batched(doc[page_i], items, font_mgr, clear_graphics=False)
