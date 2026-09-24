package com.example.mi_bolt_backend.demo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.DemoAccessApi;
import com.example.mi_bolt_backend.api.model.DemoSessionRequest;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The DemoAccess operations (MIM-423): the cookie check the storefront calls before it
 * shows a page, and the demo sign-in that sets the cookie.
 *
 * <p>{@code /demo/session} is on the gate's open list, so the check re-tests the cookie
 * itself rather than relying on the filter having done it.
 */
@RestController
public class DemoAccessController implements DemoAccessApi {

	private final DemoAccessService demoAccess;
	private final HttpServletRequest request;
	private final HttpServletResponse response;
	private final String cookiePath;

	public DemoAccessController(DemoAccessService demoAccess, HttpServletRequest request,
			HttpServletResponse response, @Value("${server.servlet.context-path}") String cookiePath) {
		this.demoAccess = demoAccess;
		this.request = request;
		this.response = response;
		this.cookiePath = cookiePath;
	}

	@Override
	public ResponseEntity<Void> getDemoSession() {
		if (!demoAccess.isValid(DemoAccessService.readCookie(request))) {
			throw new DomainException(ErrorCode.UNAUTHENTICATED, "Demo access required");
		}
		return ResponseEntity.noContent().build();
	}

	@Override
	public ResponseEntity<Void> createDemoSession(DemoSessionRequest demoSessionRequest) {
		String token = demoAccess.signIn(demoSessionRequest.getPassword());
		ResponseCookie cookie = ResponseCookie.from(DemoAccessService.COOKIE_NAME, token)
				.httpOnly(true)
				.secure(true)
				.sameSite("Lax")
				.path(cookiePath)
				.maxAge(demoAccess.lifetime())
				.build();
		response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
		return ResponseEntity.noContent().build();
	}
}
