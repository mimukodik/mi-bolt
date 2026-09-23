package com.example.mi_bolt_backend.session;

import java.io.IOException;
import java.time.Duration;
import java.util.Set;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Reads or issues the {@code mibolt_session} cookie for session-scoped requests.
 *
 * <p>Applies only to paths the cart, checkout, payment-intents and orders operations
 * live on ({@code /cart, /checkout, /payment-intents, /orders} relative to the
 * configured context path). Catalogue and media paths never read or set the cookie.
 * Unknown or expired tokens are replaced with a fresh session; the cookie value
 * itself is never stored — only its SHA-256 hex digest is persisted.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class SessionCookieFilter extends OncePerRequestFilter {

	public static final String COOKIE_NAME = "mibolt_session";

	private static final Set<String> SCOPED_PREFIXES = Set.of(
			"/cart", "/checkout", "/payment-intents", "/orders");

	private final SessionService sessions;

	public SessionCookieFilter(SessionService sessions) {
		this.sessions = sessions;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = pathWithinContext(request);
		if (path == null) {
			return true;
		}
		for (String prefix : SCOPED_PREFIXES) {
			if (path.equals(prefix) || path.startsWith(prefix + "/")) {
				return false;
			}
		}
		return true;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request,
			HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String tokenValue = readCookie(request);
		ShopSession session = (tokenValue == null) ? null : sessions.loadByCookieToken(tokenValue);
		if (session == null) {
			SessionService.IssuedSession issued = sessions.issueNew();
			session = issued.session();
			writeCookie(response, issued.cookieValue());
		}
		CurrentSession.set(request, session);
		filterChain.doFilter(request, response);
	}

	private static String pathWithinContext(HttpServletRequest request) {
		String context = request.getContextPath();
		String uri = request.getRequestURI();
		if (context != null && !context.isEmpty() && uri.startsWith(context)) {
			return uri.substring(context.length());
		}
		return uri;
	}

	private static String readCookie(HttpServletRequest request) {
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

	private void writeCookie(HttpServletResponse response, String value) {
		Duration lifetime = sessions.lifetime();
		ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, value)
				.httpOnly(true)
				.secure(true)
				.sameSite("Lax")
				.path("/")
				.maxAge(lifetime)
				.build();
		response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
	}
}
