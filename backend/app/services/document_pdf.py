"""
Shared PDF rendering for every sales/purchase document (quotation, sales order,
DO, CN/DN, receipt, PO, GRN, purchase CN/DN) plus contact statements.

Generalized from invoice_pdf.py — same A4 layout: org header + document title,
contact block, line-item table, totals, notes, DRAFT/VOID watermark. Invoices
keep their own renderer (render_invoice_pdf) untouched.
"""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as _canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _money(v, currency="MYR"):
    return f"{currency} {float(v or 0):,.2f}"


def _watermark(text):
    def draw(canvas: _canvas.Canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 80)
        canvas.setFillColor(colors.Color(0.9, 0.9, 0.9))
        canvas.translate(A4[0] / 2, A4[1] / 2)
        canvas.rotate(45)
        canvas.drawCentredString(0, 0, text)
        canvas.restoreState()
    return draw


def render_document_pdf(
    *,
    title: str,
    number: str,
    org,
    contact,
    meta_rows: list[str],
    line_rows: list[list[str]],
    totals_rows: list[tuple[str, str]],
    notes: str | None = None,
    status: str | None = None,
    contact_label: str = "BILL TO",
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=11)
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=18, spaceAfter=2)
    label = ParagraphStyle("label", parent=small, textColor=colors.grey)

    elements = []
    header_tbl = Table([[
        Paragraph(f"<b>{getattr(org, 'name', '') or ''}</b>", styles["Heading2"]),
        Paragraph(title, h1),
    ]], colWidths=[100 * mm, 70 * mm])
    header_tbl.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 6 * mm))

    left = [Paragraph(contact_label, label)]
    if contact is not None:
        left.append(Paragraph(f"<b>{getattr(contact, 'name', '') or ''}</b>", small))
        if getattr(contact, "email", None):
            left.append(Paragraph(contact.email, small))
        if getattr(contact, "billing_address_line1", None):
            left.append(Paragraph(contact.billing_address_line1, small))
    right = [Paragraph(f"{title.title()} #: <b>{number}</b>", small)]
    right += [Paragraph(m, small) for m in meta_rows]
    sst = getattr(org, "sst_registration_no", None)
    if sst:
        right.append(Paragraph(f"SST No: {sst}", small))
    meta_tbl = Table([[left, right]], colWidths=[100 * mm, 70 * mm])
    meta_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(meta_tbl)
    elements.append(Spacer(1, 8 * mm))

    if line_rows:
        tbl = Table(line_rows, colWidths=[10 * mm, 78 * mm, 16 * mm, 24 * mm, 16 * mm, 26 * mm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4D63FF")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F6FF")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(tbl)
        elements.append(Spacer(1, 6 * mm))

    if totals_rows:
        tot_tbl = Table(totals_rows, colWidths=[40 * mm, 36 * mm], hAlign="RIGHT")
        style = [
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ]
        if len(totals_rows) >= 2:
            style += [
                ("LINEABOVE", (0, len(totals_rows) - 1), (-1, len(totals_rows) - 1), 1, colors.black),
                ("FONTNAME", (0, len(totals_rows) - 1), (-1, len(totals_rows) - 1), "Helvetica-Bold"),
            ]
        tot_tbl.setStyle(TableStyle(style))
        elements.append(tot_tbl)

    if notes:
        elements.append(Spacer(1, 8 * mm))
        elements.append(Paragraph("Notes", label))
        elements.append(Paragraph(str(notes), small))

    on_page = None
    if (status or "").lower() in ("draft", "void", "cancelled"):
        on_page = _watermark(status.upper())
    if on_page:
        doc.build(elements, onFirstPage=on_page, onLaterPages=on_page)
    else:
        doc.build(elements)
    return buf.getvalue()


def standard_line_rows(line_items, qty_attr: str = "quantity") -> list[list[str]]:
    """Header + one row per line: #, description, qty, unit price, tax %, amount."""
    def g(li, key, default=None):
        return li.get(key, default) if isinstance(li, dict) else getattr(li, key, default)

    rows = [["#", "Description", "Qty", "Unit Price", "Tax %", "Amount"]]
    for i, li in enumerate(line_items, 1):
        qty = float(g(li, qty_attr, 0) or 0)
        unit = float(g(li, "unit_price", 0) or 0)
        amount = g(li, "amount", None)
        amount = float(amount) if amount is not None else round(qty * unit, 2)
        rows.append([
            str(i),
            str(g(li, "description", "") or ""),
            f"{qty:g}",
            f"{unit:,.2f}",
            f"{float(g(li, 'tax_rate', 0) or 0):g}",
            f"{amount:,.2f}",
        ])
    return rows


def standard_totals(doc, currency: str) -> list[tuple[str, str]]:
    rows = []
    subtotal = getattr(doc, "subtotal", None)
    tax = getattr(doc, "tax_amount", None)
    total = getattr(doc, "total", None)
    if subtotal is not None:
        rows.append(["Subtotal", _money(subtotal, currency)])
    if tax is not None:
        rows.append(["Tax", _money(tax, currency)])
    if total is not None:
        rows.append(["Total", _money(total, currency)])
    return rows


def render_statement_pdf(org, contact, start_date: str, end_date: str, events: list[dict], closing: float, currency: str = "MYR") -> bytes:
    """Customer/supplier statement of account from the contact-statement report."""
    rows = [["Date", "Type", "Ref", "Amount", "Balance"]]
    for ev in events:
        rows.append([
            (ev.get("date") or "")[:10],
            str(ev.get("type") or ""),
            str(ev.get("ref") or ev.get("number") or ""),
            f"{float(ev.get('amount') or ev.get('delta') or 0):,.2f}",
            f"{float(ev.get('balance') or 0):,.2f}",
        ])
    buf_rows = [["#", "", "", "", ""]]  # placeholder unused
    return render_document_pdf(
        title="STATEMENT",
        number=f"{start_date} to {end_date}",
        org=org, contact=contact,
        meta_rows=[f"Period: {start_date} — {end_date}"],
        line_rows=rows,
        totals_rows=[["Closing Balance", _money(closing, currency)]],
        notes=None, status=None, contact_label="STATEMENT FOR",
    )
