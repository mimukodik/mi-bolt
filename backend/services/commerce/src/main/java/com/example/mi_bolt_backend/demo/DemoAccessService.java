package com.example.mi_bolt_backend.demo;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.SessionTokenService;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

/**
 * The demo gate's storage side (MIM-423): signs the one demo password in and validates
 * the {@code mibolt_demo_access} cookie.
 *
 * <p>Token values and their stored hashes come from the shop's
 * {@link SessionTokenService}, so a demo cookie value is shaped exactly like a
 * {@code mibolt_session} token; the demo access sessions live in their own table and
 * expire after {@code mibolt.demo.access-lifetime}. The sign-in reads every
 * {@code demo_user} row rather than looking one up by the configured username, so a
 * username changed after the first start cannot lock the demo out.
 */
@Service
public class DemoAccessService {

	public static final String COOKIE_NAME = "mibolt_demo_access";

	private final DemoUserRepository users;
	private final DemoAccessSessionRepository sessions;
	private final SessionTokenService tokens;
	private final PasswordEncoder passwordEncoder;
	private final Clock clock;
	private final Duration lifetime;

	public DemoAccessService(DemoUserRepository users, DemoAccessSessionRepository sessions,
			SessionTokenService tokens, PasswordEncoder passwordEncoder, Clock clock,
			@Value("${mibolt.demo.access-lifetime:30d}") Duration lifetime) {
		this.users = users;
		this.sessions = sessions;
		this.tokens = tokens;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
		this.lifetime = lifetime;
	}

	public Duration lifetime() {
		return lifetime;
	}

	/** Stores a fresh session row and returns the raw cookie value, which is never persisted. */
	@Transactional
	public String issueSession() {
		String tokenValue = tokens.newTokenValue();
		OffsetDateTime now = OffsetDateTime.now(clock);
		sessions.save(new DemoAccessSession(tokens.hash(tokenValue), now, now.plus(lifetime)));
		return tokenValue;
	}

	/**
	 * Issues a session when the password matches the demo user, and refuses with
	 * {@link ErrorCode#UNAUTHENTICATED} otherwise.
	 */
	@Transactional
	public String signIn(String password) {
		boolean matches = users.findAll().stream()
				.anyMatch(user -> passwordEncoder.matches(password, user.getPasswordHash()));
		if (!matches) {
			throw new DomainException(ErrorCode.UNAUTHENTICATED, "The demo password is wrong");
		}
		return issueSession();
	}

	/** True when the cookie value names a stored session that has not expired. */
	@Transactional(readOnly = true)
	public boolean isValid(String tokenValue) {
		return tokenValue != null && sessions.findByTokenHash(tokens.hash(tokenValue))
				.filter(session -> session.getExpiresAt().isAfter(OffsetDateTime.now(clock)))
				.isPresent();
	}

	/** The {@code mibolt_demo_access} cookie value, or {@code null} when it is absent or blank. */
	public static String readCookie(HttpServletRequest request) {
		Cookie[] cookies = request.getCookies();
		if (cookies == null) {
			return null;
		}
		for (Cookie cookie : cookies) {
			if (COOKIE_NAME.equals(cookie.getName())) {
				String value = cookie.getValue();
				return (value == null || value.isBlank()) ? null : value;
			}
		}
		return null;
	}
}
