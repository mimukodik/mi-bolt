package com.example.mi_bolt_backend.session;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.OffsetDateTime;

import com.example.mi_bolt_backend.test.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@IntegrationTest
class SessionServiceTest {

	@Autowired
	private SessionService sessions;

	@Autowired
	private SessionTokenService tokens;

	@Autowired
	private ShopSessionRepository repository;

	@Test
	void loadByCookieTokenReturnsNullForExpiredSession() {
		String tokenValue = "past-token-" + System.nanoTime();
		String tokenHash = tokens.hash(tokenValue);

		ShopSession expired = new ShopSession(
				tokenHash,
				OffsetDateTime.now().minus(Duration.ofDays(40)),
				OffsetDateTime.now().minus(Duration.ofDays(10)));
		repository.save(expired);

		assertNull(sessions.loadByCookieToken(tokenValue),
				"a session whose expiresAt is in the past is not loadable");
	}

	@Test
	void loadByCookieTokenReturnsLiveSession() {
		// Issue a fresh session through the service so the row is valid by construction.
		SessionService.IssuedSession issued = sessions.issueNew();
		assertNotNull(sessions.loadByCookieToken(issued.cookieValue()));
	}

	@Test
	void loadByCookieTokenReturnsNullForUnknownToken() {
		assertNull(sessions.loadByCookieToken("not-a-real-cookie-value"));
	}

	@Test
	void lifetimeMatchesConfiguredDuration() {
		assertTrue(sessions.lifetime().compareTo(Duration.ofDays(1)) > 0,
				"lifetime should be more than a day, was: " + sessions.lifetime());
	}
}
