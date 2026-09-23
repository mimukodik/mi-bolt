package com.example.mi_bolt_backend.session;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.stereotype.Service;

/**
 * Generates the cookie value and its stored hash.
 *
 * <p>The cookie carries 32 random bytes encoded base64url without padding; the stored
 * token hash is the SHA-256 hex digest of those bytes (the raw bytes are never
 * written to disk).
 */
@Service
public class SessionTokenService {

	private static final SecureRandom RANDOM = new SecureRandom();
	private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

	/** Length of the random token in bytes (32 → 43 base64url chars). */
	private static final int TOKEN_BYTE_LENGTH = 32;

	public String newTokenValue() {
		byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
		RANDOM.nextBytes(bytes);
		return URL_ENCODER.encodeToString(bytes);
	}

	public String hash(String tokenValue) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] hashBytes = digest.digest(tokenValue.getBytes(StandardCharsets.UTF_8));
			StringBuilder hex = new StringBuilder(hashBytes.length * 2);
			for (byte b : hashBytes) {
				hex.append(String.format("%02x", b));
			}
			return hex.toString();
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 not available", e);
		}
	}
}
