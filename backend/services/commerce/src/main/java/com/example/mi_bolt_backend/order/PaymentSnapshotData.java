package com.example.mi_bolt_backend.order;

import java.time.OffsetDateTime;
import com.example.mi_bolt_backend.cart.CartData;
import com.example.mi_bolt_backend.checkout.CheckoutData;

/** Server accepted prices, fees and basket identity; never repriced on campaign expiry. */
public record PaymentSnapshotData(CartData.CartView cart, CheckoutData.Session checkout, long basketRevision,
		OffsetDateTime draftUpdatedAt, long draftRevision) {
}
