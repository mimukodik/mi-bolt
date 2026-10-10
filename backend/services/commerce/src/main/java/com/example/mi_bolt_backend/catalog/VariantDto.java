package com.example.mi_bolt_backend.catalog;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;


@JsonIgnoreProperties(ignoreUnknown = true)
public class VariantDto {

	private String id;
	private String slug;
	private String colorCode;
	private Integer storageGb;
	private long priceHuf;
	private Long salePriceHuf;
	private Integer stock;

	public String getId() {
		return id;
	}

	public void setId(String id) {
		this.id = id;
	}

	public String getSlug() {
		return slug;
	}

	public void setSlug(String slug) {
		this.slug = slug;
	}

	public String getColorCode() {
		return colorCode;
	}

	public void setColorCode(String colorCode) {
		this.colorCode = colorCode;
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

	public Long getSalePriceHuf() {
		return salePriceHuf;
	}

	public void setSalePriceHuf(Long salePriceHuf) {
		this.salePriceHuf = salePriceHuf;
	}
}
