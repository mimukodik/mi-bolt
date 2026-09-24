package com.example.mi_bolt_backend.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerExceptionResolver;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

import jakarta.servlet.http.Cookie;

/**
 * The gate's path decision and its refusal, without a Spring context (MIM-423): the same
 * filter is driven over {@code /api/v1} as the context path, so the prefix matching is
 * measured against the paths a real request carries.
 */
class DemoAccessFilterTest {

	private DemoAccessService demoAccess;

	private HandlerExceptionResolver resolver;

	private DemoAccessFilter filter;

	@BeforeEach
	void setUp() {
		demoAccess = mock(DemoAccessService.class);
		resolver = mock(HandlerExceptionResolver.class);
		filter = new DemoAccessFilter(demoAccess, resolver);
	}

	// Fails if DemoAccessFilter#doFilterInternal's refusal branch is removed.
	@Test
	void aGatedRequestWithoutACookieIsRefused() throws Exception {
		MockHttpServletRequest request = request("/products");
		MockHttpServletResponse response = new MockHttpServletResponse();
		MockFilterChain chain = new MockFilterChain();

		filter.doFilter(request, response, chain);

		assertThat(chain.getRequest()).isNull();
		verify(resolver).resolveException(eq(request), eq(response), isNull(), argThat(
				ex -> ex instanceof DomainException domain && domain.code() == ErrorCode.UNAUTHENTICATED));
	}

	// Fails if DemoAccessService#readCookie stops treating a blank value as absent.
	@Test
	void aBlankCookieIsRefused() throws Exception {
		MockHttpServletRequest request = request("/cart");
		request.setCookies(new Cookie(DemoAccessService.COOKIE_NAME, ""));
		MockHttpServletResponse response = new MockHttpServletResponse();
		MockFilterChain chain = new MockFilterChain();

		filter.doFilter(request, response, chain);

		assertThat(chain.getRequest()).isNull();
		verify(demoAccess).isValid(null);
		verify(resolver).resolveException(eq(request), eq(response), isNull(), argThat(
				ex -> ex instanceof DomainException domain && domain.code() == ErrorCode.UNAUTHENTICATED));
	}

	@Test
	void aValidCookiePasses() throws Exception {
		MockHttpServletRequest request = request("/products");
		request.setCookies(new Cookie(DemoAccessService.COOKIE_NAME, "good"));
		when(demoAccess.isValid("good")).thenReturn(true);
		MockHttpServletResponse response = new MockHttpServletResponse();
		MockFilterChain chain = new MockFilterChain();

		filter.doFilter(request, response, chain);

		assertThat(chain.getRequest()).isNotNull();
		verifyNoInteractions(resolver);
	}

	@ParameterizedTest
	@ValueSource(strings = {"/admin", "/admin/users", "/demo/session", "/media/abc", "/actuator/health/readiness"})
	void openPathsSkipTheGate(String path) throws Exception {
		MockHttpServletRequest request = request(path);
		MockHttpServletResponse response = new MockHttpServletResponse();
		MockFilterChain chain = new MockFilterChain();

		filter.doFilter(request, response, chain);

		assertThat(chain.getRequest()).isNotNull();
		verifyNoInteractions(demoAccess, resolver);
	}

	// Deny by default: a path that only starts with an open prefix is still gated.
	@ParameterizedTest
	@ValueSource(strings = {"/administrator", "/demo/sessions", "/mediafoo", "/"})
	void lookAlikePathsAreGated(String path) throws Exception {
		MockHttpServletRequest request = request(path);
		MockHttpServletResponse response = new MockHttpServletResponse();
		MockFilterChain chain = new MockFilterChain();

		filter.doFilter(request, response, chain);

		assertThat(chain.getRequest()).isNull();
		verify(resolver).resolveException(eq(request), eq(response), isNull(), argThat(
				ex -> ex instanceof DomainException domain && domain.code() == ErrorCode.UNAUTHENTICATED));
	}

	private static MockHttpServletRequest request(String path) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setContextPath("/api/v1");
		request.setRequestURI("/api/v1" + path);
		return request;
	}
}
