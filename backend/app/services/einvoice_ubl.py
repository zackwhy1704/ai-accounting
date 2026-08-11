"""
LHDN MyInvois UBL 2.1 (JSON flavour) document builder.

Pure functions — no DB, no HTTP — so the payload structure is unit-testable
without LHDN credentials. The caller (einvoice_service) resolves ORM objects
into the plain dicts these functions take.

Spec: https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-0/
Document type codes (listVersionID 1.0):
  01 Invoice · 02 Credit Note · 03 Debit Note · 04 Refund Note
  11-14 Self-billed variants of the same.
"""
import base64
import hashlib
import json
from datetime import datetime, timezone

DOC_TYPE_INVOICE = "01"
DOC_TYPE_CREDIT_NOTE = "02"
DOC_TYPE_DEBIT_NOTE = "03"
DOC_TYPE_REFUND_NOTE = "04"
SELF_BILLED_OFFSET = 10  # 01 -> 11, 02 -> 12, ...

# Buyer used for consolidated e-invoices (LHDN-specified placeholder)
CONSOLIDATED_BUYER = {
    "name": "General Public",
    "tin": "EI00000000010",
    "brn": "NA",
    "address_line1": "NA",
    "city": "NA",
    "postcode": "NA",
    "state_code": "17",  # Not applicable
    "country": "MYS",
}

# Default item classification (CLASS list) when the product has none.
# 022 = Others; consolidated e-invoices must use 004.
DEFAULT_ITEM_CLASSIFICATION = "022"
CONSOLIDATED_ITEM_CLASSIFICATION = "004"

# LHDN tax category codes
TAX_CAT_SALES = "01"       # Sales tax
TAX_CAT_SERVICE = "02"     # Service tax
TAX_CAT_NOT_APPLICABLE = "06"
TAX_CAT_EXEMPT = "E"

_STATE_CODES = {
    "johor": "01", "kedah": "02", "kelantan": "03", "melaka": "04", "malacca": "04",
    "negeri sembilan": "05", "pahang": "06", "pulau pinang": "07", "penang": "07",
    "perak": "08", "perlis": "09", "selangor": "10", "terengganu": "11",
    "sabah": "12", "sarawak": "13", "kuala lumpur": "14", "wp kuala lumpur": "14",
    "labuan": "15", "wp labuan": "15", "putrajaya": "16", "wp putrajaya": "16",
}


def state_code(state: str | None) -> str:
    """Map a free-text Malaysian state name to the LHDN 2-digit code (17 = N/A)."""
    if not state:
        return "17"
    s = state.strip().lower()
    if s in _STATE_CODES:
        return _STATE_CODES[s]
    if s.isdigit() and 1 <= int(s) <= 17:
        return f"{int(s):02d}"
    for name, code in _STATE_CODES.items():
        if name in s:
            return code
    return "17"


def tax_category_for(tax_rate: float, sst_category: str | None) -> str:
    if not tax_rate or float(tax_rate) <= 0:
        return TAX_CAT_NOT_APPLICABLE
    return TAX_CAT_SERVICE if sst_category == "service_tax" else TAX_CAT_SALES


def _amt(value, currency: str) -> list[dict]:
    return [{"_": round(float(value or 0), 2), "currencyID": currency}]


def _tax_scheme() -> list[dict]:
    return [{"ID": [{"_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6"}]}]


def _party_identifications(tin: str | None, brn: str | None, ic: str | None = None, sst_no: str | None = None) -> list[dict]:
    """TIN is mandatory; BRN (companies) or NRIC (individuals) is the second ID."""
    ids = [{"ID": [{"_": tin or "NA", "schemeID": "TIN"}]}]
    if brn:
        ids.append({"ID": [{"_": brn, "schemeID": "BRN"}]})
    elif ic:
        ids.append({"ID": [{"_": ic, "schemeID": "NRIC"}]})
    else:
        ids.append({"ID": [{"_": "NA", "schemeID": "BRN"}]})
    if sst_no:
        ids.append({"ID": [{"_": sst_no, "schemeID": "SST"}]})
    return ids


def _postal_address(a: dict) -> list[dict]:
    return [{
        "CityName": [{"_": a.get("city") or "NA"}],
        "PostalZone": [{"_": a.get("postcode") or "NA"}],
        "CountrySubentityCode": [{"_": a.get("state_code") or "17"}],
        "AddressLine": [
            {"Line": [{"_": a.get("address_line1") or "NA"}]},
        ],
        "Country": [{"IdentificationCode": [
            {"_": a.get("country") or "MYS", "listID": "ISO3166-1", "listAgencyID": "6"}
        ]}],
    }]


def build_line(index: int, line: dict, currency: str, classification: str = DEFAULT_ITEM_CLASSIFICATION) -> dict:
    """One UBL InvoiceLine from {description, quantity, unit_price, amount, tax_rate,
    tax_amount, sst_category?, classification?}. `amount` is the after-discount net."""
    net = round(float(line.get("amount") or 0), 2)
    tax_amount = round(float(line.get("tax_amount") or 0), 2)
    cat = tax_category_for(line.get("tax_rate") or 0, line.get("sst_category"))
    return {
        "ID": [{"_": str(index + 1)}],
        "InvoicedQuantity": [{"_": float(line.get("quantity") or 1), "unitCode": line.get("unit") or "C62"}],
        "LineExtensionAmount": _amt(net, currency),
        "TaxTotal": [{
            "TaxAmount": _amt(tax_amount, currency),
            "TaxSubtotal": [{
                "TaxableAmount": _amt(net, currency),
                "TaxAmount": _amt(tax_amount, currency),
                "Percent": [{"_": round(float(line.get("tax_rate") or 0), 2)}],
                "TaxCategory": [{"ID": [{"_": cat}], "TaxScheme": _tax_scheme()}],
            }],
        }],
        "Item": [{
            "CommodityClassification": [{"ItemClassificationCode": [
                {"_": line.get("classification") or classification, "listID": "CLASS"}
            ]}],
            "Description": [{"_": (line.get("description") or "Item")[:300]}],
        }],
        "Price": [{"PriceAmount": _amt(line.get("unit_price") or 0, currency)}],
        "ItemPriceExtension": [{"Amount": _amt(net, currency)}],
    }


def build_document(
    *,
    doc_type_code: str,
    number: str,
    issue_datetime: datetime,
    currency: str,
    exchange_rate: float,
    supplier: dict,
    buyer: dict,
    lines: list[dict],
    subtotal: float,
    tax_amount: float,
    total: float,
    billing_reference: dict | None = None,
    classification: str = DEFAULT_ITEM_CLASSIFICATION,
) -> dict:
    """Full LHDN UBL 2.1 JSON document (version 1.0, unsigned).

    supplier: {name, tin, brn, sst_no?, msic_code, msic_description, phone, email,
               address_line1, city, postcode, state_code}
    buyer: same shape (ic optional instead of brn); use CONSOLIDATED_BUYER for
           consolidated submissions.
    billing_reference: {number, uuid?} of the original invoice, for 02/03/04.
    """
    issue_dt = issue_datetime.astimezone(timezone.utc)
    root_tag = "Invoice"  # LHDN uses the Invoice UBL root for all doc types

    tax_cats: dict[str, dict] = {}
    for ln in lines:
        cat = tax_category_for(ln.get("tax_rate") or 0, ln.get("sst_category"))
        bucket = tax_cats.setdefault(cat, {"taxable": 0.0, "tax": 0.0})
        bucket["taxable"] += float(ln.get("amount") or 0)
        bucket["tax"] += float(ln.get("tax_amount") or 0)
    if not tax_cats:
        tax_cats[TAX_CAT_NOT_APPLICABLE] = {"taxable": float(subtotal or 0), "tax": float(tax_amount or 0)}

    doc: dict = {
        "ID": [{"_": number}],
        "IssueDate": [{"_": issue_dt.strftime("%Y-%m-%d")}],
        "IssueTime": [{"_": issue_dt.strftime("%H:%M:%SZ")}],
        "InvoiceTypeCode": [{"_": doc_type_code, "listVersionID": "1.0"}],
        "DocumentCurrencyCode": [{"_": currency}],
        "TaxCurrencyCode": [{"_": "MYR"}],
        "AccountingSupplierParty": [{
            "Party": [{
                "IndustryClassificationCode": [{
                    "_": supplier.get("msic_code") or "00000",
                    "name": supplier.get("msic_description") or "NOT APPLICABLE",
                }],
                "PartyIdentification": _party_identifications(
                    supplier.get("tin"), supplier.get("brn"), sst_no=supplier.get("sst_no")
                ),
                "PostalAddress": _postal_address(supplier),
                "PartyLegalEntity": [{"RegistrationName": [{"_": supplier.get("name") or "NA"}]}],
                "Contact": [{
                    "Telephone": [{"_": supplier.get("phone") or "NA"}],
                    "ElectronicMail": [{"_": supplier.get("email") or "NA"}],
                }],
            }],
        }],
        "AccountingCustomerParty": [{
            "Party": [{
                "PartyIdentification": _party_identifications(
                    buyer.get("tin"), buyer.get("brn"), ic=buyer.get("ic")
                ),
                "PostalAddress": _postal_address(buyer),
                "PartyLegalEntity": [{"RegistrationName": [{"_": buyer.get("name") or "NA"}]}],
                "Contact": [{
                    "Telephone": [{"_": buyer.get("phone") or "NA"}],
                    "ElectronicMail": [{"_": buyer.get("email") or "NA"}],
                }],
            }],
        }],
        "TaxTotal": [{
            "TaxAmount": _amt(tax_amount, currency),
            "TaxSubtotal": [
                {
                    "TaxableAmount": _amt(v["taxable"], currency),
                    "TaxAmount": _amt(v["tax"], currency),
                    "TaxCategory": [{"ID": [{"_": cat}], "TaxScheme": _tax_scheme()}],
                }
                for cat, v in sorted(tax_cats.items())
            ],
        }],
        "LegalMonetaryTotal": [{
            "LineExtensionAmount": _amt(subtotal, currency),
            "TaxExclusiveAmount": _amt(subtotal, currency),
            "TaxInclusiveAmount": _amt(total, currency),
            "PayableAmount": _amt(total, currency),
        }],
        "InvoiceLine": [build_line(i, ln, currency, classification) for i, ln in enumerate(lines)],
    }

    if currency != "MYR":
        doc["TaxExchangeRate"] = [{
            "SourceCurrencyCode": [{"_": currency}],
            "TargetCurrencyCode": [{"_": "MYR"}],
            "CalculationRate": [{"_": round(float(exchange_rate or 1.0), 6)}],
        }]

    if billing_reference:
        ref: dict = {"ID": [{"_": billing_reference["number"]}]}
        if billing_reference.get("uuid"):
            ref["UUID"] = [{"_": billing_reference["uuid"]}]
        doc["BillingReference"] = [{"InvoiceDocumentReference": [ref]}]

    return {
        "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
        "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        root_tag: [doc],
    }


def encode_for_submission(ubl_doc: dict, code_number: str) -> dict:
    """LHDN submission envelope entry: base64 doc + SHA-256 hash."""
    doc_str = json.dumps(ubl_doc, separators=(",", ":"))
    doc_bytes = doc_str.encode()
    return {
        "format": "JSON",
        "documentHash": hashlib.sha256(doc_bytes).hexdigest(),
        "codeNumber": code_number,
        "document": base64.b64encode(doc_bytes).decode(),
    }


def validation_link(env_base: str, document_uuid: str, long_id: str) -> str:
    """Public MyInvois portal link (also the QR payload) for a validated document."""
    host = "https://preprod.myinvois.hasil.gov.my" if "preprod" in env_base else "https://myinvois.hasil.gov.my"
    return f"{host}/{document_uuid}/share/{long_id}"
