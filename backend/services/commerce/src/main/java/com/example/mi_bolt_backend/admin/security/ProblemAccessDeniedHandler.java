package com.example.mi_bolt_backend.admin.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.MissingCsrfTokenException;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Renders access-denied failures as house Problems. {@link CsrfException}
 * (covers both {@link MissingCsrfTokenException} and the invalid-token case)
 * becomes 403 {@code CSRF_TOKEN_INVALID}; any other denial — typically an
 * authenticated principal whose {@code admin_user} row has been deleted —
 * invalidates the session and answers 401 {@code UNAUTHENTICATED} (plan §1.4).
 */
@Component
public class ProblemAccessDeniedHandler implements AccessDeniedHandler {

	private final HandlerExceptionResolver handlerExceptionResolver;

	public ProblemAccessDeniedHandler(
			@Qualifier("handlerExceptionResolver") HandlerExceptionResolver handlerExceptionResolver) {
		this.handlerExceptionResolver = handlerExceptionResolver;
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response,
			AccessDeniedException accessDeniedException) throws IOException {
		DomainException domain;
		if (isCsrfFailure(accessDeniedException)) {
			domain = new DomainException(ErrorCode.CSRF_TOKEN_INVALID, "CSRF token missing or invalid");
		}
		else {
			invalidateSession(request);
			domain = new DomainException(ErrorCode.UNAUTHENTICATED, "Authentication required");
		}
		handlerExceptionResolver.resolveException(request, response, null, domain);
	}

	private static boolean isCsrfFailure(AccessDeniedException ex) {
		Throwable current = ex;
		while (current != null) {
			if (current instanceof CsrfException || current instanceof MissingCsrfTokenException) {
				return true;
			}
			current = current.getCause();
		}
		return false;
	}

	private static void invalidateSession(HttpServletRequest request) {
		HttpSession existing = request.getSession(false);
		if (existing != null) {
			existing.invalidate();
		}
	}
}