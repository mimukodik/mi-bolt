package com.example.mi_bolt_backend.admin.user;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.example.mi_bolt_backend.admin.security.AdminPrincipal;
import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.ContractValidation;
import com.example.mi_bolt_backend.test.IntegrationTest;
import tools.jackson.databind.node.ObjectNode;

import jakarta.servlet.http.Cookie;

/**
 * The four {@code AdminAuth} operations against the real security chain: sign-in,
 * sign-out, the session read and the own password change (MIM-325).
 */
@IntegrationTest
class AdminAuthApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AdminUserRepository adminUserRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	private final List<UUID> created = new ArrayList<>();

	@AfterEach
	void restore() {
		for (UUID id : created) {
			adminUserRepository.findById(id).ifPresent(adminUserRepository::delete);
		}
		created.clear();
		AdminUser admin = adminUserRepository.findByUsername(AdminLogin.USERNAME).orElseThrow();
		if (!passwordEncoder.matches(AdminLogin.PASSWORD, admin.passwordHash())) {
			admin.setPasswordHash(passwordEncoder.encode(AdminLogin.PASSWORD));
			adminUserRepository.saveAndFlush(admin);
		}
	}

	// Fails if AdminAuthController#getAdminSession's issueXsrfToken() call is removed:
	// the 401 stays correct but the response carries no XSRF-TOKEN cookie.
	@Test
	void anonymousSessionIs401AndIssuesTheXsrfCookie() throws Exception {
		MvcResult result = mockMvc.perform(get("/admin/auth/session"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract())
				.andReturn();

		Cookie xsrf = result.getResponse().getCookie("XSRF-TOKEN");
		assertThat(xsrf).isNotNull();
		assertThat(xsrf.getValue()).isNotEmpty();
		assertThat(xsrf.getPath()).isEqualTo("/");
	}

	// Fails if AdminSecurityConfig#adminFilterChain drops csrf.spa() enforcement on
	// POST /admin/auth/login (admin/security, read-first).
	@Test
	void loginWithoutXsrfTokenIs403CsrfTokenInvalid() throws Exception {
		mockMvc.perform(post("/admin/auth/login")
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("username", AdminLogin.USERNAME, "password", AdminLogin.PASSWORD))))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminAuthService#login stops using the same BAD_CREDENTIALS detail for
	// both the AuthenticationException catch and the findByUsername orElseThrow.
	@Test
	void wrongPasswordAndUnknownUserGetTheSame401() throws Exception {
		String xsrf1 = AdminLogin.primeXsrf(mockMvc);
		MvcResult wrongPassword = mockMvc.perform(post("/admin/auth/login")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf1))
						.header(AdminLogin.XSRF_HEADER, xsrf1)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("username", AdminLogin.USERNAME, "password", "not-the-password"))))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(jsonPath("$.detail").value("Wrong username or password"))
				.andExpect(validAgainstContract())
				.andReturn();

		String xsrf2 = AdminLogin.primeXsrf(mockMvc);
		MvcResult unknownUser = mockMvc.perform(post("/admin/auth/login")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf2))
						.header(AdminLogin.XSRF_HEADER, xsrf2)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("username", "nobody-here", "password", AdminLogin.PASSWORD))))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(jsonPath("$.detail").value("Wrong username or password"))
				.andExpect(validAgainstContract())
				.andReturn();

		ObjectNode wrongPasswordBody = (ObjectNode) ContractValidation.JSON
				.readTree(wrongPassword.getResponse().getContentAsString());
		ObjectNode unknownUserBody = (ObjectNode) ContractValidation.JSON
				.readTree(unknownUser.getResponse().getContentAsString());
		assertThat(wrongPasswordBody.without("traceId")).isEqualTo(unknownUserBody.without("traceId"));
	}

	// Fails if AdminAuthService#login drops the adminSessionAuthenticationStrategy.onAuthentication(...) call.
	@Test
	void loginReturnsTheAdminAndChangesTheSessionId() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);
		MockHttpSession session = new MockHttpSession();
		String before = session.getId();
		UUID adminId = adminUserRepository.findByUsername(AdminLogin.USERNAME).orElseThrow().id();

		mockMvc.perform(post("/admin/auth/login")
						.session(session)
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf))
						.header(AdminLogin.XSRF_HEADER, xsrf)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("username", AdminLogin.USERNAME, "password", AdminLogin.PASSWORD))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("admin"))
				.andExpect(jsonPath("$.id").value(adminId.toString()))
				.andExpect(validAgainstContract());

		assertThat(session.getId()).isNotEqualTo(before);
		Object contextAttribute = session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
		assertThat(contextAttribute).isInstanceOf(SecurityContext.class);
		SecurityContext context = (SecurityContext) contextAttribute;
		assertThat(context.getAuthentication().getPrincipal()).isInstanceOf(AdminPrincipal.class);
		assertThat(((AdminPrincipal) context.getAuthentication().getPrincipal()).getUsername()).isEqualTo("admin");
	}

	// Fails if AdminAuthController#loginAdmin's issueXsrfToken() call after the login is removed.
	@Test
	void loginRotatesTheXsrfToken() throws Exception {
		String primed = AdminLogin.primeXsrf(mockMvc);
		MvcResult result = mockMvc.perform(post("/admin/auth/login")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, primed))
						.header(AdminLogin.XSRF_HEADER, primed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("username", AdminLogin.USERNAME, "password", AdminLogin.PASSWORD))))
				.andExpect(status().isOk())
				.andReturn();

		String rotated = AdminLogin.lastXsrf(result);
		assertThat(rotated).isNotEmpty();
		assertThat(rotated).isNotEqualTo(primed);
	}

	// Fails if AdminAuthService#currentAdmin stops reading contextHolder.getContext().getAuthentication().
	@Test
	void sessionAfterLoginReturnsTheAdmin() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/auth/session").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("admin"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminAuthService#changePassword's passwordEncoder.matches(currentPassword, admin.passwordHash()) check is removed.
	@Test
	void passwordChangeWithWrongCurrentPasswordIs422WrongPassword() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(put("/admin/auth/password")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("currentPassword", "not-the-password", "newPassword", "a-brand-new-password-26ch"))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/currentPassword"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("WRONG_PASSWORD"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminPasswordChangeRequest#getNewPassword's @Size(min = 15, max = 64) is removed
	// (bean validation layer, ProblemAdvice#handleBodyValidation, read-first).
	@Test
	void passwordChangeWith14CharactersIs422Size() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(put("/admin/auth/password")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("currentPassword", AdminLogin.PASSWORD, "newPassword", "fourteen-chars"))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/newPassword"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("SIZE"));
		// The request breaks the schema's minLength on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if PasswordPolicy.violations' MAX_UTF8_BYTES check is removed.
	@Test
	void passwordChangeOver72BytesIs422PasswordTooLong() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String newPassword = "é".repeat(40);

		mockMvc.perform(put("/admin/auth/password")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("currentPassword", AdminLogin.PASSWORD, "newPassword", newPassword))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/newPassword"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("PASSWORD_TOO_LONG"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminAuthService#changePassword stops calling adminUserRepository.save(admin) with the encoded hash.
	@Test
	void passwordChangeSucceedsAndOnlyTheNewPasswordSignsIn() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String newPassword = "a-brand-new-password-26ch";

		mockMvc.perform(put("/admin/auth/password")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("currentPassword", AdminLogin.PASSWORD, "newPassword", newPassword))))
				.andExpect(status().isNoContent())
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/admin/auth/session").with(signed))
				.andExpect(status().isOk());

		AdminLogin.signIn(mockMvc, AdminLogin.USERNAME, newPassword);

		String xsrf = AdminLogin.primeXsrf(mockMvc);
		mockMvc.perform(post("/admin/auth/login")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf))
						.header(AdminLogin.XSRF_HEADER, xsrf)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("username", AdminLogin.USERNAME, "password", AdminLogin.PASSWORD))))
				.andExpect(status().isUnauthorized());
	}

	// Fails if LiveAdminAuthorizationManager stops denying access without a live admin session
	// (admin/security, read-first).
	@Test
	void passwordChangeWithoutSessionIs401() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);

		mockMvc.perform(put("/admin/auth/password")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf), new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session"))
						.header(AdminLogin.XSRF_HEADER, xsrf)
						.contentType(MediaType.APPLICATION_JSON)
						.content(ContractValidation.JSON.writeValueAsString(
								Map.of("currentPassword", AdminLogin.PASSWORD, "newPassword", "a-brand-new-password-26ch"))))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminAuthService#logout drops the ResponseCookie.from(SESSION_COOKIE, ...) expiry cookie
	// or the loadDeferredToken(request, response).get() call for a fresh XSRF token.
	@Test
	void logoutEndsTheSessionAndExpiresTheCookie() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		MvcResult result = mockMvc.perform(post("/admin/auth/logout").with(signed))
				.andExpect(status().isNoContent())
				.andExpect(validAgainstContract())
				.andReturn();

		Cookie sessionCookie = result.getResponse().getCookie(AdminLogin.SESSION_COOKIE);
		assertThat(sessionCookie).isNotNull();
		assertThat(sessionCookie.getMaxAge()).isEqualTo(0);
		assertThat(sessionCookie.getPath()).isEqualTo("/");

		String rotated = AdminLogin.lastXsrf(result);
		assertThat(rotated).isNotEmpty();
		assertThat(rotated).isNotEqualTo(signed.xsrfToken());

		assertThat(signed.session().isInvalid()).isTrue();

		mockMvc.perform(get("/admin/auth/session").cookie(new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session")))
				.andExpect(status().isUnauthorized());
	}

	// Fails if AdminAuthController#logoutAdmin stops returning 204 unconditionally, e.g. if it required a session.
	@Test
	void logoutWithoutSessionIs204() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);

		mockMvc.perform(post("/admin/auth/logout")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf))
						.header(AdminLogin.XSRF_HEADER, xsrf))
				.andExpect(status().isNoContent())
				.andExpect(validAgainstContract());
	}

	// Fails if UnknownQueryParameterInterceptor stops rejecting an undeclared query key on GET /admin/auth/session.
	@Test
	void sessionWithAnUnknownQueryParameterIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/auth/session").with(signed).param("x", "1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("x"));
		// The request adds an undeclared query key on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if UnknownQueryParameterInterceptor stops rejecting an undeclared query key on POST /admin/auth/logout.
	@Test
	void logoutWithAnUnknownQueryParameterIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(post("/admin/auth/logout").with(signed).param("x", "1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("x"));
		// The request adds an undeclared query key on purpose, so the interaction validator would reject the request itself.
	}

	// Fails if AdminAuthService#currentAdmin's orElseThrow lambda stops invalidating the session
	// for a principal whose row is gone.
	@Test
	void deletedAdminSessionIs401AndInvalidated() throws Exception {
		AdminUser deletedAdmin = adminUserRepository.saveAndFlush(
				new AdminUser("deleted-admin", passwordEncoder.encode("deleted-admin-password"),
						OffsetDateTime.now(ZoneOffset.UTC)));
		created.add(deletedAdmin.id());

		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc, "deleted-admin", "deleted-admin-password");

		adminUserRepository.delete(deletedAdmin);

		mockMvc.perform(get("/admin/auth/session").with(signed))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract());

		assertThat(signed.session().isInvalid()).isTrue();
	}
}
