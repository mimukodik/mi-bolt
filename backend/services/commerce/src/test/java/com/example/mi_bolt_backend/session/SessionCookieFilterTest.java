package com.example.mi_bolt_backend.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.example.mi_bolt_backend.test.IntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class SessionCookieFilterTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private SessionTokenService tokens;

	@Autowired
	private ShopSessionRepository repository;

	@Test
	void firstSessionScopedRequestSetsCookieWithFullAttributes() throws Exception {
		MvcResult result = mockMvc.perform(get("/cart/__probe"))
				.andExpect(status().isOk())
				.andReturn();
		MockHttpServletResponse response = result.getResponse();

		String setCookie = response.getHeader("Set-Cookie");
		assertNotNull(setCookie, "session-scoped request must issue a Set-Cookie");
		assertCookieAttributes(setCookie);
	}

	@Test
	void twoRequestsWithTheSameCookieSeeTheSameSession() throws Exception {
		MvcResult first = mockMvc.perform(get("/cart/__session"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sessionId").exists())
				.andReturn();
		String cookie = extractCookieValue(first.getResponse().getHeader("Set-Cookie"));
		assertNotNull(cookie, "first request must set the cookie");

		MvcResult second = mockMvc.perform(get("/cart/__session")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isOk())
				.andReturn();

		String firstId = first.getResponse().getContentAsString()
				.replaceAll(".*\"sessionId\":\"|\".*", "");
		String secondId = second.getResponse().getContentAsString()
				.replaceAll(".*\"sessionId\":\"|\".*", "");
		assertEquals(firstId, secondId, "the same cookie must see the same session");
		assertNull(second.getResponse().getHeader("Set-Cookie"),
				"second request with a valid cookie must not issue another Set-Cookie");
	}

	@Test
	void unknownCookieReturnsDifferentSessionAndAFreshSetCookie() throws Exception {
		MvcResult issued = mockMvc.perform(get("/cart/__session"))
				.andExpect(status().isOk())
				.andReturn();
		String firstId = issued.getResponse().getContentAsString()
				.replaceAll(".*\"sessionId\":\"|\".*", "");

		MvcResult replay = mockMvc.perform(get("/cart/__session")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, "definitely-not-a-real-token")))
				.andExpect(status().isOk())
				.andReturn();
		String secondId = replay.getResponse().getContentAsString()
				.replaceAll(".*\"sessionId\":\"|\".*", "");
		assertNotEquals(firstId, secondId, "unknown token must replace with a fresh session");
		String newCookie = replay.getResponse().getHeader("Set-Cookie");
		assertNotNull(newCookie, "unknown token must trigger a fresh Set-Cookie");
		assertNotEquals("definitely-not-a-real-token", extractCookieValue(newCookie));
	}

	@Test
	void publicPathDoesNotIssueCookie() throws Exception {
		MvcResult result = mockMvc.perform(get("/products/__probe").param("echo", "hi"))
				.andExpect(status().isOk())
				.andReturn();
		assertNull(result.getResponse().getHeader("Set-Cookie"),
				"public (catalog) path must not issue a cookie");
	}

	@Test
	void zeroRequestParamFixtureStillRejectsUnknownQueryParameter() throws Exception {
		// /cart/__probe has no @RequestParam so the unknown-query interceptor
		// must still fire: the declared set is empty.
		mockMvc.perform(get("/cart/__probe").param("ghost", "yes"))
				.andExpect(status().isBadRequest());
	}

	@Test
	void storedTokenHashIsNotTheCookieValue() throws Exception {
		MvcResult issued = mockMvc.perform(get("/cart/__probe"))
				.andExpect(status().isOk())
				.andReturn();
		String cookie = extractCookieValue(issued.getResponse().getHeader("Set-Cookie"));
		assertNotNull(cookie);

		String hash = tokens.hash(cookie);
		ShopSession stored = repository.findByTokenHash(hash).orElse(null);
		assertNotNull(stored, "the issued cookie's hash must be stored");
		assertNotEquals(cookie, stored.getTokenHash(),
				"the stored value is the hash, not the cookie value");
	}

	private static void assertCookieAttributes(String setCookie) {
		assertNotNull(setCookie);
		assertEquals(true, setCookie.contains("mibolt_session="), "cookie name missing: " + setCookie);
		assertEquals(true, setCookie.contains("HttpOnly"), "HttpOnly missing: " + setCookie);
		assertEquals(true, setCookie.contains("Secure"), "Secure missing: " + setCookie);
		assertEquals(true, setCookie.contains("SameSite=Lax"), "SameSite=Lax missing: " + setCookie);
		assertEquals(true, setCookie.contains("Path=/"), "Path=/ missing: " + setCookie);
		assertEquals(true, setCookie.contains("Max-Age=2592000"), "Max-Age=2592000 missing: " + setCookie);
	}

	private static String extractCookieValue(String setCookieHeader) {
		if (setCookieHeader == null) {
			return null;
		}
		int eq = setCookieHeader.indexOf('=');
		int semi = setCookieHeader.indexOf(';', eq);
		if (eq < 0 || semi < 0) {
			return null;
		}
		String value = setCookieHeader.substring(eq + 1, semi);
		return value.isBlank() ? null : value;
	}
}
