package com.example.mi_bolt_backend.admin.catalog;

import java.util.ArrayList;
import java.util.List;

import com.example.mi_bolt_backend.api.model.AdminProduct;
import com.example.mi_bolt_backend.api.model.AdminProductColor;
import com.example.mi_bolt_backend.api.model.AdminProductListColor;
import com.example.mi_bolt_backend.api.model.AdminProductListItem;
import com.example.mi_bolt_backend.api.model.AdminProductStatus;
import com.example.mi_bolt_backend.api.model.AdminProductVariant;
import com.example.mi_bolt_backend.api.model.DiscountMoney;
import com.example.mi_bolt_backend.api.model.AdminSpecGroup;
import com.example.mi_bolt_backend.api.model.AdminSpecRow;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.catalog.CatalogModels;
import com.example.mi_bolt_backend.catalog.CatalogService;
import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.catalog.ProductColor;
import com.example.mi_bolt_backend.catalog.ProductHighlight;
import com.example.mi_bolt_backend.catalog.ProductVariant;
import com.example.mi_bolt_backend.catalog.SpecGroup;
import com.example.mi_bolt_backend.catalog.SpecRow;

/**
 * Maps admin catalogue entities onto the generated admin API DTOs, the way
 * {@code catalog.CatalogModels} maps the shop's plain-data records onto the
 * shop DTOs. Kept separate from {@code CatalogModels} because the admin DTOs
 * (list item, detail) are shaped differently from the shop's.
 */
final class AdminProductModels {

	private AdminProductModels() {
	}

	static AdminProductListItem toListItem(Product p) {
		long minPriceHuf = Long.MAX_VALUE;
		long maxPriceHuf = Long.MIN_VALUE;
		int totalStock = 0;
		for (ProductVariant v : p.getVariants()) {
			long price = v.getPriceHuf();
			if (price < minPriceHuf) {
				minPriceHuf = price;
			}
			if (price > maxPriceHuf) {
				maxPriceHuf = price;
			}
			Integer stock = v.getStock();
			totalStock += stock == null ? 0 : stock;
		}

		List<AdminProductListColor> colors = new ArrayList<>();
		for (ProductColor c : p.getColors()) {
			colors.add(new AdminProductListColor(c.getName(), c.getSwatchHex()));
		}

		return new AdminProductListItem(
				p.getId(),
				p.getVersion(),
				p.getSlug(),
				p.getBrand(),
				p.getName(),
				status(p),
				p.isFeatured(),
				p.getRank(),
				p.getReleasedAt(),
				money((int) minPriceHuf),
				money((int) maxPriceHuf),
				totalStock,
				p.getVariants().size(),
				CatalogModels.toImage(CatalogService.toImageData(p.getColors().get(0))),
				colors);
	}

	static AdminProduct toDetail(Product p) {
		List<String> highlights = new ArrayList<>();
		for (ProductHighlight h : p.getHighlights()) {
			highlights.add(h.getText());
		}

		List<AdminProductColor> colors = new ArrayList<>();
		for (ProductColor c : p.getColors()) {
			colors.add(new AdminProductColor(
					c.getCode(),
					c.getName(),
					c.getSwatchHex(),
					CatalogModels.toImage(CatalogService.toImageData(c))));
		}

		List<AdminProductVariant> variants = new ArrayList<>();
		for (ProductVariant v : p.getVariants()) {
			AdminProductVariant variant = new AdminProductVariant(
					v.getId(),
					v.getSlug(),
					v.getColor().getCode(),
					StorageGb.fromValue(v.getStorageGb()),
					money((int) v.getPriceHuf()),
					v.getStock());
			variant.setDiscountPrice(discountMoney(v.getDiscountPriceHuf()));
			variants.add(variant);
		}

		List<AdminSpecGroup> specGroups = new ArrayList<>();
		for (SpecGroup g : p.getSpecGroups()) {
			List<AdminSpecRow> rows = new ArrayList<>();
			for (SpecRow r : g.getRows()) {
				rows.add(new AdminSpecRow(r.getLabel(), r.getRowValue()));
			}
			specGroups.add(new AdminSpecGroup(g.getTitle(), rows));
		}

		AdminProduct detail = new AdminProduct(
				p.getId(),
				p.getSlug(),
				p.getBrand(),
				p.getName(),
				p.getDescription(),
				p.isIs5g(),
				p.getReleasedAt(),
				p.getRank(),
				p.getPopularityScore(),
				p.isFeatured(),
				status(p),
				p.getVersion(),
				highlights,
				colors,
				variants,
				specGroups);
		detail.setArchivedAt(p.getArchivedAt());
		detail.setUpdatedAt(p.getUpdatedAt());
		detail.setPromotionStartAt(p.getPromotionStartAt());
		detail.setPromotionEndAt(p.getPromotionEndAt());
		detail.setPromotionText(p.getPromotionText());
		return detail;
	}

	private static AdminProductStatus status(Product p) {
		return p.getArchivedAt() == null ? AdminProductStatus.ACTIVE : AdminProductStatus.ARCHIVED;
	}

	private static Money money(int amount) {
		return new Money(amount, Money.CurrencyEnum.HUF);
	}

	private static DiscountMoney discountMoney(Long amount) {
		return amount == null ? null : new DiscountMoney(Math.toIntExact(amount), DiscountMoney.CurrencyEnum.HUF);
	}
}
