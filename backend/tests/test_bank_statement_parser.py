"""Unit tests for the pure-Python bank statement parser (CSV / OFX / MT940)."""
import pytest
from app.services.bank_statement_parser import parse_statement


def test_csv_amount_column():
    csv_data = b"Date,Description,Amount,Balance\n2026-01-05,Coffee Shop,-12.50,987.50\n2026-01-06,Salary,3000.00,3987.50\n"
    txns = parse_statement(csv_data, "stmt.csv")
    assert len(txns) == 2
    assert txns[0]["description"] == "Coffee Shop"
    assert txns[0]["amount"] == -12.50
    assert txns[0]["balance"] == 987.50
    assert txns[1]["amount"] == 3000.00


def test_csv_debit_credit_columns():
    csv_data = b"Date,Narrative,Debit,Credit\n05/01/2026,ATM Withdrawal,100.00,\n06/01/2026,Transfer In,,500.00\n"
    txns = parse_statement(csv_data, "stmt.csv")
    assert len(txns) == 2
    assert txns[0]["amount"] == -100.00   # debit -> negative
    assert txns[1]["amount"] == 500.00    # credit -> positive


def test_csv_parentheses_negative():
    csv_data = b"Date,Description,Amount\n2026-02-01,Refund Reversal,(45.00)\n"
    txns = parse_statement(csv_data, "stmt.csv")
    assert txns[0]["amount"] == -45.00


def test_ofx_parsing():
    ofx = b"""OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105120000<TRNAMT>-25.00<FITID>T1<NAME>GRAB RIDE<MEMO>transport</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260106<TRNAMT>1500.00<FITID>T2<NAME>PAYROLL</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"""
    txns = parse_statement(ofx, "stmt.ofx")
    assert len(txns) == 2
    assert txns[0]["amount"] == -25.00
    assert "GRAB RIDE" in txns[0]["description"]
    assert txns[0]["reference"] == "T1"
    assert txns[1]["amount"] == 1500.00


def test_mt940_parsing():
    mt940 = b""":20:STMT001
:25:1234567890
:28C:1/1
:60F:C260101MYR1000,00
:61:2601050105D25,00NTRFREF1//xyz
:86:PAYMENT TO VENDOR ABC
:61:2601060106C1500,00NTRFREF2//abc
:86:SALARY CREDIT
:62F:C260131MYR2475,00
"""
    txns = parse_statement(mt940, "stmt.mt940")
    assert len(txns) == 2
    assert txns[0]["amount"] == -25.00   # D -> negative
    assert "PAYMENT TO VENDOR ABC" in txns[0]["description"]
    assert txns[1]["amount"] == 1500.00  # C -> positive


def test_unsupported_format_raises():
    with pytest.raises(ValueError):
        parse_statement(b"x", "stmt.pdf")


def test_empty_csv_raises():
    with pytest.raises(ValueError):
        parse_statement(b"Date,Description,Amount\n", "stmt.csv")
