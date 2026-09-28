package com.example.mi_bolt_backend.catalog;

import java.time.LocalDate;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "product")
public class Product {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true, length = 120)
	private String slug;

	@Column(nullable = false, length = 80)
	private String brand;

	@Column(nullable = false, length = 200)
	private String name;

	@Column(nullable = false, length = 2000)
	private String description;

	@Column(name = "is_5g", nullable = false)
	private boolean is5g;

	@Column(name = "released_at", nullable = false)
	private LocalDate releasedAt;

	@Column(nullable = false)
	private Integer rank;

	@Column(name = "popularity_score", nullable = false)
	private Integer popularityScore;

	@Column(nullable = false)
	private boolean featured;

	@Column(name = "promotion_start_at")
	private OffsetDateTime promotionStartAt;

	@Column(name = "promotion_end_at")
	private OffsetDateTime promotionEndAt;

	@Column(name = "promotion_text", length = 280)
	private String promotionText;

	@Version
	@Column(nullable = false)
	private long version;

	@Column(name = "archived_at")
	private OffsetDateTime archivedAt;

	@Column(name = "updated_at")
	private OffsetDateTime updatedAt;

	@OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
	@OrderBy("position")
	private List<ProductHighlight> highlights = new ArrayList<>();

	@OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
	@OrderBy("position")
	private List<ProductColor> colors = new ArrayList<>();

	@OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
	@OrderBy("id")
	private List<ProductVariant> variants = new ArrayList<>();

	@OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
	@OrderBy("position")
	private List<SpecGroup> specGroups = new ArrayList<>();

	public Long getId() {
		return id;
	}

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

	public LocalDate getReleasedAt() {
		return releasedAt;
	}

	public void setReleasedAt(LocalDate releasedAt) {
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

	public OffsetDateTime getPromotionStartAt() {
		return promotionStartAt;
	}

	public void setPromotionStartAt(OffsetDateTime promotionStartAt) {
		this.promotionStartAt = promotionStartAt;
	}

	public OffsetDateTime getPromotionEndAt() {
		return promotionEndAt;
	}

	public void setPromotionEndAt(OffsetDateTime promotionEndAt) {
		this.promotionEndAt = promotionEndAt;
	}

	public String getPromotionText() {
		return promotionText;
	}

	public void setPromotionText(String promotionText) {
		this.promotionText = promotionText;
	}

	public long getVersion() {
		return version;
	}

	public OffsetDateTime getArchivedAt() {
		return archivedAt;
	}

	public void setArchivedAt(OffsetDateTime archivedAt) {
		this.archivedAt = archivedAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}

	public List<ProductHighlight> getHighlights() {
		return highlights;
	}

	public List<ProductColor> getColors() {
		return colors;
	}

	public List<ProductVariant> getVariants() {
		return variants;
	}

	public List<SpecGroup> getSpecGroups() {
		return specGroups;
	}
}
