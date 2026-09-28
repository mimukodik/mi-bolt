package com.example.mi_bolt_backend.catalog;

import java.time.Clock;
import java.time.OffsetDateTime;

import org.springframework.stereotype.Component;

/** Central server-clock policy for promotion visibility and chargeable prices. */
@Component
public class PromotionPricing {

	private final Clock clock;

	public PromotionPricing(Clock clock) {
		this.clock = clock;
	}

	public boolean isActive(Product product) {
		OffsetDateTime now = OffsetDateTime.now(clock);
		return product.getArchivedAt() == null
				&& product.getPromotionStartAt() != null
				&& product.getPromotionEndAt() != null
				&& !now.isBefore(product.getPromotionStartAt())
				&& now.isBefore(product.getPromotionEndAt());
	}

	public long effectivePrice(ProductVariant variant) {
		Long discounted = variant.getDiscountPriceHuf();
		return isActive(variant.getProduct()) && discounted != null ? discounted : variant.getPriceHuf();
	}

	public Long originalPrice(ProductVariant variant) {
		return isActive(variant.getProduct()) && variant.getDiscountPriceHuf() != null
				? variant.getPriceHuf()
				: null;
	}
}
