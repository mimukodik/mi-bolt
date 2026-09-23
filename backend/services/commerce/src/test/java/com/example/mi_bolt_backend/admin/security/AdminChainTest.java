package com.example.mi_bolt_backend.admin.security;

import static com.example.mi_bolt_backend.test.ContractValidation.JSON;
import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.example.mi_bolt_backend.admin.user.AdminAuthController;
import com.example.mi_bolt_backend.api.model.ProblemCode;
import com.example.mi_bolt_backend.problem.TraceIdFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * Chain 1 must answer 401 {@code UNAUTHENTICATED} on a missing or invalid
 * session and 403 {@code CSRF_TOKEN_INVALID} on a missing token, both as
 * house Problems whose {@code traceId} equals the {@code X-Trace-Id}
 * header and is not the all-zero fallback. Admin responses carry Spring's
 * {@code Cache-Control: no-store}.
 */
@IntegrationTest
class AdminChainTest {

	private static final String ADMIN_COOKIE = "mibolt_admin_session";

	@Autowired
	private MockMvc mockMvc;

	@Test
	void getAdminUsersWithoutSessionIs401Unauthenticated() throws Exception {
		MvcResult result = mockMvc.perform(get("/admin/users")
						.cookie(new Cookie(ADMIN_COOKIE, "not-a-real-session")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value(ProblemCode.UNAUTHENTICATED.name()))
				.andExpect(jsonPath("$.traceId").value(not("000000000000000000000000")))
				.andExpect(header().string(TraceIdFilter.RESPONSE_HEADER, not("000000000000000000000000")))
				.andExpect(validAgainstContract())
				.andReturn();

		String bodyTraceId = JSON.readTree(result.getResponse().getContentAsString())
				.get("traceId").asString();
		String headerTraceId = result.getResponse().getHeader(TraceIdFilter.RESPONSE_HEADER);
		assertThat(bodyTraceId).isEqualTo(headerTraceId);
	}

	@Test
	void postAdminUsersWithoutCsrfTokenIs403CsrfTokenInvalid() throws Exception {
		mockMvc.perform(post("/admin/users")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\":\"alpha\"}")
						.cookie(new Cookie(ADMIN_COOKIE, "not-a-real-session")))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value(ProblemCode.CSRF_TOKEN_INVALID.name()))
				.andExpect(validAgainstContract());
	}

	@Test
	void getAdminUsers401ResponseCarriesNoStoreCacheControl() throws Exception {
		mockMvc.perform(get("/admin/users")
						.cookie(new Cookie(ADMIN_COOKIE, "not-a-real-session")))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("Cache-Control", containsString("no-store")));
	}

	@Test
	void getAdminAuthSessionIsAnsweredPastSecurity() throws Exception {
		mockMvc.perform(get("/admin/auth/session"))
				.andExpect(status().isUnauthorized())
				.andExpect(handler().handlerType(AdminAuthController.class));
	}
}