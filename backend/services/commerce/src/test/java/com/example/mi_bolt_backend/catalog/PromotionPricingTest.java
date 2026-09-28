package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class PromotionPricingTest {

	private static final Instant NOW = Instant.parse("2026-12-01T10:00:00Z");

	@Test
	void startIsInclusiveAndEndIsExclusive() {
		Product product = promotedProduct("2026-12-01T10:00:00Z", "2026-12-02T10:00:00Z");
		assertThat(pricingAt(NOW).isActive(product)).isTrue();
		assertThat(pricingAt(Instant.parse("2026-12-02T10:00:00Z")).isActive(product)).isFalse();
	}

	@Test
	void activeDiscountBecomesEffectivePriceAndExposesOriginal() {
		Product product = promotedProduct("2026-12-01T09:00:00Z", "2026-12-01T11:00:00Z");
		ProductVariant variant = variant(product, 120_000, 99_000L);
		PromotionPricing pricing = pricingAt(NOW);
		assertThat(pricing.effectivePrice(variant)).isEqualTo(99_000);
		assertThat(pricing.originalPrice(variant)).isEqualTo(120_000);
	}

	@Test
	void futureExpiredAndArchivedPromotionsUseNormalPrice() {
		Product future = promotedProduct("2026-12-01T11:00:00Z", "2026-12-01T12:00:00Z");
		Product expired = promotedProduct("2026-12-01T08:00:00Z", "2026-12-01T10:00:00Z");
		Product archived = promotedProduct("2026-12-01T09:00:00Z", "2026-12-01T11:00:00Z");
		archived.setArchivedAt(OffsetDateTime.parse("2026-11-30T00:00:00Z"));
		PromotionPricing pricing = pricingAt(NOW);
		for (Product product : new Product[] { future, expired, archived }) {
			ProductVariant variant = variant(product, 120_000, 99_000L);
			assertThat(pricing.effectivePrice(variant)).isEqualTo(120_000);
			assertThat(pricing.originalPrice(variant)).isNull();
		}
	}

	private static PromotionPricing pricingAt(Instant instant) {
		return new PromotionPricing(Clock.fixed(instant, ZoneOffset.UTC));
	}

	private static Product promotedProduct(String start, String end) {
		Product product = new Product();
		product.setPromotionStartAt(OffsetDateTime.parse(start));
		product.setPromotionEndAt(OffsetDateTime.parse(end));
		product.setPromotionText("Adventi ajánlat");
		return product;
	}

	private static ProductVariant variant(Product product, long normal, Long discount) {
		ProductVariant variant = new ProductVariant();
		variant.setProduct(product);
		variant.setPriceHuf(normal);
		variant.setDiscountPriceHuf(discount);
		return variant;
	}
}
