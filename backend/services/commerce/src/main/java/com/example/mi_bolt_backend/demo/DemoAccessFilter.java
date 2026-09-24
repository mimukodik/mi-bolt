package com.example.mi_bolt_backend.demo;

import java.io.IOException;
import java.util.Set;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Refuses every request inside the context that carries no valid
 * {@code mibolt_demo_access} cookie and is not on an open prefix (MIM-423), answering the
 * house 401 {@code UNAUTHENTICATED} Problem.
 *
 * <p>Deny by default: {@code /admin}, {@code /demo/session} and
 * {@code /actuator} are open — each as the path itself or as the path followed by a
 * segment — and every other path in the context needs the cookie, so a path added later
 * is gated without anyone remembering to list it. The refusal goes through the MVC
 * {@link HandlerExceptionResolver}, exactly as {@code ProblemAuthenticationEntryPoint}
 * renders the admin chain's 401, so the body carries the trace id and the
 * {@code application/problem+json} content type. Runs after {@code problem/TraceIdFilter}
 * ({@code HIGHEST_PRECEDENCE}) so the refusal has a trace id, and before
 * {@code session/SessionCookieFilter} ({@code HIGHEST_PRECEDENCE + 10}) so a refused
 * request is never issued a {@code mibolt_session}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class DemoAccessFilter extends OncePerRequestFilter {

	private static final Set<String> OPEN_PREFIXES = Set.of("/admin", "/demo/session", "/actuator");

	private final DemoAccessService demoAccess;

	private final HandlerExceptionResolver handlerExceptionResolver;

	public DemoAccessFilter(DemoAccessService demoAccess,
			@Qualifier("handlerExceptionResolver") HandlerExceptionResolver handlerExceptionResolver) {
		this.demoAccess = demoAccess;
		this.handlerExceptionResolver = handlerExceptionResolver;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = pathWithinContext(request);
		for (String prefix : OPEN_PREFIXES) {
			if (path.equals(prefix) || path.startsWith(prefix + "/")) {
				return true;
			}
		}
		return false;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		if (demoAccess.isValid(DemoAccessService.readCookie(request))) {
			filterChain.doFilter(request, response);
			return;
		}
		handlerExceptionResolver.resolveException(request, response, null,
				new DomainException(ErrorCode.UNAUTHENTICATED, "Demo access required"));
	}

	private static String pathWithinContext(HttpServletRequest request) {
		String context = request.getContextPath();
		String uri = request.getRequestURI();
		if (context != null && !context.isEmpty() && uri.startsWith(context)) {
			return uri.substring(context.length());
		}
		return uri;
	}
}
