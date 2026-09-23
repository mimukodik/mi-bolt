package com.example.mi_bolt_backend.admin.catalog;

import java.util.Map;

import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * The product ETag ({@code "<version>"}, quoted like the cart's) and the
 * If-Match check every admin product write runs first. A missing or blank
 * header is 428; a version other than the product's is 412 with
 * {@code params.expected} and {@code params.received}.
 */
public final class AdminProductEtags {

	private AdminProductEtags() {
	}

	public static String etag(long version) {
		return "\"" + version + "\"";
	}

	public static void expectVersion(Product product, String ifMatch) {
		if (ifMatch == null || ifMatch.isBlank()) {
			throw new DomainException(ErrorCode.PRECONDITION_REQUIRED, "If-Match required");
		}
		String trimmed = ifMatch.trim();
		if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
			trimmed = trimmed.substring(1, trimmed.length() - 1);
		}
		long received;
		try {
			received = Long.parseLong(trimmed);
		}
		catch (NumberFormatException ex) {
			throw new DomainException(ErrorCode.PRODUCT_VERSION_CONFLICT, "Product version conflict",
					Map.of("expected", product.getVersion(), "received", 0L), null, ex);
		}
		if (received != product.getVersion()) {
			throw new DomainException(ErrorCode.PRODUCT_VERSION_CONFLICT, "Product version conflict",
					Map.of("expected", product.getVersion(), "received", received));
		}
	}
}
