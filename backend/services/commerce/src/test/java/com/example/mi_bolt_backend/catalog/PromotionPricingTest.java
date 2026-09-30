package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import com.example.mi_bolt_backend.api.model.AdminPromotionInput;
import com.example.mi_bolt_backend.problem.DomainException;

class PromotionPricingTest {
	private static final Instant START = Instant.parse("2026-10-31T22:00:00Z");
	private static final Instant END = Instant.parse("2026-10-31T23:00:00Z");

	@ParameterizedTest
	@CsvSource({"-1,false", "0,true", "3599999,true", "3600000,false", "3600001,false"})
	void exactBoundariesUseServerClock(long millis, boolean active) {
		PromotionCampaignRepository repository = repository();
		PromotionService service = new PromotionService(repository, Clock.fixed(START.plusMillis(millis), ZoneOffset.UTC));
		PromotionPricing pricing = new PromotionPricing(service);
		ProductVariant variant = variant();
		assertThat(service.get().getActive()).isEqualTo(active);
		assertThat(pricing.effectivePrice(variant)).isEqualTo(active ? 80000L : 100000L);
		assertThat(pricing.originalPrice(variant)).isEqualTo(active ? 100000 : null);
	}
	@Test
	void budapestMidnightAndOutOfStockArchivedAndNormalVariants() {
		assertThat(END.atZone(ZoneId.of("Europe/Budapest")).toLocalTime().toString()).isEqualTo("00:00");
		PromotionPricing pricing = new PromotionPricing(new PromotionService(repository(), Clock.fixed(START, ZoneOffset.UTC)));
		ProductVariant variant = variant();
		variant.setPriceHuf(110000L);
		assertThat(pricing.originalPrice(variant)).isEqualTo(110000);
		variant.setStock(0);
		assertThat(pricing.promotion(variant)).isNull();
		assertThat(pricing.effectivePrice(variant)).isEqualTo(110000);
		variant.setStock(2);
		variant.getProduct().setArchivedAt(OffsetDateTime.ofInstant(START, ZoneOffset.UTC));
		assertThat(pricing.isActive(variant)).isFalse();
		variant.getProduct().setArchivedAt(null);
		variant.setSalePriceHuf(null);
		assertThat(pricing.isActive(variant)).isFalse();
	}
	@Test
	void oneRequestKeepsOneClockAndCampaignSnapshot() {
		PromotionCampaignRepository repository = repository();
		Clock clock = mock(Clock.class);
		when(clock.getZone()).thenReturn(ZoneOffset.UTC);
		when(clock.instant()).thenReturn(START, END);
		PromotionPricing pricing = new PromotionPricing(new PromotionService(repository, clock));
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
		try {
			assertThat(pricing.effectivePrice(variant())).isEqualTo(80000);
			assertThat(pricing.originalPrice(variant())).isEqualTo(100000);
			assertThat(pricing.snapshot().getServerNow().toInstant()).isEqualTo(START);
			verify(clock, times(1)).instant();
			verify(repository, times(1)).findById(1);
		}
		finally { RequestContextHolder.resetRequestAttributes(); }
	}
	@Test
	void partialBlankAndInvertedCampaignRejectedBeforeMutation() {
		PromotionCampaignRepository repository = repository();
		PromotionService service = new PromotionService(repository, Clock.fixed(START, ZoneOffset.UTC));
		assertThatThrownBy(() -> service.replace("0", new AdminPromotionInput().text(" "))).isInstanceOf(DomainException.class);
		assertThatThrownBy(() -> service.replace("0", new AdminPromotionInput().text("Halloween")
				.startsAt(OffsetDateTime.ofInstant(END, ZoneOffset.UTC)).endsAt(OffsetDateTime.ofInstant(START, ZoneOffset.UTC))))
				.isInstanceOf(DomainException.class);
		assertThatThrownBy(() -> service.replace(null, new AdminPromotionInput())).isInstanceOf(DomainException.class);
		assertThatThrownBy(() -> service.replace("99", new AdminPromotionInput())).isInstanceOf(DomainException.class);
		assertThat(service.admin().getText()).isEqualTo("Halloween");
	}
	private static PromotionCampaignRepository repository() {
		PromotionCampaign campaign = new PromotionCampaign();
		campaign.configure("Halloween", OffsetDateTime.ofInstant(START, ZoneOffset.UTC), OffsetDateTime.ofInstant(END, ZoneOffset.UTC));
		PromotionCampaignRepository repository = mock(PromotionCampaignRepository.class);
		when(repository.findById(1)).thenReturn(Optional.of(campaign));
		return repository;
	}
	private static ProductVariant variant() {
		ProductVariant variant = new ProductVariant();
		variant.setProduct(new Product());
		variant.setPriceHuf(100000);
		variant.setSalePriceHuf(80000L);
		variant.setStock(2);
		return variant;
	}
}
