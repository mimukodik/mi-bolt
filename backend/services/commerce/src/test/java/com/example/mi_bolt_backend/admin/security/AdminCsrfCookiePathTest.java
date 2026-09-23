package com.example.mi_bolt_backend.admin.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

import jakarta.servlet.http.Cookie;

class AdminCsrfCookiePathTest {

	// Fails if AdminSecurityConfig drops setCookiePath("/"): the cookie path falls back to the
	// context path /api/v1 and the admin page, served from /, cannot read the token.
	@Test
	void xsrfCookieIsScopedToTheRootUnderTheApiContextPath() {
		CookieCsrfTokenRepository repository = new AdminSecurityConfig().adminCsrfTokenRepository();
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/admin/auth/session");
		request.setContextPath("/api/v1");
		MockHttpServletResponse response = new MockHttpServletResponse();

		repository.saveToken(repository.generateToken(request), request, response);

		Cookie cookie = response.getCookie("XSRF-TOKEN");
		assertThat(cookie).isNotNull();
		assertThat(cookie.getPath()).isEqualTo("/");
		assertThat(cookie.isHttpOnly()).isFalse();
	}
}
