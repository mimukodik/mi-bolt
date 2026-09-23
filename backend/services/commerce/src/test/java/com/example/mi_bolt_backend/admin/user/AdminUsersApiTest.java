package com.example.mi_bolt_backend.admin.user;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.ContractValidation;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * The three {@code AdminUsers} operations against the real security chain: list,
 * create with a generated password, and delete, with the signed-in admin as the
 * caller (MIM-326).
 */
@IntegrationTest
class AdminUsersApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AdminUserRepository adminUserRepository;

	@AfterEach
	void cleanup() {
		List<AdminUser> toDelete = adminUserRepository.findAll().stream()
				.filter(admin -> !AdminLogin.USERNAME.equals(admin.username()))
				.toList();
		adminUserRepository.deleteAll(toDelete);
	}

	// Fails if AdminUsersController#listAdminUsers stops delegating to AdminUserService#list.
	@Test
	void listReturnsEveryAdmin() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/users").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[*].username").value(Matchers.hasItem("admin")))
				.andExpect(jsonPath("$[0].id").exists())
				.andExpect(jsonPath("$[0].createdAt").exists())
				.andExpect(validAgainstContract());
	}

	// Fails if AdminUsersApi#listAdminUsers stops requiring the adminSession security scheme.
	@Test
	void listWithoutSessionIs401() throws Exception {
		mockMvc.perform(get("/admin/users"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

	// Fails if UnknownQueryParameterInterceptor stops rejecting an undeclared query key on GET /admin/users.
	@Test
	void listWithAnUnknownQueryParameterIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/users").with(signed).param("page", "1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("page"));
		// The request adds an undeclared query key on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if AdminUserService#create stops hashing the generated password before saving it.
	@Test
	void createReturnsTheGeneratedPasswordAndItSignsIn() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		MvcResult result = mockMvc.perform(post("/admin/users")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(Map.of("username", "bea"))))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.user.username").value("bea"))
				.andExpect(jsonPath("$.user.id").exists())
				.andExpect(jsonPath("$.generatedPassword").value(Matchers.matchesPattern("^[A-Za-z0-9_-]{24}$")))
				.andExpect(validAgainstContract())
				.andReturn();

		String generatedPassword = ContractValidation.JSON.readTree(result.getResponse().getContentAsString())
				.get("generatedPassword").asText();

		AdminLogin.signIn(mockMvc, "bea", generatedPassword);
	}

	// Fails if AdminUserService#create stops checking existsByUsername before saving.
	@Test
	void createWithATakenUsernameIs409() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/users")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(Map.of("username", "admin"))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("USERNAME_TAKEN"))
				.andExpect(jsonPath("$.detail").value("Username already taken"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminUserCreateRequest#username stops carrying both @Pattern and @Size(max = 80).
	@Test
	void createWithAnOverlongUsernameIs422PatternAndSize() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String username = "A".repeat(90);

		mockMvc.perform(post("/admin/users")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(Map.of("username", username))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors.length()").value(2))
				.andExpect(jsonPath("$.fieldErrors[*].code").value(Matchers.containsInAnyOrder("PATTERN", "SIZE")))
				.andExpect(jsonPath("$.fieldErrors[*].path").value(Matchers.everyItem(Matchers.is("/username"))));
		// The request breaks the contract's maxLength and pattern on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if AdminUserCreateRequest#username stops carrying @NotNull.
	@Test
	void createWithNoUsernameIs400MissingRequiredMember() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/users")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Missing required member"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/username"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("REQUIRED"));
		// The request drops the required member on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if AdminUserCreateRequest stops rejecting an unrecognised member (additionalProperties: false).
	@Test
	void createWithAnUnknownMemberIs400MalformedBody() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/users")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\":\"bea\",\"role\":\"x\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Malformed request body"));
		// The request adds an undeclared member on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if AdminSecurityConfig#adminFilterChain drops csrf.spa() enforcement on POST /admin/users.
	@Test
	void createWithoutXsrfHeaderIs403() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/users")
						.session(signed.session())
						.cookie(new Cookie(AdminLogin.SESSION_COOKIE, signed.session().getId()),
								new Cookie(AdminLogin.XSRF_COOKIE, signed.xsrfToken()))
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(Map.of("username", "bea"))))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
	}

	// Fails if AdminUserService#delete stops removing the entity on the happy path.
	@Test
	void deleteRemovesTheAdmin() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		MvcResult created = mockMvc.perform(post("/admin/users")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(Map.of("username", "bea"))))
				.andExpect(status().isCreated())
				.andReturn();
		String beaId = ContractValidation.JSON.readTree(created.getResponse().getContentAsString())
				.get("user").get("id").asText();

		mockMvc.perform(delete("/admin/users/{adminId}", beaId).with(signed))
				.andExpect(status().isNoContent())
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/admin/users").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[*].username").value(Matchers.not(Matchers.hasItem("bea"))))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminUserService#delete stops rejecting adminId.equals(callerId) before any lookup.
	@Test
	void deleteYourselfIs409AdminSelfDelete() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		UUID selfId = adminUserRepository.findByUsername(AdminLogin.USERNAME).orElseThrow().id();

		mockMvc.perform(delete("/admin/users/{adminId}", selfId).with(signed))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ADMIN_SELF_DELETE"))
				.andExpect(jsonPath("$.detail").value("The signed-in admin cannot be deleted"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminUserService#delete's findById.orElseThrow stops carrying the adminId in params.
	@Test
	void deleteAnUnknownAdminIs404() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		UUID unknownId = UUID.fromString("00000000-0000-4000-8000-00000000abcd");

		mockMvc.perform(delete("/admin/users/{adminId}", unknownId).with(signed))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.detail").value("Resource not found"))
				.andExpect(jsonPath("$.params.adminId").value(unknownId.toString()))
				.andExpect(validAgainstContract());
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam stops handling a path value that does not convert to UUID.
	@Test
	void deleteWithANonUuidPathValueIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(delete("/admin/users/{adminId}", "not-a-uuid").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("adminId"))
				.andExpect(jsonPath("$.params.reason").value("type UUID"));
		// The path value breaks the contract's uuid format on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if Spring's UUID path conversion stops parsing case-insensitively.
	@Test
	void deleteYourselfUpperCasedIdIsStillAdminSelfDelete() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		UUID selfId = adminUserRepository.findByUsername(AdminLogin.USERNAME).orElseThrow().id();

		mockMvc.perform(delete("/admin/users/{adminId}", selfId.toString().toUpperCase(Locale.ROOT)).with(signed))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ADMIN_SELF_DELETE"))
				.andExpect(validAgainstContract());
	}

	// Fails if LiveAdminAuthorizationManager stops denying DELETE /admin/users/{adminId} without a live session.
	@Test
	void deleteWithoutSessionIs401() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);
		UUID anyId = UUID.randomUUID();

		mockMvc.perform(delete("/admin/users/{adminId}", anyId)
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf))
						.header(AdminLogin.XSRF_HEADER, xsrf))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}
}
