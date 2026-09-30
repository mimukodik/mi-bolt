package com.example.mi_bolt_backend.order;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.example.mi_bolt_backend.session.ShopSession;

/** Payment-intent handle issued by the demo payment app (docs/02-backend.md §4.4). */
@Entity
@Table(name = "payment_intent")
public class PaymentIntent {

	@Id
	@Column(length = 36)
	private String id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false)
	private ShopSession session;

	@Column(nullable = false, length = 20)
	private String status;

	@Column(name = "amount_huf", nullable = false)
	private long amountHuf;

	@Column(name = "redirect_url", nullable = false, length = 500)
	private String redirectUrl;

	@Column(name = "return_url", nullable = false, length = 500)
	private String returnUrl;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "expires_at", nullable = false)
	private OffsetDateTime expiresAt;

	@Column(name = "snapshot_json", length = 20000)
	private String snapshotJson;

	@Column(name = "basket_revision")
	private Long basketRevision;
	public Long getBasketRevision() { return basketRevision; }
	public void setBasketRevision(long revision) { basketRevision = revision; }

	public String getSnapshotJson() { return snapshotJson; }
	public void setSnapshotJson(String snapshotJson) { this.snapshotJson = snapshotJson; }

	protected PaymentIntent() {
		// JPA requires a no-arg constructor.
	}

	public PaymentIntent(String id, ShopSession session, String status, long amountHuf,
			String redirectUrl, String returnUrl, OffsetDateTime now, OffsetDateTime expiresAt) {
		this.id = id;
		this.session = session;
		this.status = status;
		this.amountHuf = amountHuf;
		this.redirectUrl = redirectUrl;
		this.returnUrl = returnUrl;
		this.createdAt = now;
		this.updatedAt = now;
		this.expiresAt = expiresAt;
	}

	public String getId() {
		return id;
	}

	public ShopSession getSession() {
		return session;
	}

	public String getStatus() {
		return status;
	}

	public long getAmountHuf() {
		return amountHuf;
	}

	public String getRedirectUrl() {
		return redirectUrl;
	}

	public String getReturnUrl() {
		return returnUrl;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public OffsetDateTime getExpiresAt() {
		return expiresAt;
	}

	public void setStatus(String status, OffsetDateTime now) {
		this.status = status;
		this.updatedAt = now;
	}
}
