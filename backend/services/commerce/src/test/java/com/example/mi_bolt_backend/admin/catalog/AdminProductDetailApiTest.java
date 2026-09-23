package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * {@code GET /admin/products/{productId}} and {@code GET /admin/brands}
 * against the shared 3-product fixture (Samsung Galaxy S25 id 1, Apple
 * iPhone 16 id 2, Nokia 105 id 3).
 */
@IntegrationTest
class AdminProductDetailApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@AfterEach
	void restoreFixture() {
		jdbc.update("update product set archived_at = null where id in (1, 2, 3)");
	}

	// Fails if AdminProductsController#getAdminProduct (AdminProductsController.java:33-37) stops
	// answering the ETag header, or if AdminProductEtags#etag (AdminProductEtags.java:20-22) stops
	// quoting the version.
	@Test
	void productDetailCarriesTheVersionAsAQuotedETag() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products/1").with(signed))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"0\""))
				.andExpect(jsonPath("$.version").value(0))
				.andExpect(jsonPath("$.id").value(1))
				.andExpect(jsonPath("$.slug").value("samsung-galaxy-s25"))
				.andExpect(jsonPath("$.status").value("active"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminProductModels#status (AdminProductModels.java:132-134) stops reading
	// archivedAt for the detail mapping.
	@Test
	void archivedProductDetailShowsArchivedStatus() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		jdbc.update("update product set archived_at = now() where id = 2");

		mockMvc.perform(get("/admin/products/2").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("archived"))
				.andExpect(jsonPath("$.archivedAt").exists())
				.andExpect(validAgainstContract());
	}

	// Fails if the orElseThrow (AdminProductQueryService.java:76-79) is removed.
	@Test
	void unknownProductIdIs404() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products/999999").with(signed))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.detail").value("Product not found"))
				.andExpect(jsonPath("$.params.productId").value(999999))
				.andExpect(validAgainstContract());
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for a non-numeric path variable.
	@Test
	void nonNumericProductIdIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products/abc").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("productId"))
				.andExpect(jsonPath("$.params.reason").value("type Long"));
		// The request breaks the schema's numeric path variable on purpose, so the interaction validator would reject it itself.
	}

	// Fails if the generated @Min(1) on productId (AdminProductsApi.java) is removed.
	@Test
	void zeroProductIdIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products/0").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("productId"))
				.andExpect(jsonPath("$.params.reason").value("MIN"));
		// The request breaks the schema's minimum on purpose, so the interaction validator would reject it itself.
	}

	// Fails if AdminProductsController#listAdminBrands (AdminProductsController.java:39-42) or
	// AdminProductQueryService#brands (AdminProductQueryService.java:87-91) is removed.
	@Test
	void brandsAreSortedCaseInsensitively() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/brands").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0]").value("Apple"))
				.andExpect(jsonPath("$[1]").value("Nokia"))
				.andExpect(jsonPath("$[2]").value("Samsung"))
				.andExpect(validAgainstContract());
	}

	// Fails if AdminProductQueryService#brands (AdminProductQueryService.java:87-91) stops
	// including archived products' brands.
	@Test
	void brandsIncludeArchivedProducts() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		jdbc.update("update product set archived_at = now() where id = 3");

		mockMvc.perform(get("/admin/brands").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0]").value("Apple"))
				.andExpect(jsonPath("$[1]").value("Nokia"))
				.andExpect(jsonPath("$[2]").value("Samsung"))
				.andExpect(validAgainstContract());
	}

	// Fails if the admin security chain stops requiring a live session for /admin/products/{id}
	// (an unknown session cookie is not one).
	@Test
	void noSignInIs401() throws Exception {
		mockMvc.perform(get("/admin/products/1").cookie(new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract());
	}

	// Fails if the admin security chain stops requiring a live session for /admin/brands
	// (an unknown session cookie is not one).
	@Test
	void brandsWithoutSignInIs401() throws Exception {
		mockMvc.perform(get("/admin/brands").cookie(new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract());
	}

	// Fails if UnknownQueryParameterInterceptor (UnknownQueryParameterInterceptor.java) stops
	// rejecting a query parameter the detail handler does not declare.
	@Test
	void unknownQueryParameterOnDetailIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products/1").param("colour", "red").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("colour"));
		// The request breaks the contract's parameter list on purpose, so the interaction validator would reject it itself.
	}

	// Fails if UnknownQueryParameterInterceptor (UnknownQueryParameterInterceptor.java) stops
	// treating a handler without query parameters as declaring none.
	@Test
	void unknownQueryParameterOnBrandsIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/brands").param("colour", "red").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("colour"));
		// The request breaks the contract's parameter list on purpose, so the interaction validator would reject it itself.
	}
}
