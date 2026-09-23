package com.example.mi_bolt_backend.admin.security;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * Chain 2 must leave the shop exactly as before (plan §1.2; ADR 0015).
 * Catalogue and media never see {@code Set-Cookie}; session paths still get
 * {@code mibolt_session} (and only that cookie); no Spring
 * {@code Cache-Control}, {@code X-Frame-Options}, {@code X-Content-Type-Options},
 * {@code Pragma} or {@code Expires} lands on any shop response; cart writes
 * still work without a CSRF token; the media cache header is unchanged.
 */
@IntegrationTest
class PublicChainUnchangedTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void catalogueListHasNoSecurityHeadersAndNoSetCookie() throws Exception {
		mockMvc.perform(get("/products"))
				.andExpect(status().isOk())
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(header().doesNotExist("X-Frame-Options"))
				.andExpect(header().doesNotExist("X-Content-Type-Options"))
				.andExpect(header().doesNotExist("Pragma"))
				.andExpect(header().doesNotExist("Expires"))
				.andExpect(header().string("Cache-Control", not(containsString("no-store"))))
				.andExpect(validAgainstContract());
	}

	@Test
	void catalogueDetailHasNoSecurityHeadersAndNoSetCookie() throws Exception {
		mockMvc.perform(get("/products/samsung-galaxy-s25"))
				.andExpect(status().isOk())
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(header().doesNotExist("X-Frame-Options"))
				.andExpect(header().doesNotExist("X-Content-Type-Options"))
				.andExpect(header().doesNotExist("Pragma"))
				.andExpect(header().doesNotExist("Expires"))
				.andExpect(validAgainstContract());
	}

	@Test
	void mediaReadHasNoSecurityHeadersNoSetCookieAndKeepsImmutableCache() throws Exception {
		String imageId = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";
		mockMvc.perform(get("/media/" + imageId))
				.andExpect(status().isOk())
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(header().doesNotExist("X-Frame-Options"))
				.andExpect(header().doesNotExist("X-Content-Type-Options"))
				.andExpect(header().doesNotExist("Pragma"))
				.andExpect(header().doesNotExist("Expires"))
				.andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"));
	}

	@Test
	void cartGetIssuesOnlyMiboltSessionCookie() throws Exception {
		mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andExpect(header().exists("Set-Cookie"))
				.andExpect(header().string("Set-Cookie", containsString(SessionCookieFilter.COOKIE_NAME + "=")))
				.andExpect(header().string("Set-Cookie", not(containsString("mibolt_admin_session"))))
				.andExpect(header().doesNotExist("X-Frame-Options"))
				.andExpect(header().doesNotExist("X-Content-Type-Options"))
				.andExpect(header().doesNotExist("Pragma"))
				.andExpect(header().doesNotExist("Expires"))
				.andExpect(header().string("Cache-Control", not(containsString("no-store"))));
	}

	@Test
	void cartAddWorksWithoutCsrfTokenAndCarriesOnlyMiboltSessionCookie() throws Exception {
		String cookieValue = newSession();
		mockMvc.perform(post("/cart/items")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"variantId\":\"samsung-galaxy-s25--navy--128\",\"quantity\":1}")
						.header("If-Match", "\"1\"")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookieValue)))
				.andExpect(status().isOk())
				.andExpect(header().string("Set-Cookie", not(containsString("mibolt_admin_session"))))
				.andExpect(header().doesNotExist("X-Frame-Options"))
				.andExpect(header().doesNotExist("X-Content-Type-Options"))
				.andExpect(header().doesNotExist("Pragma"))
				.andExpect(header().doesNotExist("Expires"))
				.andExpect(header().string("Cache-Control", not(containsString("no-store"))))
				.andExpect(jsonPath("$.items[0].variantId").value("samsung-galaxy-s25--navy--128"))
				.andExpect(validAgainstContract());
	}

	private String newSession() throws Exception {
		String setCookie = mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andReturn().getResponse().getHeader("Set-Cookie");
		int eq = setCookie.indexOf('=');
		int semi = setCookie.indexOf(';', eq);
		return setCookie.substring(eq + 1, semi);
	}
}