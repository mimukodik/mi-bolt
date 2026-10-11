package com.example.mi_bolt_backend.catalog;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;


@JsonIgnoreProperties(ignoreUnknown = true)
public class ProductDto {

	private String slug;
	private String brand;
	private String name;
	private List<String> highlights;
	private String description;
	private boolean is5g;
	private String releasedAt;

	private Integer rank;
	private Integer popularityScore;
	private boolean featured;
	private PromotionDto promotion;
	private List<SpecGroupDto> specGroups;
	private List<ColorDto> colors;
	private List<VariantDto> variants;

	public String getSlug() {
		return slug;
	}

	public void setSlug(String slug) {
		this.slug = slug;
	}

	public String getBrand() {
		return brand;
	}

	public void setBrand(String brand) {
		this.brand = brand;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public List<String> getHighlights() {
		return highlights;
	}

	public void setHighlights(List<String> highlights) {
		this.highlights = highlights;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public boolean isIs5g() {
		return is5g;
	}

	public void setIs5g(boolean is5g) {
		this.is5g = is5g;
	}

	public String getReleasedAt() {
		return releasedAt;
	}

	public void setReleasedAt(String releasedAt) {
		this.releasedAt = releasedAt;
	}

	public Integer getRank() {
		return rank;
	}

	public void setRank(Integer rank) {
		this.rank = rank;
	}

	public Integer getPopularityScore() {
		return popularityScore;
	}

	public void setPopularityScore(Integer popularityScore) {
		this.popularityScore = popularityScore;
	}

	public boolean isFeatured() {
		return featured;
	}

	public void setFeatured(boolean featured) {
		this.featured = featured;
	}

	public List<SpecGroupDto> getSpecGroups() {
		return specGroups;
	}

	public void setSpecGroups(List<SpecGroupDto> specGroups) {
		this.specGroups = specGroups;
	}

	public List<ColorDto> getColors() {
		return colors;
	}

	public void setColors(List<ColorDto> colors) {
		this.colors = colors;
	}

	public List<VariantDto> getVariants() {
		return variants;
	}

	public void setVariants(List<VariantDto> variants) {
		this.variants = variants;
	}

	public PromotionDto getPromotion() {
		return promotion;
	}

	public void setPromotion(PromotionDto promotion) {
		this.promotion = promotion;
	}
}
