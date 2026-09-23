package com.example.mi_bolt_backend.admin.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Renders {@link ErrorCode#UNAUTHENTICATED} as the house Problem by handing
 * the {@link DomainException} to MVC's {@link HandlerExceptionResolver}, so
 * {@code ProblemAdvice.handleDomain} ({@code problem/ProblemAdvice.java:58-61})
 * turns it into {@code application/problem+json} with the trace id and a
 * {@code Cache-Control} containing {@code no-store}.
 */
@Component
public class ProblemAuthenticationEntryPoint implements AuthenticationEntryPoint {

	private final HandlerExceptionResolver handlerExceptionResolver;

	public ProblemAuthenticationEntryPoint(
			@Qualifier("handlerExceptionResolver") HandlerExceptionResolver handlerExceptionResolver) {
		this.handlerExceptionResolver = handlerExceptionResolver;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException authException) throws IOException {
		DomainException domain = new DomainException(ErrorCode.UNAUTHENTICATED, "Authentication required");
		handlerExceptionResolver.resolveException(request, response, null, domain);
	}
}