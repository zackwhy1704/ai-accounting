from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
)




# ──────────────────────────────────────────────
# Document (uploaded files for AI processing)
# ──────────────────────────────────────────────
class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    filename: Mapped[str] = mapped_column(String(255))
    file_url: Mapped[str] = mapped_column(String(1000))
    file_type: Mapped[str] = mapped_column(String(50))
    file_size: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded, processing, processed, failed, done
    category: Mapped[str | None] = mapped_column(String(50))  # invoice, receipt, bill, bank_statement, other
    ai_extracted_data: Mapped[dict | None] = mapped_column(JSONB)
    ai_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2))
    linked_invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"))
    linked_bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id"))
    linked_grn_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("goods_received_notes.id"), nullable=True)
    # Generic polymorphic link for all other module records (credit_note, vendor_credit, etc.)
    linked_record_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    linked_record_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    confirmed_journal_pattern: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization: Mapped["Organization"] = relationship(back_populates="documents")

    __table_args__ = (
        Index("ix_documents_org_status", "organization_id", "status"),
    )




class DocumentShare(Base):
    """SME shares specific documents with an accountant/bookkeeper."""
    __tablename__ = "document_shares"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    owner_org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    shared_with_email: Mapped[str] = mapped_column(String(255), index=True)
    shared_with_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    shared_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    shared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("document_id", "shared_with_email", name="uq_doc_share"),
        Index("ix_doc_shares_email", "shared_with_email"),
    )


# ──────────────────────────────────────────────
# Firm ↔ Client Links
# ──────────────────────────────────────────────




# ──────────────────────────────────────────────
# Firm ↔ Client Links
# ──────────────────────────────────────────────
class FirmClientLink(Base):
    """
    A firm (accounting practice) invites an existing SME/client org to link.
    Once accepted, the firm can see documents the SME chooses to share,
    and appears in the SME's accountant dropdown.
    """
    __tablename__ = "firm_client_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    firm_org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    client_org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, active, declined, revoked
    invited_email: Mapped[str] = mapped_column(String(255))  # email the invite was sent to
    invited_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_fcl_firm", "firm_org_id"),
        Index("ix_fcl_client", "client_org_id"),
        Index("ix_fcl_token", "token"),
    )


# ──────────────────────────────────────────────
# Audit Log (immutable, append-only)
# ──────────────────────────────────────────────
