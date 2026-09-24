package com.example.mi_bolt_backend.session;

import java.time.Duration;
import java.time.OffsetDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loads an existing session by its token hash or creates a new one.
 *
 * <p>Expiry and cookie lifetime come from the configured {@code mibolt.session.lifetime}
 * (default 30 days per contracts/commerce/kommunikacio.md §2).
 */
@Service
public class SessionService {

	private final ShopSessionRepository repository;
	private final SessionTokenService tokens;
	private final Duration lifetime;

	public SessionService(ShopSessionRepository repository,
			SessionTokenService tokens,
			@Value("${mibolt.session.lifetime:30d}") Duration lifetime) {
		this.repository = repository;
		this.tokens = tokens;
		this.lifetime = lifetime;
	}

	public Duration lifetime() {
		return lifetime;
	}

	@Transactional
	public IssuedSession issueNew() {
		String tokenValue = tokens.newTokenValue();
		String tokenHash = tokens.hash(tokenValue);
		OffsetDateTime now = OffsetDateTime.now();
		OffsetDateTime expiresAt = now.plus(lifetime);
		ShopSession saved = repository.save(new ShopSession(tokenHash, now, expiresAt));
		return new IssuedSession(tokenValue, saved);
	}

	@Transactional(readOnly = true)
	public ShopSession loadByCookieToken(String tokenValue) {
		if (tokenValue == null || tokenValue.isBlank()) {
			return null;
		}
		String tokenHash = tokens.hash(tokenValue);
		return repository.findByTokenHash(tokenHash)
				.filter(session -> session.getExpiresAt().isAfter(OffsetDateTime.now()))
				.orElse(null);
	}

	/** Result of issuing a new session: the raw cookie value plus the persisted row. */
	public record IssuedSession(String cookieValue, ShopSession session) {
	}
}
