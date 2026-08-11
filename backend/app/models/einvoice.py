from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime,
    String, Text, DateTime, ForeignKey, Numeric,
    Index,
    Mapped, mapped_column,
    UUID, JSONB,
)


# ──────────────────────────────────────────────
# LHDN MyInvois e-Invoice submission tracking
# ──────────────────────────────────────────────
class EInvoiceSubmission(Base):
    """One row per document submitted (or queued) to LHDN MyInvois.

    Lifecycle: pending → submitted → valid | invalid | cancelled | rejected.
    `document_uuid` / `long_id` come back from LHDN and drive the public
    validation link + QR. Cancellation is only allowed within 72h of validation.
    """
    __tablename__ = "einvoice_submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))

    # What was submitted: invoice | credit_note | debit_note | refund | consolidated
    source_type: Mapped[str] = mapped_column(String(20), default="invoice")
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # null for consolidated
    doc_type_code: Mapped[str] = mapped_column(String(2), default="01")  # LHDN 01/02/03/04, self-billed 11-14
    doc_number: Mapped[str] = mapped_column(String(50))
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")

    # LHDN identifiers
    submission_uid: Mapped[str | None] = mapped_column(String(50), index=True)
    document_uuid: Mapped[str | None] = mapped_column(String(50), index=True)
    long_id: Mapped[str | None] = mapped_column(String(100))
    document_hash: Mapped[str | None] = mapped_column(String(64))

    # pending | submitted | valid | invalid | cancelled | rejected
    status: Mapped[str] = mapped_column(String(20), default="pending")
    status_reason: Mapped[str | None] = mapped_column(Text)
    validation_link: Mapped[str | None] = mapped_column(String(500))

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)

    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sandbox: Mapped[bool | None] = mapped_column(default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("ix_einvoice_org_source", "organization_id", "source_type", "source_id"),
        Index("ix_einvoice_org_status", "organization_id", "status"),
    )

    CANCEL_WINDOW_HOURS = 72

    def can_cancel(self, now: datetime) -> bool:
        """LHDN allows cancellation only within 72h of validation."""
        if self.status != "valid" or self.validated_at is None:
            return False
        return (now - self.validated_at).total_seconds() < self.CANCEL_WINDOW_HOURS * 3600
