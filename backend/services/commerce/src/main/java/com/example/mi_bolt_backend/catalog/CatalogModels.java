package com.example.mi_bolt_backend.catalog;

import java.util.ArrayList;
import java.util.List;

import com.example.mi_bolt_backend.api.model.Availability;
import com.example.mi_bolt_backend.api.model.CatalogItem;
import com.example.mi_bolt_backend.api.model.ColorFacetValue;
import com.example.mi_bolt_backend.api.model.ColorOption;
import com.example.mi_bolt_backend.api.model.FacetValue;
import com.example.mi_bolt_backend.api.model.Facets;
import com.example.mi_bolt_backend.api.model.Image;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.PriceRange;
import com.example.mi_bolt_backend.api.model.Product;
import com.example.mi_bolt_backend.api.model.ProductPage;
import com.example.mi_bolt_backend.api.model.SpecGroup;
import com.example.mi_bolt_backend.api.model.SpecRow;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.api.model.Variant;

/**
 * Maps the plain-data records produced by {@link CatalogService} onto the
 * generated {@code api.model} types. The mapper is the only class that
 * constructs the generated DTOs; that keeps {@code CatalogService} free
 * of name collisions between the JPA entities and the generated DTOs
 * (Product, SpecGroup, SpecRow share their names on both sides).
 */
public final class CatalogModels {

	private CatalogModels() {
	}

	public static ProductPage toProductPage(CatalogData.ProductPageData data) {
		ProductPage page = new ProductPage(
				new ArrayList<>(),
				data.total(),
				data.page(),
				pageSizeEnum(data.pageSize()),
				data.totalPages(),
				null);
		for (CatalogData.CatalogItemData item : data.items()) {
			page.addItemsItem(toCatalogItem(item));
		}
		page.setFacets(toFacets(data.facets()));
		return page;
	}

	public static CatalogItem toCatalogItem(CatalogData.CatalogItemData data) {
		return new CatalogItem(
				data.id(),
				data.slug(),
				data.brand(),
				data.name(),
				new ArrayList<>(data.highlights()),
				data.is5g(),
				data.releasedAt(),
				StorageGb.fromValue(data.storageGb()),
				data.variantId(),
				data.variantSlug(),
				money(data.priceAmount()),
				data.inStock() ? Availability.IN_STOCK : Availability.OUT_OF_STOCK,
				data.maxQuantity(),
				toImage(data.image()),
				toColorOptions(data.colors()));
	}

	public static Product toProduct(CatalogData.ProductData data) {
		List<Variant> variants = new ArrayList<>();
		for (CatalogData.VariantData v : data.variants()) {
			variants.add(toVariant(v));
		}
		List<SpecGroup> groups = new ArrayList<>();
		for (CatalogData.SpecGroupData g : data.specGroups()) {
			groups.add(toSpecGroup(g));
		}
		return new Product(
				data.id(),
				data.slug(),
				data.brand(),
				data.name(),
				new ArrayList<>(data.highlights()),
				data.is5g(),
				data.releasedAt(),
				data.description(),
				variants,
				groups);
	}

	public static Variant toVariant(CatalogData.VariantData data) {
		return new Variant(
				data.id(),
				data.slug(),
				data.colorCode(),
				data.colorName(),
				data.swatchHex(),
				StorageGb.fromValue(data.storageGb()),
				money(data.priceAmount()),
				data.inStock() ? Availability.IN_STOCK : Availability.OUT_OF_STOCK,
				data.maxQuantity(),
				List.of(toImage(data.image())));
	}

	public static SpecGroup toSpecGroup(CatalogData.SpecGroupData data) {
		List<SpecRow> rows = new ArrayList<>();
		for (CatalogData.SpecRowData row : data.rows()) {
			rows.add(toSpecRow(row));
		}
		return new SpecGroup(data.id(), data.title(), rows);
	}

	public static SpecRow toSpecRow(CatalogData.SpecRowData data) {
		return new SpecRow(data.label(), data.value());
	}

	public static Image toImage(CatalogData.ImageData data) {
		return new Image(data.id(), data.src(), data.alt(), data.width(), data.height());
	}

	public static Facets toFacets(CatalogData.FacetsData data) {
		List<FacetValue> brands = new ArrayList<>();
		for (CatalogData.FacetValueData v : data.brands()) {
			brands.add(new FacetValue(v.value(), v.label(), v.count()));
		}
		List<FacetValue> storages = new ArrayList<>();
		for (CatalogData.FacetValueData v : data.storageGb()) {
			storages.add(new FacetValue(v.value(), v.label(), v.count()));
		}
		List<ColorFacetValue> colors = new ArrayList<>();
		for (CatalogData.ColorFacetValueData v : data.colors()) {
			colors.add(new ColorFacetValue(v.value(), v.label(), v.count(), v.swatchHex()));
		}
		PriceRange priceRange = new PriceRange(
				money(data.priceRange().min()),
				money(data.priceRange().max()));
		return new Facets(brands, storages, colors, data.is5g(), data.inStock(), priceRange);
	}

	private static List<ColorOption> toColorOptions(List<CatalogData.ColorOptionData> colors) {
		List<ColorOption> out = new ArrayList<>();
		for (CatalogData.ColorOptionData c : colors) {
			out.add(new ColorOption(
					c.colorCode(),
					c.colorName(),
					c.swatchHex(),
					c.variantId(),
					c.variantSlug(),
					money(c.priceAmount()),
					c.inStock() ? Availability.IN_STOCK : Availability.OUT_OF_STOCK));
		}
		return out;
	}

	private static Money money(int amount) {
		return new Money(amount, Money.CurrencyEnum.HUF);
	}

	private static ProductPage.PageSizeEnum pageSizeEnum(int pageSize) {
		if (pageSize == 12) {
			return ProductPage.PageSizeEnum.NUMBER_12;
		}
		if (pageSize == 24) {
			return ProductPage.PageSizeEnum.NUMBER_24;
		}
		throw new IllegalArgumentException("pageSize must be 12 or 24, got " + pageSize);
	}
}
