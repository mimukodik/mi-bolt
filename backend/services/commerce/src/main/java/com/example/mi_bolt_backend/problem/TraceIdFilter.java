package com.example.mi_bolt_backend.problem;

import java.io.IOException;
import java.security.SecureRandom;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Generates a per-request trace id, exposes it as a request attribute, mirrors it
 * in the SLF4J MDC under {@code traceId}, and echoes it on the response.
 *
 * <p>The id is a hex-encoded 12-byte random value (24 characters) — short enough
 * to log and copy-paste, large enough that collisions are not a concern.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

	public static final String ATTRIBUTE = "mibolt.traceId";
	public static final String MDC_KEY = "traceId";
	public static final String RESPONSE_HEADER = "X-Trace-Id";

	private static final SecureRandom RANDOM = new SecureRandom();

	@Override
	protected void doFilterInternal(HttpServletRequest request,
			HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String traceId = generateTraceId();
		request.setAttribute(ATTRIBUTE, traceId);
		MDC.put(MDC_KEY, traceId);
		response.setHeader(RESPONSE_HEADER, traceId);
		try {
			filterChain.doFilter(request, response);
		}
		finally {
			MDC.remove(MDC_KEY);
		}
	}

	private static String generateTraceId() {
		byte[] bytes = new byte[12];
		RANDOM.nextBytes(bytes);
		StringBuilder hex = new StringBuilder(bytes.length * 2);
		for (byte b : bytes) {
			hex.append(String.format("%02x", b));
		}
		return hex.toString();
	}
}
