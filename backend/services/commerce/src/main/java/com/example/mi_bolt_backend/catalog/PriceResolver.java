package com.example.mi_bolt_backend.catalog;

import java.time.Clock;
import java.time.OffsetDateTime;

/** One server pricing rule for catalogues, carts, checkout, payment and orders. */
public final class PriceResolver {
	private PriceResolver() {
	}

	public static CatalogData.PriceData resolve(ProductVariant variant, Clock clock) {
		Product product = variant.getProduct();
		OffsetDateTime now = OffsetDateTime.now(clock);
		OffsetDateTime start = product.getPromotionStartsAt();
		OffsetDateTime end = product.getPromotionEndsAt();
		boolean enabled = Boolean.TRUE.equals(product.getPromotionEnabled()) && start != null && end != null;
		boolean active = enabled && !now.isBefore(start) && now.isBefore(end);
		Long reference = variant.getPromotionReferencePriceHuf();
		if (enabled && reference == null) {
			reference = variant.getPriceHuf();
			variant.setPromotionReferencePriceHuf(reference);
		}
		Long sale = variant.getSalePriceHuf();
		boolean discounted = active && sale != null && reference != null && sale > 0 && sale < reference;
		OffsetDateTime boundary = null;
		if (enabled && now.isBefore(start)) {
			boundary = start;
		}
		else if (active) {
			boundary = end;
		}
		return new CatalogData.PriceData(discounted ? sale : variant.getPriceHuf(), discounted,
				discounted ? reference : null, discounted ? product.getPromotionText() : null, now, boundary);
	}

	/** Conditional database capture wins against concurrent legacy base writes and reads. */
	public static void captureReference(ProductVariant variant, ProductVariantRepository variants) {
		if (Boolean.TRUE.equals(variant.getProduct().getPromotionEnabled())
				&& variant.getPromotionReferencePriceHuf() == null) {
			variants.capturePromotionReference(variant.getId());
			Long stored = variants.findPromotionReference(variant.getId());
			if (stored != null) {
				variant.setPromotionReferencePriceHuf(stored);
			}
		}
	}

	/** Before-start snapshots track base writes; started campaigns retain their reference. */
	public static void prepareBaseWrite(Product product, Clock clock) {
		if (!Boolean.TRUE.equals(product.getPromotionEnabled())) {
			return;
		}
		for (ProductVariant variant : product.getVariants()) {
			resolve(variant, clock);
		}
	}

	public static void refreshScheduledReference(Product product, Clock clock, boolean newCampaign) {
		OffsetDateTime start = product.getPromotionStartsAt();
		boolean scheduled = start != null && OffsetDateTime.now(clock).isBefore(start);
		for (ProductVariant variant : product.getVariants()) {
			if (newCampaign || scheduled || variant.getPromotionReferencePriceHuf() == null) {
				variant.setPromotionReferencePriceHuf(variant.getPriceHuf());
			}
		}
	}
}
