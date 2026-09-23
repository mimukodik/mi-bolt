package com.example.mi_bolt_backend.admin.catalog;

/**
 * Thrown by {@link ImageInspector} when the bytes cannot be classified as a
 * supported image. The {@link Reason} carries the single code the upload
 * endpoint (unit B14) turns into the field-error code on the 422 response, so
 * each reason name is fixed and machine-read.
 */
public class ImageRejectedException extends RuntimeException {

	/**
	 * The single, stable code the upload endpoint maps to its response. The
	 * enum names are the contract: they appear in the 422 field-error code.
	 */
	public enum Reason {
		/** No bytes were supplied, or the byte array is empty. */
		EMPTY_FILE,
		/** The first bytes do not match any supported image type. */
		UNSUPPORTED_IMAGE_TYPE,
		/** The type is recognised but the header cannot be parsed. */
		IMAGE_UNREADABLE
	}

	private final Reason reason;

	public ImageRejectedException(Reason reason, String message) {
		super(message);
		this.reason = reason;
	}

	public ImageRejectedException(Reason reason, String message, Throwable cause) {
		super(message, cause);
		this.reason = reason;
	}

	public Reason reason() {
		return reason;
	}
}
