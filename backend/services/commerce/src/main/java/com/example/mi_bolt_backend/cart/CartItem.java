package com.example.mi_bolt_backend.cart;

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

import com.example.mi_bolt_backend.catalog.ProductVariant;

/** One line per variant; quantity is absolute (docs/02-backend.md §4.2 rules 13, 14). */
@Entity
@Table(name = "cart_item")
public class CartItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "cart_id", nullable = false)
	private Cart cart;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "variant_id", nullable = false)
	private ProductVariant variant;

	@Column(nullable = false)
	private int quantity;

	@Column(name = "unit_price_huf", nullable = false)
	private long unitPriceHuf;

	@Column(name = "accepted_unit_price_huf")
	private Long acceptedUnitPriceHuf;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected CartItem() {
		// JPA requires a no-arg constructor.
	}

	public CartItem(Cart cart, ProductVariant variant, int quantity, long unitPriceHuf, OffsetDateTime now) {
		this.cart = cart;
		this.variant = variant;
		this.quantity = quantity;
		this.unitPriceHuf = unitPriceHuf;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public Long getId() {
		return id;
	}

	public Cart getCart() {
		return cart;
	}

	public ProductVariant getVariant() {
		return variant;
	}

	public int getQuantity() {
		return quantity;
	}

	public long getUnitPriceHuf() {
		return unitPriceHuf;
	}

	public long getAcceptedUnitPriceHuf() {
		return acceptedUnitPriceHuf == null ? unitPriceHuf : acceptedUnitPriceHuf;
	}

	public void setAcceptedUnitPriceHuf(long value) {
		this.acceptedUnitPriceHuf = value;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setQuantity(int quantity, OffsetDateTime now) {
		this.quantity = quantity;
		this.updatedAt = now;
	}

	public void setUnitPriceHuf(long unitPriceHuf, OffsetDateTime now) {
		this.unitPriceHuf = unitPriceHuf;
		this.updatedAt = now;
	}
}