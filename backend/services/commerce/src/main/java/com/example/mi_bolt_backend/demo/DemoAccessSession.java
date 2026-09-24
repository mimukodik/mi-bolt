package com.example.mi_bolt_backend.demo;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One demo access session behind the {@code mibolt_demo_access} cookie (MIM-423).
 *
 * <p>The cookie carries a random token shaped by {@code session/SessionTokenService};
 * only its SHA-256 hex digest is stored here. The cookie value itself is never
 * persisted, exactly as on {@code session/ShopSession}.
 */
@Entity
@Table(name = "demo_access_session")
public class DemoAccessSession {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "token_hash", nullable = false, unique = true, length = 64)
	private String tokenHash;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "expires_at", nullable = false)
	private OffsetDateTime expiresAt;

	protected DemoAccessSession() {
		// JPA requires a no-arg constructor.
	}

	public DemoAccessSession(String tokenHash, OffsetDateTime createdAt, OffsetDateTime expiresAt) {
		this.tokenHash = tokenHash;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	public OffsetDateTime getExpiresAt() {
		return expiresAt;
	}
}
