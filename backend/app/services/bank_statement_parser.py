"""
Bank statement parser — CSV, OFX/QFX, and MT940.

Pure-Python (no third-party parser dependency). Returns a normalised list of:
    {date: datetime(UTC), description: str, reference: str|None,
     amount: float (signed: + = money in), balance: float|None}

MY/SG banks export OFX (DBS/OCBC/UOB) and MT940 (Maybank/CIMB) in addition to
CSV, so CSV-only meant most real customers had to reformat their exports.
"""
import csv
import io
import re
from datetime import datetime, timezone


SUPPORTED = ("csv", "ofx", "qfx", "mt940", "sta", "txt")


def parse_statement(content: bytes, filename: str) -> list[dict]:
    ext = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else "csv"
    if ext == "csv":
        return _parse_csv(content)
    if ext in ("ofx", "qfx"):
        return _parse_ofx(content)
    if ext in ("mt940", "sta", "txt"):
        return _parse_mt940(content)
    raise ValueError(f"Unsupported format: .{ext}. Supported: {', '.join(SUPPORTED)}")


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def _parse_amount(val) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("$", "").replace("£", "").replace("€", "").replace("RM", "")
    if not s:
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1]
        neg = True
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None


def _parse_date(val: str) -> datetime | None:
    val = (val or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y",
                "%Y/%m/%d", "%Y%m%d", "%d.%m.%Y", "%d/%m/%y", "%y%m%d"):
        try:
            return datetime.strptime(val, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ── CSV ────────────────────────────────────────────────────────────────────────

def _detect_columns(headers: list[str]) -> dict:
    lower = [h.strip().lower() for h in headers]
    mapping = {k: None for k in ("date", "description", "reference", "debit", "credit", "amount", "balance")}
    for i, h in enumerate(lower):
        if "date" in h and mapping["date"] is None:
            mapping["date"] = i
        elif h in ("description", "narrative", "details", "particulars", "memo", "transaction") and mapping["description"] is None:
            mapping["description"] = i
        elif h in ("ref", "reference", "check", "cheque", "check no", "cheque no") and mapping["reference"] is None:
            mapping["reference"] = i
        elif h in ("debit", "withdrawal", "withdrawals", "debit amount") and mapping["debit"] is None:
            mapping["debit"] = i
        elif h in ("credit", "deposit", "deposits", "credit amount") and mapping["credit"] is None:
            mapping["credit"] = i
        elif h in ("amount",) and mapping["amount"] is None:
            mapping["amount"] = i
        elif h in ("balance", "running balance", "closing balance") and mapping["balance"] is None:
            mapping["balance"] = i
    return mapping


def _parse_csv(content: bytes) -> list[dict]:
    text = _decode(content)
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2:
        raise ValueError("CSV file is empty or has no data rows")
    cm = _detect_columns(rows[0])
    if cm["date"] is None or cm["description"] is None:
        raise ValueError("Could not detect required columns (date, description)")
    if cm["amount"] is None and cm["debit"] is None and cm["credit"] is None:
        raise ValueError("Could not detect amount columns (amount, debit, or credit)")

    out = []
    for row in rows[1:]:
        if not row or all(c.strip() == "" for c in row):
            continue
        def cell(idx):
            return row[idx] if idx is not None and idx < len(row) else None
        date = _parse_date(cell(cm["date"]) or "")
        if not date:
            continue
        if cm["amount"] is not None:
            amount = _parse_amount(cell(cm["amount"]))
        else:
            debit = _parse_amount(cell(cm["debit"])) or 0
            credit = _parse_amount(cell(cm["credit"])) or 0
            amount = credit - debit
        if amount is None:
            continue
        out.append({
            "date": date,
            "description": (cell(cm["description"]) or "").strip(),
            "reference": (cell(cm["reference"]) or "").strip() or None,
            "amount": amount,
            "balance": _parse_amount(cell(cm["balance"])),
        })
    return out


# ── OFX / QFX ──────────────────────────────────────────────────────────────────

def _ofx_tag(block: str, tag: str) -> str | None:
    m = re.search(rf"<{tag}>([^<\r\n]*)", block, re.IGNORECASE)
    return m.group(1).strip() if m else None


def _parse_ofx(content: bytes) -> list[dict]:
    text = _decode(content)
    out = []
    for block in re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, re.DOTALL | re.IGNORECASE):
        dt_raw = _ofx_tag(block, "DTPOSTED")
        date = _parse_date(dt_raw[:8]) if dt_raw else None
        if not date:
            continue
        amt = _parse_amount(_ofx_tag(block, "TRNAMT"))
        if amt is None:
            continue
        name = _ofx_tag(block, "NAME") or ""
        memo = _ofx_tag(block, "MEMO") or ""
        desc = (name + (" " + memo if memo and memo != name else "")).strip()
        out.append({
            "date": date,
            "description": desc,
            "reference": _ofx_tag(block, "FITID"),
            "amount": amt,
            "balance": None,
        })
    if not out:
        raise ValueError("No transactions found in OFX file")
    return out


# ── MT940 ──────────────────────────────────────────────────────────────────────

def _parse_mt940(content: bytes) -> list[dict]:
    text = _decode(content)
    out = []
    # :61: statement line, optionally followed by :86: info line(s)
    lines = text.replace("\r\n", "\n").split("\n")
    i = 0
    pending = None
    for raw in lines:
        line = raw.strip()
        if line.startswith(":61:"):
            if pending:
                out.append(pending)
            body = line[4:]
            # value date YYMMDD
            m = re.match(r"(\d{6})(\d{4})?([CD])R?([\d,\.]+)", body)
            if not m:
                pending = None
                continue
            date = _parse_date(m.group(1))
            sign = -1 if m.group(3) == "D" else 1
            # MT940 uses a comma as the DECIMAL separator (e.g. 25,00 = 25.00)
            amount = _parse_amount(m.group(4).replace(",", "."))
            if date is None or amount is None:
                pending = None
                continue
            pending = {"date": date, "description": "", "reference": None,
                       "amount": sign * abs(amount), "balance": None}
        elif line.startswith(":86:") and pending is not None:
            pending["description"] = line[4:].strip()
        elif pending is not None and line and not line.startswith(":"):
            # continuation of :86:
            pending["description"] = (pending["description"] + " " + line).strip()
    if pending:
        out.append(pending)
    if not out:
        raise ValueError("No transactions found in MT940 file")
    return out
