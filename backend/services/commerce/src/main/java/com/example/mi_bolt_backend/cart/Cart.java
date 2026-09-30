package com.example.mi_bolt_backend.cart;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.example.mi_bolt_backend.session.ShopSession;

/** One active cart per session (docs/02-backend.md §5). */
@Entity
@Table(name = "cart")
public class Cart {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false, unique = true)
	private ShopSession session;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "expires_at", nullable = false)
	private OffsetDateTime expiresAt;

	@Column(name = "basket_revision", nullable = false)
	private long basketRevision;
	@Column(name = "price_changed", nullable = false)
	private boolean priceChanged;
	public boolean isPriceChanged() { return priceChanged; }
	public void setPriceChanged(boolean priceChanged) { this.priceChanged = priceChanged; }

	public long getBasketRevision() { return basketRevision; }
	public void markBasketChanged() { basketRevision++; }

	@OneToMany(mappedBy = "cart", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
	@OrderBy("id")
	private List<CartItem> items = new ArrayList<>();

	protected Cart() {
		// JPA requires a no-arg constructor.
	}

	public Cart(ShopSession session, OffsetDateTime now, OffsetDateTime expiresAt) {
		this.session = session;
		this.createdAt = now;
		this.updatedAt = now;
		this.expiresAt = expiresAt;
	}

	public Long getId() {
		return id;
	}

	public ShopSession getSession() {
		return session;
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

	public List<CartItem> getItems() {
		return items;
	}

	public void touch(OffsetDateTime now, OffsetDateTime expiresAt) {
		this.updatedAt = now;
		this.expiresAt = expiresAt;
	}
}
