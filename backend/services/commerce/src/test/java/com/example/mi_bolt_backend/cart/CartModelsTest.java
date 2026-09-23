package com.example.mi_bolt_backend.cart;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.example.mi_bolt_backend.api.model.Availability;
import com.example.mi_bolt_backend.api.model.Cart;
import com.example.mi_bolt_backend.api.model.CartItem;
import com.example.mi_bolt_backend.api.model.CartNotice;
import com.example.mi_bolt_backend.api.model.CartNoticeCode;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.catalog.CatalogData;

/**
 * Unit tests for {@link CartModels}: covers the notice mapping and every
 * {@code CartView} → {@code Cart} field that the live integration test cannot
 * reach (notices are empty in the API tests; an out-of-stock line is removed
 * by reconciliation before the response is built).
 */
class CartModelsTest {

	@Test
	void mapsNoticesAndEveryCartField() {
		OffsetDateTime expires = OffsetDateTime.parse("2026-10-20T10:00:00Z");
		String sha = "a".repeat(64);
		CatalogData.ImageData image = new CatalogData.ImageData(sha, "/api/v1/media/" + sha, "alt", 800, 800);
		CartData.Line line = new CartData.Line("v1", "slug-v1", "42", "p-slug", "Samsung Galaxy S25", "Sötétkék", 128,
				image, 2, 299990L, 599980L, true, 5);
		CartData.Notice notice = new CartData.Notice("QUANTITY_REDUCED", "v1", Map.of("from", 4, "to", 2));
		CartData.CartView view = new CartData.CartView(10L, 3L, List.of(line), 1, 2, 599980L, expires, List.of(notice));

		Cart cart = CartModels.toCart(view);

		assertThat(cart.getId()).isEqualTo("10");
		assertThat(cart.getVersion()).isEqualTo(3);
		assertThat(cart.getLineCount()).isEqualTo(1);
		assertThat(cart.getTotalQuantity()).isEqualTo(2);
		assertThat(cart.getSubtotal().getAmount()).isEqualTo(599980);
		assertThat(cart.getSubtotal().getCurrency()).isEqualTo(Money.CurrencyEnum.HUF);
		assertThat(cart.getExpiresAt()).isEqualTo(expires);
		CartItem item = cart.getItems().get(0);
		assertThat(item.getVariantId()).isEqualTo("v1");
		assertThat(item.getStorageGb()).isEqualTo(StorageGb.NUMBER_128);
		assertThat(item.getImage().getSrc()).isEqualTo(image.src());
		assertThat(item.getAvailability()).isEqualTo(Availability.IN_STOCK);
		assertThat(item.getMaxQuantity()).isEqualTo(5);
		assertThat(item.getLineTotal().getAmount()).isEqualTo(599980);
		CartNotice mapped = cart.getNotices().get(0);
		assertThat(mapped.getCode()).isEqualTo(CartNoticeCode.QUANTITY_REDUCED);
		assertThat(mapped.getVariantId()).isEqualTo("v1");
		assertThat(mapped.getParams()).containsEntry("from", 4).containsEntry("to", 2);
	}

	@Test
	void outOfStockLineMapsToOutOfStock() {
		String sha = "b".repeat(64);
		CatalogData.ImageData image = new CatalogData.ImageData(sha, "/api/v1/media/" + sha, "alt", 800, 800);
		CartData.Line line = new CartData.Line("v2", "slug-v2", "7", "p-slug", "Nokia 105", "Fekete", 128,
				image, 1, 12990L, 12990L, false, 0);

		CartItem item = CartModels.toCartItem(line);

		assertThat(item.getAvailability()).isEqualTo(Availability.OUT_OF_STOCK);
		assertThat(item.getMaxQuantity()).isEqualTo(0);
	}
}