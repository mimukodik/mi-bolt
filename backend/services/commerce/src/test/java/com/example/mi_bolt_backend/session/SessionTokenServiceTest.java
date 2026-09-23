package com.example.mi_bolt_backend.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class SessionTokenServiceTest {

	@Test
	void newTokenIsBase64UrlNoPaddingAnd43Chars() {
		SessionTokenService service = new SessionTokenService();
		String token = service.newTokenValue();
		assertEquals(43, token.length(), "32 bytes base64url no padding = 43 chars, got: " + token);
		assertFalse(token.contains("+"), "must not contain +: " + token);
		assertFalse(token.contains("/"), "must not contain /: " + token);
		assertFalse(token.endsWith("="), "must not contain padding: " + token);
	}

	@Test
	void twoConsecutiveTokensDiffer() {
		SessionTokenService service = new SessionTokenService();
		assertNotEquals(service.newTokenValue(), service.newTokenValue());
	}

	@Test
	void hashProduces64HexCharsAndIsDeterministic() {
		SessionTokenService service = new SessionTokenService();
		String token = service.newTokenValue();
		String hash = service.hash(token);
		assertEquals(64, hash.length(), "SHA-256 hex = 64 chars, got: " + hash);
		assertTrue(hash.matches("^[0-9a-f]{64}$"), "must be lowercase hex: " + hash);
		assertEquals(hash, service.hash(token), "hash must be deterministic");
	}

	@Test
	void differentTokensHashDifferently() {
		SessionTokenService service = new SessionTokenService();
		String a = service.hash("alpha");
		String b = service.hash("beta");
		assertNotEquals(a, b);
	}

	@Test
	void stateVersionDefaultsToOne() {
		ShopSession session = new ShopSession(
				"hash",
				OffsetDateTime.now(),
				OffsetDateTime.now().plus(Duration.ofDays(30)));
		assertEquals(1L, session.getStateVersion());
	}

	@Test
	void expiresAtMustBeAfterCreatedAt() {
		OffsetDateTime now = OffsetDateTime.parse("2026-09-19T10:00:00Z");
		OffsetDateTime expires = now.plus(Duration.ofDays(30));
		ShopSession session = new ShopSession("hash", now, expires);
		assertTrue(session.getExpiresAt().isAfter(session.getCreatedAt()));
		assertEquals(session.getCreatedAt(), session.getLastSeenAt());
	}
}
