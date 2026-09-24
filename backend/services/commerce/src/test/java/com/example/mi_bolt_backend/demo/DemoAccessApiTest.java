package com.example.mi_bolt_backend.demo;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.session.SessionTokenService;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * The two DemoAccess operations against the real chain (MIM-423): the sign-in that sets
 * {@code mibolt_demo_access} and the cookie check the storefront calls. Every request
 * carries the default demo cookie unless the case sets one of its own.
 */
@IntegrationTest
class DemoAccessApiTest {

	private static final String COOKIE = DemoAccessService.COOKIE_NAME;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private DemoAccessSessionRepository sessions;

	@Autowired
	private SessionTokenService tokens;

	// Fails if DemoAccessController#createDemoSession stops building the ResponseCookie
	// from mibolt.demo.access-lifetime, or drops one of its attributes.
	@Test
	void signInWithTheDemoPasswordIs204AndSetsTheCookie() throws Exception {
		mockMvc.perform(post("/demo/session")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"password\":\"1MiBoltDemo1\"}"))
				.andExpect(status().isNoContent())
				.andExpect(header().string("Set-Cookie", containsString(COOKIE + "=")))
				.andExpect(header().string("Set-Cookie", containsString("Path=/api/v1")))
				.andExpect(header().string("Set-Cookie", containsString("Max-Age=2592000")))
				.andExpect(header().string("Set-Cookie", containsString("HttpOnly")))
				.andExpect(header().string("Set-Cookie", containsString("Secure")))
				.andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
				.andExpect(validAgainstContract());
	}

	// Fails if DemoAccessService#signIn stops throwing UNAUTHENTICATED on a password mismatch.
	@Test
	void signInWithAWrongPasswordIs401WithoutACookie() throws Exception {
		mockMvc.perform(post("/demo/session")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"password\":\"not-the-demo-password\"}"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void signInWithAnEmptyPasswordIs422() throws Exception {
		mockMvc.perform(post("/demo/session")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"password\":\"\"}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/password"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("SIZE"));
		// The request breaks the schema's minLength on purpose, so the interaction validator would reject the request itself.
	}

	@Test
	void signInWithoutAPasswordIs400() throws Exception {
		mockMvc.perform(post("/demo/session")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		// The request breaks the schema's required on purpose, so the interaction validator would reject the request itself.
	}

	@Test
	void signInWithAnUnknownMemberIs400() throws Exception {
		mockMvc.perform(post("/demo/session")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"password\":\"1MiBoltDemo1\",\"username\":\"MiBoltDemoUser\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		// The request breaks the schema's additionalProperties on purpose, so the interaction validator would reject the request itself.
	}

	@Test
	void sessionCheckWithTheDefaultCookieIs204() throws Exception {
		mockMvc.perform(get("/demo/session"))
				.andExpect(status().isNoContent())
				.andExpect(validAgainstContract());
	}

	// Fails if DemoAccessService#isValid stops looking the token hash up.
	@Test
	void sessionCheckWithAnUnknownTokenIs401() throws Exception {
		mockMvc.perform(get("/demo/session")
						.cookie(new Cookie(COOKIE, "not-a-real-token")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract());
	}

	// Fails if DemoAccessService#isValid stops comparing getExpiresAt() against now.
	@Test
	void sessionCheckWithAnExpiredTokenIs401() throws Exception {
		sessions.save(new DemoAccessSession(tokens.hash("expired-demo-token"),
				OffsetDateTime.now().minusDays(31), OffsetDateTime.now().minusDays(1)));

		mockMvc.perform(get("/demo/session")
						.cookie(new Cookie(COOKIE, "expired-demo-token")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

	// Fails if DemoAccessService#signIn stops storing the session its cookie names.
	@Test
	void theSignInCookieOpensTheCatalogue() throws Exception {
		String value = signIn();

		mockMvc.perform(get("/products")
						.cookie(new Cookie(COOKIE, value)))
				.andExpect(status().isOk())
				.andExpect(validAgainstContract());
	}

	private String signIn() throws Exception {
		String setCookie = mockMvc.perform(post("/demo/session")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"password\":\"1MiBoltDemo1\"}"))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getHeader("Set-Cookie");
		int eq = setCookie.indexOf('=');
		int semi = setCookie.indexOf(';', eq);
		return setCookie.substring(eq + 1, semi);
	}
}
