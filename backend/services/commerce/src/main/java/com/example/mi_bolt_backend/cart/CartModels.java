package com.example.mi_bolt_backend.cart;

import java.util.ArrayList;
import java.util.List;

import com.example.mi_bolt_backend.api.model.Availability;
import com.example.mi_bolt_backend.api.model.Cart;
import com.example.mi_bolt_backend.api.model.CartItem;
import com.example.mi_bolt_backend.api.model.CartNotice;
import com.example.mi_bolt_backend.api.model.CartNoticeCode;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.catalog.CatalogModels;

/** Constructs the generated cart DTOs from {@link CartData}; the only class that does. */
public final class CartModels {

	private CartModels() {
	}

	public static Cart toCart(CartData.CartView view) {
		List<CartItem> items = new ArrayList<>();
		for (CartData.Line line : view.items()) {
			items.add(toCartItem(line));
		}
		List<CartNotice> notices = new ArrayList<>();
		for (CartData.Notice notice : view.notices()) {
			notices.add(toCartNotice(notice));
		}
		return new Cart(String.valueOf(view.id()), Math.toIntExact(view.version()), items,
				view.lineCount(), view.totalQuantity(), money(view.subtotal()), view.expiresAt(), notices);
	}

	public static CartItem toCartItem(CartData.Line line) {
		return new CartItem(line.variantId(), line.variantSlug(), line.productId(), line.productSlug(),
				line.productName(), line.colorName(), StorageGb.fromValue(line.storageGb()),
				CatalogModels.toImage(line.image()), line.quantity(), money(line.unitPrice()),
				money(line.lineTotal()), line.inStock() ? Availability.IN_STOCK : Availability.OUT_OF_STOCK,
				line.maxQuantity());
	}

	public static CartNotice toCartNotice(CartData.Notice notice) {
		CartNotice mapped = new CartNotice(CartNoticeCode.fromValue(notice.code()));
		mapped.setVariantId(notice.variantId());
		mapped.setParams(notice.params());
		return mapped;
	}

	private static Money money(long amount) {
		return new Money(Math.toIntExact(amount), Money.CurrencyEnum.HUF);
	}
}