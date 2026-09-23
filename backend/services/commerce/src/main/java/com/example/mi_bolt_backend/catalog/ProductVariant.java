package com.example.mi_bolt_backend.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "product_variant")
public class ProductVariant {

	@Id
	@Column(length = 80)
	private String id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	@Column(nullable = false, length = 120)
	private String slug;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "color_id", nullable = false)
	private ProductColor color;

	@Column(name = "storage_gb", nullable = false)
	private Integer storageGb;

	@Column(name = "price_huf", nullable = false)
	private long priceHuf;

	@Column(nullable = false)
	private Integer stock;

	public String getId() {
		return id;
	}

	public void setId(String id) {
		this.id = id;
	}

	public Product getProduct() {
		return product;
	}

	public void setProduct(Product product) {
		this.product = product;
	}

	public String getSlug() {
		return slug;
	}

	public void setSlug(String slug) {
		this.slug = slug;
	}

	public ProductColor getColor() {
		return color;
	}

	public void setColor(ProductColor color) {
		this.color = color;
	}

	public Integer getStorageGb() {
		return storageGb;
	}

	public void setStorageGb(Integer storageGb) {
		this.storageGb = storageGb;
	}

	public long getPriceHuf() {
		return priceHuf;
	}

	public void setPriceHuf(long priceHuf) {
		this.priceHuf = priceHuf;
	}

	public Integer getStock() {
		return stock;
	}

	public void setStock(Integer stock) {
		this.stock = stock;
	}
}
