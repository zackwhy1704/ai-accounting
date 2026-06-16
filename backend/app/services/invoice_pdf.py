"""
Invoice PDF generation using reportlab (no system deps like weasyprint).

render_invoice_pdf(invoice, org, contact, line_items) -> bytes
Produces an SST/GST-style A4 invoice: header with org + invoice meta, bill-to,
a line-item table, and a totals block. A DRAFT/VOID watermark is drawn for those
statuses.
"""
import io
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas as _canvas


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


def render_invoice_pdf(invoice, org, contact, line_items) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=11)
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=20, spaceAfter=2)
    label = ParagraphStyle("label", parent=small, textColor=colors.grey)

    org_name = getattr(org, "name", "") or ""
    currency = getattr(invoice, "currency", "MYR") or "MYR"
    status = (getattr(invoice, "status", "") or "").lower()

    elements = []
    # Header: org name + INVOICE title
    header_tbl = Table([[
        Paragraph(f"<b>{org_name}</b>", styles["Heading2"]),
        Paragraph("INVOICE", h1),
    ]], colWidths=[100 * mm, 70 * mm])
    header_tbl.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 6 * mm))

    # Meta + bill-to
    sst = getattr(org, "sst_registration_no", None)
    meta_left = [
        Paragraph("BILL TO", label),
        Paragraph(f"<b>{getattr(contact, 'name', '') or ''}</b>", small),
        Paragraph(getattr(contact, "email", "") or "", small),
        Paragraph(getattr(invoice, "billing_address_line1", "") or "", small),
    ]
    meta_right = [
        Paragraph(f"Invoice #: <b>{getattr(invoice, 'invoice_number', '')}</b>", small),
        Paragraph(f"Issue date: {invoice.issue_date.strftime('%Y-%m-%d') if getattr(invoice,'issue_date',None) else ''}", small),
        Paragraph(f"Due date: {invoice.due_date.strftime('%Y-%m-%d') if getattr(invoice,'due_date',None) else ''}", small),
    ]
    if sst:
        meta_right.append(Paragraph(f"SST No: {sst}", small))
    meta_tbl = Table([[meta_left, meta_right]], colWidths=[100 * mm, 70 * mm])
    meta_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(meta_tbl)
    elements.append(Spacer(1, 8 * mm))

    # Line items
    rows = [["#", "Description", "Qty", "Unit Price", "Tax %", "Amount"]]
    for i, li in enumerate(line_items, 1):
        rows.append([
            str(i),
            getattr(li, "description", "") or "",
            f"{float(getattr(li, 'quantity', 0) or 0):g}",
            f"{float(getattr(li, 'unit_price', 0) or 0):,.2f}",
            f"{float(getattr(li, 'tax_rate', 0) or 0):g}",
            f"{float(getattr(li, 'amount', 0) or 0):,.2f}",
        ])
    tbl = Table(rows, colWidths=[10 * mm, 78 * mm, 16 * mm, 24 * mm, 16 * mm, 26 * mm])
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

    # Totals
    totals = [
        ["Subtotal", _money(invoice.subtotal, currency)],
        ["Tax", _money(invoice.tax_amount, currency)],
        ["Total", _money(invoice.total, currency)],
        ["Paid", _money(getattr(invoice, "amount_paid", 0), currency)],
        ["Balance Due", _money(float(invoice.total or 0) - float(getattr(invoice, "amount_paid", 0) or 0), currency)],
    ]
    tot_tbl = Table(totals, colWidths=[40 * mm, 36 * mm], hAlign="RIGHT")
    tot_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 2), (-1, 2), 0.5, colors.grey),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTNAME", (0, 4), (-1, 4), "Helvetica-Bold"),
        ("LINEABOVE", (0, 4), (-1, 4), 1, colors.black),
    ]))
    elements.append(tot_tbl)

    notes = getattr(invoice, "notes", None)
    if notes:
        elements.append(Spacer(1, 8 * mm))
        elements.append(Paragraph("Notes", label))
        elements.append(Paragraph(str(notes), small))

    on_page = None
    if status in ("draft", "void", "cancelled"):
        on_page = _watermark(status.upper())

    if on_page:
        doc.build(elements, onFirstPage=on_page, onLaterPages=on_page)
    else:
        doc.build(elements)
    return buf.getvalue()
