package com.example.mi_bolt_backend.order;

import java.util.Locale;

import org.hibernate.exception.ConstraintViolationException;

/**
 * Whether a database write failed because a second order tried to carry a
 * payment intent that an earlier order already carries: the
 * {@code uq_shop_order_payment_intent} unique constraint
 * ({@code 0011-order-payment-intent-unique.yaml}) rejected the insert. This is
 * the backstop behind {@link OrderService}'s own check, for two concurrent
 * requests that both passed that check; {@link OrdersController#createOrder}
 * answers it with the same 422 PAYMENT_REQUIRED.
 *
 * <p>H2 upper-cases constraint names, so the comparison is case-insensitive.
 */
final class PaymentIntentReuse {

	private static final String CONSTRAINT_NAME = "uq_shop_order_payment_intent";

	private PaymentIntentReuse() {
	}

	static boolean isPaymentIntentReuse(Throwable ex) {
		Throwable cause = ex;
		while (cause != null) {
			if (cause instanceof ConstraintViolationException cve) {
				String name = cve.getConstraintName();
				String toCheck = name != null ? name : cve.getMessage();
				if (namesTheConstraint(toCheck)) {
					return true;
				}
			}
			cause = cause.getCause();
		}
		return false;
	}

	private static boolean namesTheConstraint(String text) {
		return text != null && text.toUpperCase(Locale.ROOT).contains(CONSTRAINT_NAME.toUpperCase(Locale.ROOT));
	}
}
