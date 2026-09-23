package com.example.mi_bolt_backend.order;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.example.mi_bolt_backend.session.ShopSession;

/** Per-session idempotency receipt for a mutation endpoint (docs/02-backend.md §4.5 rule 42). */
@Entity
@Table(name = "idempotency_record")
public class IdempotencyRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false)
	private ShopSession session;

	@Column(nullable = false, length = 8)
	private String method;

	@Column(nullable = false, length = 200)
	private String path;

	@Column(name = "idempotency_key", nullable = false, length = 100)
	private String idempotencyKey;

	@Column(name = "request_hash", nullable = false, length = 64)
	private String requestHash;

	@Column(name = "response_status", nullable = false)
	private int responseStatus;

	@Column(name = "response_location", length = 300)
	private String responseLocation;

	@Column(name = "response_body", nullable = false, length = 20000)
	private String responseBody;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected IdempotencyRecord() {
		// JPA requires a no-arg constructor.
	}

	public IdempotencyRecord(ShopSession session, String method, String path, String idempotencyKey,
			String requestHash, int responseStatus, String responseLocation, String responseBody,
			OffsetDateTime createdAt) {
		this.session = session;
		this.method = method;
		this.path = path;
		this.idempotencyKey = idempotencyKey;
		this.requestHash = requestHash;
		this.responseStatus = responseStatus;
		this.responseLocation = responseLocation;
		this.responseBody = responseBody;
		this.createdAt = createdAt;
	}

	public Long getId() {
		return id;
	}

	public ShopSession getSession() {
		return session;
	}

	public String getMethod() {
		return method;
	}

	public String getPath() {
		return path;
	}

	public String getIdempotencyKey() {
		return idempotencyKey;
	}

	public String getRequestHash() {
		return requestHash;
	}

	public int getResponseStatus() {
		return responseStatus;
	}

	public String getResponseLocation() {
		return responseLocation;
	}

	public String getResponseBody() {
		return responseBody;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}
}
