package com.example.mi_bolt_backend.admin.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.MissingCsrfTokenException;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

class ProblemAccessDeniedHandlerTest {

	private DomainException captured;

	@Test
	void missingCsrfTokenIsReportedAsCsrfTokenInvalidAndKeepsTheSession() throws Exception {
		HandlerExceptionResolver resolver = capturingResolver();
		ProblemAccessDeniedHandler handler = new ProblemAccessDeniedHandler(resolver);
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/admin/users");
		HttpSession session = request.getSession(true);
		MockHttpServletResponse response = new MockHttpServletResponse();

		handler.handle(request, response,
				new AccessDeniedException("missing", new MissingCsrfTokenException("expected")));

		assertThat(captured.code()).isEqualTo(ErrorCode.CSRF_TOKEN_INVALID);
		assertThat(session).isNotNull();
		assertThat(request.getSession(false)).isNotNull();
	}

	@Test
	void plainAccessDeniedInvalidatesTheSessionAndReportsUnauthenticated() throws Exception {
		HandlerExceptionResolver resolver = capturingResolver();
		ProblemAccessDeniedHandler handler = new ProblemAccessDeniedHandler(resolver);
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/admin/users");
		HttpSession session = request.getSession(true);
		MockHttpServletResponse response = new MockHttpServletResponse();

		handler.handle(request, response, new AccessDeniedException("forbidden"));

		assertThat(captured.code()).isEqualTo(ErrorCode.UNAUTHENTICATED);
		assertThat(session).isNotNull();
		assertThat(request.getSession(false)).isNull();
	}

	@Test
	void csrfExceptionInsideTheChainStillReportsCsrfTokenInvalid() throws Exception {
		HandlerExceptionResolver resolver = capturingResolver();
		ProblemAccessDeniedHandler handler = new ProblemAccessDeniedHandler(resolver);
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/admin/users");
		MockHttpServletResponse response = new MockHttpServletResponse();

		handler.handle(request, response,
				new AccessDeniedException("denied", new CsrfException("invalid token")));

		assertThat(captured.code()).isEqualTo(ErrorCode.CSRF_TOKEN_INVALID);
	}

	private HandlerExceptionResolver capturingResolver() {
		return new HandlerExceptionResolver() {
			@Override
			public ModelAndView resolveException(HttpServletRequest request,
					HttpServletResponse response, Object handler, Exception ex) {
				captured = (DomainException) ex;
				return new ModelAndView();
			}
		};
	}
}