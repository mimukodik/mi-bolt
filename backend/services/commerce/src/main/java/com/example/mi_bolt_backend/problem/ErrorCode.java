package com.example.mi_bolt_backend.problem;

import java.util.Locale;

/**
 * Machine-readable error codes matching the contract's {@code ProblemCode} enum.
 *
 * <p>The {@link #kebab()} form is what the {@code type} URI's last segment uses.
 */
public enum ErrorCode {

	INVALID_REQUEST(400, "Invalid request"),
	VALIDATION_FAILED(422, "Section rejected"),
	NOT_FOUND(404, "Resource not found"),
	CART_EXPIRED(410, "Cart expired"),
	CART_VERSION_CONFLICT(412, "Version conflict"),
	OUT_OF_STOCK(409, "Variant is not orderable"),
	QUANTITY_LIMIT(409, "Quantity limit exceeded"),
	PRICE_CHANGED(409, "Catalogue price changed"),
	CHECKOUT_INCOMPLETE(422, "Checkout is incomplete"),
	PAYMENT_DECLINED(422, "Payment was declined"),
	PAYMENT_PENDING(422, "Payment still settling"),
	PAYMENT_REQUIRED(422, "Payment not completed"),
	PAYMENT_ALREADY_RESOLVED(409, "Payment intent already resolved"),
	IDEMPOTENCY_CONFLICT(409, "Key reused with a different request"),
	SERVICE_UNAVAILABLE(503, "Service unavailable"),
	UNAUTHENTICATED(401, "Authentication required"),
	CSRF_TOKEN_INVALID(403, "CSRF token missing or invalid"),
	PRODUCT_VERSION_CONFLICT(412, "Product version conflict"),
	PRECONDITION_REQUIRED(428, "If-Match required"),
	USERNAME_TAKEN(409, "Username already taken"),
	ADMIN_SELF_DELETE(409, "The signed-in admin cannot be deleted"),
	LAST_ADMIN(409, "The last admin cannot be deleted"),
	VARIANT_IN_CART(409, "Variant is held by an active cart"),
	FEATURED_LIMIT(409, "Featured limit reached"),
	CATALOG_CONSTRAINT_CONFLICT(409, "Catalogue constraint conflict"),
	PAYLOAD_TOO_LARGE(413, "Upload too large");

	private final int httpStatus;
	private final String defaultTitle;

	ErrorCode(int httpStatus, String defaultTitle) {
		this.httpStatus = httpStatus;
		this.defaultTitle = defaultTitle;
	}

	public int httpStatus() {
		return httpStatus;
	}

	public String defaultTitle() {
		return defaultTitle;
	}

	public String kebab() {
		StringBuilder out = new StringBuilder();
		String name = name().toLowerCase(Locale.ROOT);
		for (int i = 0; i < name.length(); i++) {
			char c = name.charAt(i);
			if (c == '_') {
				out.append('-');
			}
			else {
				out.append(c);
			}
		}
		return out.toString();
	}

	public String problemTypeUri() {
		return "urn:mi-bolt:problem:" + kebab();
	}
}
