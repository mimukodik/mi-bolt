package com.example.mi_bolt_backend.order;

import java.util.Locale;

import org.hibernate.exception.ConstraintViolationException;

/**
 * Whether a database write failed because two concurrent orders drew the
 * same order number: the {@code uq_shop_order_number} unique constraint
 * (docs/02-backend.md rule 46, {@code 0005-orders.yaml}) rejected the
 * insert. {@link OrdersController#createOrder} uses this to decide whether
 * the whole request transaction is worth retrying with a freshly drawn
 * number, since any other constraint violation is a real error.
 *
 * <p>H2 upper-cases constraint names, so the comparison is case-insensitive.
 */
final class OrderNumberConflict {

	private static final String CONSTRAINT_NAME = "uq_shop_order_number";

	private OrderNumberConflict() {
	}

	static boolean isOrderNumberConflict(Throwable ex) {
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
