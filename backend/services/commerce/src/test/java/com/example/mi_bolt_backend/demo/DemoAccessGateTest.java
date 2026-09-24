package com.example.mi_bolt_backend.demo;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.admin.user.AdminAuthController;
import com.example.mi_bolt_backend.problem.TraceIdFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * The demo gate's frontier (MIM-423): every shop path is refused without a valid cookie,
 * the open prefixes are not, and a refusal is a Problem that carries no
 * {@code Set-Cookie}. Each request carries {@code NOT_VALID} rather than no cookie at
 * all, so the contract validator's presence check passes and the gate's own value check
 * is the thing being measured.
 */
@IntegrationTest
class DemoAccessGateTest {

	private static final Cookie NOT_VALID = new Cookie(DemoAccessService.COOKIE_NAME, "not-a-real-token");

	@Autowired
	private MockMvc mockMvc;

	@ParameterizedTest
	@ValueSource(strings = {"/products", "/products/samsung-galaxy-s25", "/products/samsung-galaxy-s25/related",
			"/cart", "/checkout", "/checkout/options", "/orders/nope", "/payment-intents/nope", "/no-such-path"})
	void everyGatedGetWithoutDemoAccessIs401(String path) throws Exception {
		mockMvc.perform(get(path).cookie(NOT_VALID))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
				.andExpect(header().exists(TraceIdFilter.RESPONSE_HEADER))
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	void catalogueWithoutDemoAccessPassesTheContract() throws Exception {
		mockMvc.perform(get("/products").cookie(NOT_VALID))
				.andExpect(status().isUnauthorized())
				.andExpect(validAgainstContract());
	}

	@Test
	void cartWithoutDemoAccessPassesTheContract() throws Exception {
		mockMvc.perform(get("/cart")
						.cookie(NOT_VALID, new Cookie("mibolt_session", "not-a-real-session")))
				.andExpect(status().isUnauthorized())
				.andExpect(validAgainstContract());
	}

	// Fails if DemoAccessFilter's @Order moves above session/SessionCookieFilter: the
	// refusal would then carry the mibolt_session the filter issues.
	@Test
	void cartWriteWithoutDemoAccessIs401AndIssuesNoSession() throws Exception {
		mockMvc.perform(post("/cart/items")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"variantId\":\"samsung-galaxy-s25--navy--128\",\"quantity\":1}")
						.header("If-Match", "\"1\"")
						.cookie(NOT_VALID))
				.andExpect(status().isUnauthorized())
				.andExpect(header().doesNotExist("Set-Cookie"));
	}

	@Test
	void mediaWithoutDemoAccessIs401AndPassesTheContract() throws Exception {
		mockMvc.perform(get("/media/0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8")
						.cookie(NOT_VALID))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void readinessIsOpenWithoutDemoAccess() throws Exception {
		mockMvc.perform(get("/actuator/health/readiness").cookie(NOT_VALID))
				.andExpect(status().isOk());
	}

	// Fails if /admin leaves DemoAccessFilter's open prefixes: the gate would answer the
	// refusal and the admin chain would never reach its own entry point.
	@Test
	void adminIsNotBehindTheDemoGate() throws Exception {
		mockMvc.perform(get("/admin/auth/session").cookie(NOT_VALID))
				.andExpect(status().isUnauthorized())
				.andExpect(handler().handlerType(AdminAuthController.class));
	}

	@Test
	void signInIsOpenWithoutDemoAccess() throws Exception {
		mockMvc.perform(post("/demo/session")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"password\":\"1MiBoltDemo1\"}")
						.cookie(NOT_VALID))
				.andExpect(status().isNoContent());
	}
}
