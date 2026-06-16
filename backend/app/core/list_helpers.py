"""
Helpers for list endpoints that denormalise the related contact's name into the
response, so list pages don't have to fetch the whole contact list client-side
(which broke names past the 50-contact page and defeated server pagination).

Usage in a list endpoint:
    query = apply_sort(base, Invoice, p).options(
        selectinload(Invoice.line_items), selectinload(Invoice.contact)
    ).offset(p.offset).limit(p.limit)
    rows = (await db.execute(query)).scalars().all()
    items = [with_contact_name(InvoiceResponse, row) for row in rows]
"""


def with_contact_name(response_cls, orm_obj):
    """model_validate the ORM object, then set contact_name from the eager-loaded
    .contact relationship (if present)."""
    resp = response_cls.model_validate(orm_obj)
    contact = getattr(orm_obj, "contact", None)
    if contact is not None and hasattr(resp, "contact_name"):
        resp.contact_name = getattr(contact, "name", None)
    return resp
