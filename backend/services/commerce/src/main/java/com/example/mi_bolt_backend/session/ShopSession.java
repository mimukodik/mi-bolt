package com.example.mi_bolt_backend.session;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Anonymous session that backs the cart and the checkout draft.
 *
 * <p>The cookie carries a random token; only its SHA-256 hex digest is stored here.
 * The cookie value is never persisted.
 */
@Entity
@Table(name = "shop_session")
public class ShopSession {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "token_hash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "state_version", nullable = false)
	private Long stateVersion = 1L;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "last_seen_at", nullable = false)
	private OffsetDateTime lastSeenAt;

	@Column(name = "expires_at", nullable = false)
	private OffsetDateTime expiresAt;

	protected ShopSession() {
		// JPA requires a no-arg constructor.
	}

	public ShopSession(String tokenHash, OffsetDateTime now, OffsetDateTime expiresAt) {
		this.tokenHash = tokenHash;
		this.createdAt = now;
		this.lastSeenAt = now;
		this.expiresAt = expiresAt;
		this.stateVersion = 1L;
	}

	public Long getId() {
		return id;
	}

	public String getTokenHash() {
		return tokenHash;
	}

	public Long getStateVersion() {
		return stateVersion;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getLastSeenAt() {
		return lastSeenAt;
	}

	public OffsetDateTime getExpiresAt() {
		return expiresAt;
	}

	/** One successful mutation = one increment (docs/02-backend.md §5). */
	public void bumpStateVersion() {
		this.stateVersion = this.stateVersion + 1;
	}

	public void extend(OffsetDateTime now, OffsetDateTime expiresAt) {
		this.lastSeenAt = now;
		this.expiresAt = expiresAt;
	}

	/** Test-only setter to simulate a row that has aged past its lifetime. */
	void setExpiresAt(OffsetDateTime expiresAt) {
		this.expiresAt = expiresAt;
	}
}
