package com.example.mi_bolt_backend.problem;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import jakarta.servlet.DispatcherType;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Rejects requests whose query parameters include names the handler does not
 * declare (contracts/commerce/kommunikacio.md 5.1 and 5.3; docs/02-backend.md 4.1/8). Spring's default behaviour is to ignore
 * them silently, which the contract forbids. A handler that declares zero
 * {@code @RequestParam}s is treated as declaring the empty set — every
 * query parameter on the request is unknown.
 *
 * <p>The interceptor does not run on error dispatches (Spring forwards a
 * failed request to {@code /error} via the {@code ERROR} dispatcher type,
 * and no handler at that endpoint declares {@code @RequestParam}s).
 * OPTIONS preflights are also skipped so CORS preflight requests do not
 * get rejected for their own query string.
 */
@Component
public class UnknownQueryParameterInterceptor implements HandlerInterceptor {

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		if (request.getDispatcherType() != DispatcherType.REQUEST) {
			return true;
		}
		if (HttpMethod.OPTIONS.matches(request.getMethod())) {
			return true;
		}
		if (!(handler instanceof HandlerMethod method)) {
			return true;
		}
		Set<String> declared = declaredParameterNames(method);
		Map<String, String[]> params = request.getParameterMap();
		for (String name : params.keySet()) {
			if (!declared.contains(name)) {
				throw new UnknownQueryParameterException(name);
			}
		}
		return true;
	}

	private static Set<String> declaredParameterNames(HandlerMethod method) {
		Set<String> names = new LinkedHashSet<>();
		MethodParameter[] parameters = method.getMethodParameters();
		for (MethodParameter p : parameters) {
			RequestParam annotation = p.getParameterAnnotation(RequestParam.class);
			if (annotation != null && annotation.name() != null && !annotation.name().isEmpty()) {
				names.add(annotation.name());
			}
		}
		return names;
	}
}
