package com.example.mi_bolt_backend.catalog;

/**
 * Thrown by the catalogue loader when {@code catalog.json} violates a rule
 * or an image file cannot be found. The message always names the offending
 * product, variant or file so the operator can find it without grepping.
 */
public class CatalogValidationException extends RuntimeException {

	public CatalogValidationException(String message) {
		super(message);
	}

	public CatalogValidationException(String message, Throwable cause) {
		super(message, cause);
	}
}
