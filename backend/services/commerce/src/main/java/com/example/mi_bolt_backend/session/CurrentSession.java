package com.example.mi_bolt_backend.session;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Request-scoped access to the {@link ShopSession} the filter resolved for the
 * current request.
 *
 * <p>The filter stores the loaded session in a request attribute because Spring's
 * request scope proxy is set up after the filter chain runs; tests can rely on
 * {@link #get(HttpServletRequest)} from controllers and other downstream code.
 */
public final class CurrentSession {

	public static final String ATTRIBUTE = CurrentSession.class.getName() + ".shopSession";

	private CurrentSession() {
	}

	public static ShopSession get(HttpServletRequest request) {
		Object value = request.getAttribute(ATTRIBUTE);
		return value instanceof ShopSession session ? session : null;
	}

	public static void set(HttpServletRequest request, ShopSession session) {
		request.setAttribute(ATTRIBUTE, session);
	}
}
