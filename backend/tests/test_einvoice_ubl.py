"""
MyInvois UBL builder tests — payload structure verified against the LHDN SDK
spec (invoice v1.0, unsigned) without needing LHDN credentials or network.
"""
import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone

from app.models.einvoice import EInvoiceSubmission
from app.services import einvoice_ubl as ubl

SUPPLIER = {
    "name": "Accruly Sdn Bhd", "tin": "C1234567890", "brn": "202001012345",
    "sst_no": "W10-1808-32000060", "msic_code": "62010", "msic_description": "Computer programming",
    "phone": "+60123456789", "email": "billing@accruly.io",
    "address_line1": "1 Jalan Test", "city": "Kuala Lumpur", "postcode": "50000",
    "state_code": "14", "country": "MYS",
}
BUYER = {
    "name": "Customer Sdn Bhd", "tin": "C9876543210", "brn": "201901054321",
    "phone": "+60198765432", "email": "ap@customer.com",
    "address_line1": "2 Jalan Buyer", "city": "Petaling Jaya", "postcode": "46000",
    "state_code": "10", "country": "MYS",
}
LINES = [
    {"description": "Consulting", "quantity": 2, "unit_price": 500.0, "amount": 1000.0,
     "tax_rate": 8.0, "tax_amount": 80.0, "sst_category": "service_tax"},
    {"description": "Hardware", "quantity": 1, "unit_price": 200.0, "amount": 200.0,
     "tax_rate": 10.0, "tax_amount": 20.0, "sst_category": "sales_tax"},
    {"description": "Delivery", "quantity": 1, "unit_price": 50.0, "amount": 50.0,
     "tax_rate": 0.0, "tax_amount": 0.0},
]


def _build(**overrides):
    kwargs = dict(
        doc_type_code=ubl.DOC_TYPE_INVOICE, number="INV-00001",
        issue_datetime=datetime(2026, 8, 11, 10, 30, tzinfo=timezone.utc),
        currency="MYR", exchange_rate=1.0,
        supplier=SUPPLIER, buyer=BUYER, lines=LINES,
        subtotal=1250.0, tax_amount=100.0, total=1350.0,
    )
    kwargs.update(overrides)
    return ubl.build_document(**kwargs)


def _inv(doc):
    return doc["Invoice"][0]


def test_root_namespaces_and_type_code():
    doc = _build()
    assert doc["_D"] == "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
    inv = _inv(doc)
    assert inv["InvoiceTypeCode"] == [{"_": "01", "listVersionID": "1.0"}]
    assert inv["ID"] == [{"_": "INV-00001"}]
    assert inv["IssueDate"] == [{"_": "2026-08-11"}]


def test_supplier_party_mandatory_fields():
    party = _inv(_build())["AccountingSupplierParty"][0]["Party"][0]
    assert party["IndustryClassificationCode"][0]["_"] == "62010"
    ids = {i["ID"][0]["schemeID"]: i["ID"][0]["_"] for i in party["PartyIdentification"]}
    assert ids["TIN"] == "C1234567890"
    assert ids["BRN"] == "202001012345"
    assert ids["SST"] == "W10-1808-32000060"
    addr = party["PostalAddress"][0]
    assert addr["CountrySubentityCode"] == [{"_": "14"}]
    assert addr["Country"][0]["IdentificationCode"][0]["_"] == "MYS"
    contact = party["Contact"][0]
    assert contact["Telephone"][0]["_"] == "+60123456789"


def test_buyer_party_populated_not_hardcoded():
    party = _inv(_build())["AccountingCustomerParty"][0]["Party"][0]
    assert party["PartyLegalEntity"][0]["RegistrationName"][0]["_"] == "Customer Sdn Bhd"
    ids = {i["ID"][0]["schemeID"]: i["ID"][0]["_"] for i in party["PartyIdentification"]}
    assert ids["TIN"] == "C9876543210"


def test_invoice_lines_present_with_amounts():
    lines = _inv(_build())["InvoiceLine"]
    assert len(lines) == 3
    first = lines[0]
    assert first["LineExtensionAmount"][0]["_"] == 1000.0
    assert first["Price"][0]["PriceAmount"][0]["_"] == 500.0
    assert first["TaxTotal"][0]["TaxAmount"][0]["_"] == 80.0
    # service tax -> category 02
    assert first["TaxTotal"][0]["TaxSubtotal"][0]["TaxCategory"][0]["ID"][0]["_"] == "02"
    # zero-rate line -> category 06
    assert lines[2]["TaxTotal"][0]["TaxSubtotal"][0]["TaxCategory"][0]["ID"][0]["_"] == "06"


def test_tax_subtotals_grouped_by_category():
    subtotals = _inv(_build())["TaxTotal"][0]["TaxSubtotal"]
    by_cat = {s["TaxCategory"][0]["ID"][0]["_"]: s for s in subtotals}
    assert set(by_cat) == {"01", "02", "06"}
    assert by_cat["02"]["TaxableAmount"][0]["_"] == 1000.0
    assert by_cat["02"]["TaxAmount"][0]["_"] == 80.0
    assert by_cat["01"]["TaxAmount"][0]["_"] == 20.0


def test_monetary_totals():
    lmt = _inv(_build())["LegalMonetaryTotal"][0]
    assert lmt["TaxExclusiveAmount"][0]["_"] == 1250.0
    assert lmt["TaxInclusiveAmount"][0]["_"] == 1350.0
    assert lmt["PayableAmount"][0]["_"] == 1350.0


def test_foreign_currency_includes_exchange_rate():
    inv = _inv(_build(currency="USD", exchange_rate=4.4567))
    fx = inv["TaxExchangeRate"][0]
    assert fx["SourceCurrencyCode"][0]["_"] == "USD"
    assert fx["TargetCurrencyCode"][0]["_"] == "MYR"
    assert fx["CalculationRate"][0]["_"] == 4.4567
    assert _inv(_build()).get("TaxExchangeRate") is None  # MYR: absent


def test_credit_note_billing_reference():
    inv = _inv(_build(doc_type_code=ubl.DOC_TYPE_CREDIT_NOTE,
                      billing_reference={"number": "INV-00001", "uuid": "F9D425P6DS7D8IU"}))
    assert inv["InvoiceTypeCode"][0]["_"] == "02"
    ref = inv["BillingReference"][0]["InvoiceDocumentReference"][0]
    assert ref["ID"][0]["_"] == "INV-00001"
    assert ref["UUID"][0]["_"] == "F9D425P6DS7D8IU"


def test_consolidated_buyer_constants():
    assert ubl.CONSOLIDATED_BUYER["tin"] == "EI00000000010"
    assert ubl.CONSOLIDATED_BUYER["name"] == "General Public"
    inv = _inv(_build(buyer=dict(ubl.CONSOLIDATED_BUYER)))
    ids = {i["ID"][0]["schemeID"]: i["ID"][0]["_"]
           for i in inv["AccountingCustomerParty"][0]["Party"][0]["PartyIdentification"]}
    assert ids["TIN"] == "EI00000000010"


def test_encode_for_submission_hash_and_roundtrip():
    doc = _build()
    entry = ubl.encode_for_submission(doc, "INV-00001")
    decoded = json.loads(base64.b64decode(entry["document"]))
    assert decoded == doc
    assert entry["documentHash"] == hashlib.sha256(
        json.dumps(doc, separators=(",", ":")).encode()
    ).hexdigest()
    assert entry["format"] == "JSON"
    assert entry["codeNumber"] == "INV-00001"


def test_state_code_mapping():
    assert ubl.state_code("Selangor") == "10"
    assert ubl.state_code("wp kuala lumpur") == "14"
    assert ubl.state_code("Pulau Pinang") == "07"
    assert ubl.state_code("Penang") == "07"
    assert ubl.state_code("14") == "14"
    assert ubl.state_code(None) == "17"
    assert ubl.state_code("Bavaria") == "17"


def test_validation_link_env_switch():
    assert ubl.validation_link("https://preprod.api.myinvois.hasil.gov.my", "UUID1", "LONG1") == \
        "https://preprod.myinvois.hasil.gov.my/UUID1/share/LONG1"
    assert ubl.validation_link("https://api.myinvois.hasil.gov.my", "UUID1", "LONG1") == \
        "https://myinvois.hasil.gov.my/UUID1/share/LONG1"


class _SubProxy:
    """Proxy for the cancellation-window rule (SA models need a session)."""
    CANCEL_WINDOW_HOURS = 72
    can_cancel = EInvoiceSubmission.can_cancel

    def __init__(self, status, validated_at):
        self.status = status
        self.validated_at = validated_at


def test_cancel_window_72h():
    now = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)
    fresh = _SubProxy("valid", now - timedelta(hours=71))
    stale = _SubProxy("valid", now - timedelta(hours=73))
    unvalidated = _SubProxy("submitted", None)
    assert fresh.can_cancel(now) is True
    assert stale.can_cancel(now) is False
    assert unvalidated.can_cancel(now) is False


def test_tax_category_resolution():
    assert ubl.tax_category_for(8.0, "service_tax") == "02"
    assert ubl.tax_category_for(10.0, "sales_tax") == "01"
    assert ubl.tax_category_for(10.0, None) == "01"
    assert ubl.tax_category_for(0, None) == "06"
