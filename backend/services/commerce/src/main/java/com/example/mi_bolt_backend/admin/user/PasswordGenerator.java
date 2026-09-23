package com.example.mi_bolt_backend.admin.user;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.stereotype.Component;

/**
 * Mints an admin password: 18 bytes from {@link SecureRandom}, Base64
 * URL-safe without padding, so exactly 24 characters from
 * {@code A-Z a-z 0-9 - _}, inside {@link PasswordPolicy}.
 */
@Component
public class PasswordGenerator {

	private static final int RANDOM_BYTES = 18;

	private final SecureRandom random = new SecureRandom();

	public String generate() {
		byte[] bytes = new byte[RANDOM_BYTES];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}
}
