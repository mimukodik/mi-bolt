package com.example.mi_bolt_backend.order;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** A line on a confirmed order: a snapshot of the variant at the time the order was placed (rule 44). */
@Entity
@Table(name = "order_line")
public class OrderLine {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "order_id", nullable = false)
	private ShopOrder order;

	@Column(name = "position", nullable = false)
	private int position;

	@Column(name = "variant_id", nullable = false, length = 80)
	private String variantId;

	@Column(name = "product_name", nullable = false, length = 200)
	private String productName;

	@Column(name = "color_name", nullable = false, length = 80)
	private String colorName;

	@Column(name = "storage_gb", nullable = false)
	private int storageGb;

	@Column(nullable = false)
	private int quantity;

	@Column(name = "unit_price_huf", nullable = false)
	private long unitPriceHuf;

	@Column(name = "line_total_huf", nullable = false)
	private long lineTotalHuf;

	protected OrderLine() {
		// JPA requires a no-arg constructor.
	}

	public OrderLine(ShopOrder order, int position, String variantId, String productName,
			String colorName, int storageGb, int quantity, long unitPriceHuf, long lineTotalHuf) {
		this.order = order;
		this.position = position;
		this.variantId = variantId;
		this.productName = productName;
		this.colorName = colorName;
		this.storageGb = storageGb;
		this.quantity = quantity;
		this.unitPriceHuf = unitPriceHuf;
		this.lineTotalHuf = lineTotalHuf;
	}

	public Long getId() {
		return id;
	}

	public ShopOrder getOrder() {
		return order;
	}

	public int getPosition() {
		return position;
	}

	public String getVariantId() {
		return variantId;
	}

	public String getProductName() {
		return productName;
	}

	public String getColorName() {
		return colorName;
	}

	public int getStorageGb() {
		return storageGb;
	}

	public int getQuantity() {
		return quantity;
	}

	public long getUnitPriceHuf() {
		return unitPriceHuf;
	}

	public long getLineTotalHuf() {
		return lineTotalHuf;
	}
}
