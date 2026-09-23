package com.example.mi_bolt_backend.test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import jakarta.servlet.http.Cookie;

/**
 * Signs an admin in through the real endpoints for API tests: primes the XSRF cookie,
 * logs in with a fresh session and returns what later requests need.
 */
public final class AdminLogin {

	public static final String USERNAME = "admin";
	public static final String PASSWORD = "integration-admin-password";
	public static final String SESSION_COOKIE = "mibolt_admin_session";
	public static final String XSRF_COOKIE = "XSRF-TOKEN";
	public static final String XSRF_HEADER = "X-XSRF-TOKEN";

	private AdminLogin() {
	}

	public static String primeXsrf(MockMvc mockMvc) throws Exception {
		MvcResult result = mockMvc.perform(get("/admin/auth/session")).andReturn();
		return lastXsrf(result);
	}

	/**
	 * The value of the last {@code XSRF-TOKEN} cookie on the response with a non-empty
	 * value. A login response carries a clearing cookie before the new one, so
	 * {@code MockHttpServletResponse#getCookie} would return the wrong one.
	 */
	public static String lastXsrf(MvcResult result) {
		Cookie[] cookies = result.getResponse().getCookies();
		for (int i = cookies.length - 1; i >= 0; i--) {
			if (XSRF_COOKIE.equals(cookies[i].getName()) && !cookies[i].getValue().isEmpty()) {
				return cookies[i].getValue();
			}
		}
		throw new IllegalStateException("no XSRF-TOKEN cookie on the response");
	}

	public static Signed signIn(MockMvc mockMvc) throws Exception {
		return signIn(mockMvc, USERNAME, PASSWORD);
	}

	public static Signed signIn(MockMvc mockMvc, String username, String password) throws Exception {
		String xsrf = primeXsrf(mockMvc);
		MockHttpSession session = new MockHttpSession();
		MvcResult result = mockMvc.perform(post("/admin/auth/login")
						.session(session)
						.cookie(new Cookie(XSRF_COOKIE, xsrf))
						.header(XSRF_HEADER, xsrf)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(Map.of("username", username, "password", password))))
				.andExpect(status().isOk())
				.andReturn();
		return new Signed(session, lastXsrf(result));
	}

	/**
	 * The session cookie is for the contract validator, which checks the
	 * {@code adminSession} scheme; MockMvc itself resolves the session from
	 * {@link MockHttpServletRequest#setSession}.
	 */
	public record Signed(MockHttpSession session, String xsrfToken) implements RequestPostProcessor {

		@Override
		public MockHttpServletRequest postProcessRequest(MockHttpServletRequest request) {
			request.setSession(session);
			request.setCookies(new Cookie(SESSION_COOKIE, session.getId()), new Cookie(XSRF_COOKIE, xsrfToken));
			request.addHeader(XSRF_HEADER, xsrfToken);
			return request;
		}
	}
}
