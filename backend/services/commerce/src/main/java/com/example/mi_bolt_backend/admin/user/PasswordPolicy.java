package com.example.mi_bolt_backend.admin.user;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The admin password rule: 15 to 64 characters with no composition rules
 * (NIST SP 800-63B-4 §3.1.1.2) and at most 72 bytes in UTF-8, bcrypt's input
 * limit, which Spring Security rejects beyond since CVE-2025-22228.
 */
public final class PasswordPolicy {

	public static final int MIN_LENGTH = 15;

	public static final int MAX_LENGTH = 64;

	public static final int MAX_UTF8_BYTES = 72;

	/** A length outside {@link #MIN_LENGTH}..{@link #MAX_LENGTH}, as the error layer names {@code @Size}. */
	public static final String SIZE = "SIZE";

	/** More than {@link #MAX_UTF8_BYTES} bytes in UTF-8. */
	public static final String PASSWORD_TOO_LONG = "PASSWORD_TOO_LONG";

	private PasswordPolicy() {
		// Static rule holder.
	}

	/**
	 * The field-error codes {@code password} violates, length first, then
	 * bytes; empty when the password is acceptable.
	 */
	public static List<String> violations(String password) {
		List<String> codes = new ArrayList<>();
		int length = password.length();
		if (length < MIN_LENGTH || length > MAX_LENGTH) {
			codes.add(SIZE);
		}
		if (password.getBytes(StandardCharsets.UTF_8).length > MAX_UTF8_BYTES) {
			codes.add(PASSWORD_TOO_LONG);
		}
		return List.copyOf(codes);
	}
}
