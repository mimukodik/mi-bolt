package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class PriceResolverTest {
	private static final Instant START = Instant.parse("2026-10-30T00:00:00Z");
	private static final Instant END = Instant.parse("2026-11-02T00:00:00Z");

	@Test
	void campaignUsesInclusiveStartAndExclusiveEnd() {
		ProductVariant variant = variant();
		CatalogData.PriceData before = PriceResolver.resolve(variant, at(START.minusSeconds(1)));
		assertThat(before.amount()).isEqualTo(100_000);
		assertThat(before.activePromotion()).isFalse();
		assertThat(before.nextPriceChangeAt().toInstant()).isEqualTo(START);
		CatalogData.PriceData started = PriceResolver.resolve(variant, at(START));
		assertThat(started.amount()).isEqualTo(80_000);
		assertThat(started.referencePrice()).isEqualTo(100_000);
		assertThat(started.nextPriceChangeAt().toInstant()).isEqualTo(END);
		assertThat(PriceResolver.resolve(variant, at(END.minusNanos(1))).activePromotion()).isTrue();
		CatalogData.PriceData ended = PriceResolver.resolve(variant, at(END));
		assertThat(ended.amount()).isEqualTo(100_000);
		assertThat(ended.activePromotion()).isFalse();
		assertThat(ended.referencePrice()).isNull();
		assertThat(ended.nextPriceChangeAt()).isNull();
	}

	@Test
	void scheduledReferenceTracksBaseUntilStartAndRemainsImmutableAfterIt() {
		ProductVariant variant = variant();
		Product product = variant.getProduct();
		Clock before = at(START.minusSeconds(1));
		PriceResolver.refreshScheduledReference(product, before, true);
		variant.setPriceHuf(120_000);
		PriceResolver.refreshScheduledReference(product, before, false);
		assertThat(variant.getPromotionReferencePriceHuf()).isEqualTo(120_000);
		Clock started = at(START);
		PriceResolver.prepareBaseWrite(product, started);
		variant.setPriceHuf(150_000);
		PriceResolver.refreshScheduledReference(product, started, false);
		CatalogData.PriceData price = PriceResolver.resolve(variant, started);
		assertThat(price.referencePrice()).isEqualTo(120_000);
		assertThat(price.amount()).isEqualTo(80_000);
		assertThat(PriceResolver.resolve(variant, at(END)).amount()).isEqualTo(150_000);
	}

	@Test
	void partialSaleAndDisabledCampaignKeepBasePrices() {
		ProductVariant variant = variant();
		variant.setSalePriceHuf(null);
		assertThat(PriceResolver.resolve(variant, at(START)).activePromotion()).isFalse();
		assertThat(PriceResolver.resolve(variant, at(START)).amount()).isEqualTo(100_000);
		variant.setSalePriceHuf(80_000L);
		variant.getProduct().setPromotionEnabled(false);
		assertThat(PriceResolver.resolve(variant, at(START)).activePromotion()).isFalse();
		assertThat(PriceResolver.resolve(variant, at(START)).amount()).isEqualTo(100_000);
	}

	@Test
	void firstStartedReadCapturesReferenceBeforeSubsequentBaseMutation() {
		ProductVariant variant = variant();
		PriceResolver.prepareBaseWrite(variant.getProduct(), at(START));
		variant.setPriceHuf(90_000);
		assertThat(PriceResolver.resolve(variant, at(START)).referencePrice()).isEqualTo(100_000);
	}

	private static Clock at(Instant instant) {
		return Clock.fixed(instant, ZoneOffset.UTC);
	}

	private static ProductVariant variant() {
		Product product = new Product();
		product.setPromotionEnabled(true);
		product.setPromotionText("Halloween");
		product.setPromotionStartsAt(OffsetDateTime.ofInstant(START, ZoneOffset.UTC));
		product.setPromotionEndsAt(OffsetDateTime.ofInstant(END, ZoneOffset.UTC));
		ProductVariant variant = new ProductVariant();
		variant.setProduct(product);
		variant.setPriceHuf(100_000);
		variant.setSalePriceHuf(80_000L);
		product.getVariants().add(variant);
		return variant;
	}
}
