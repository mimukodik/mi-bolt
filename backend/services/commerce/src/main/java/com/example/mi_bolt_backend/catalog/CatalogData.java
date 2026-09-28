package com.example.mi_bolt_backend.catalog;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Plain-data records produced by {@link CatalogService} and consumed by
 * {@link CatalogModels}. The records live in the {@code catalog} package so
 * the service can refer to them without colliding with the generated
 * {@code api.model} types that share several names (Product, SpecGroup,
 * SpecRow). The mapper is the only place that constructs the generated DTOs; the
 * controller imports {@code api.model.Product} as a return type and relies on
 * the single-type import shadowing the entity of the same name.
 */
public interface CatalogData {

	public record CatalogItemData(
			String id,
			String slug,
			String brand,
			String name,
			List<String> highlights,
			boolean is5g,
			LocalDate releasedAt,
			int storageGb,
			String variantId,
			String variantSlug,
			int priceAmount,
			Integer originalPriceAmount,
			boolean inStock,
			int maxQuantity,
			ImageData image,
			List<ColorOptionData> colors,
			ActivePromotionData promotion) {
	}

	public record ColorOptionData(
			String colorCode,
			String colorName,
			String swatchHex,
			String variantId,
			String variantSlug,
			int priceAmount,
			Integer originalPriceAmount,
			boolean inStock) {
	}

	public record ImageData(
			String id,
			String src,
			String alt,
			int width,
			int height) {
	}

	public record ProductData(
			String id,
			String slug,
			String brand,
			String name,
			List<String> highlights,
			boolean is5g,
			LocalDate releasedAt,
			String description,
			List<VariantData> variants,
			List<SpecGroupData> specGroups,
			ActivePromotionData promotion) {
	}

	public record VariantData(
			String id,
			String slug,
			String colorCode,
			String colorName,
			String swatchHex,
			int storageGb,
			int priceAmount,
			Integer originalPriceAmount,
			boolean inStock,
			int maxQuantity,
			ImageData image) {
	}

	public record ActivePromotionData(String text, OffsetDateTime startAt, OffsetDateTime endAt) {
	}

	public record SpecGroupData(
			String id,
			String title,
			List<SpecRowData> rows) {
	}

	public record SpecRowData(
			String label,
			String value) {
	}

	public record FacetsData(
			List<FacetValueData> brands,
			List<FacetValueData> storageGb,
			List<ColorFacetValueData> colors,
			int is5g,
			int inStock,
			PriceRangeData priceRange) {
	}

	public record FacetValueData(
			String value,
			String label,
			int count) {
	}

	public record ColorFacetValueData(
			String value,
			String label,
			int count,
			String swatchHex) {
	}

	public record PriceRangeData(
			int min,
			int max) {
	}

	public record ProductPageData(
			List<CatalogItemData> items,
			int total,
			int page,
			int pageSize,
			int totalPages,
			FacetsData facets) {
	}
}
