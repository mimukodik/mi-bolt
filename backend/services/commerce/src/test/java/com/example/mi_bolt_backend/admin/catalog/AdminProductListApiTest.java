package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 * {@code GET /admin/products}: the filters, sorting, paging and every
 * parameter rejection the backend answers, against the shared 3-product
 * fixture (Samsung Galaxy S25 id 1, Apple iPhone 16 id 2, Nokia 105 id 3).
 */
@IntegrationTest
class AdminProductListApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@AfterEach
	void restoreFixture() {
		jdbc.update("update product set archived_at = null where id in (1, 2, 3)");
	}

	// Fails if AdminProductsController#listAdminProducts (AdminProductsController.java:25-31) stops
	// delegating to the query service, or if the generated defaults (status active, sort rank,
	// direction asc, page 1, pageSize 50) stop reaching AdminProductQueryService#list unchanged.
	@Test
	void defaultListIsRankAscendingWithTotals() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(
						contains("samsung-galaxy-s25", "apple-iphone-16", "nokia-105")))
				.andExpect(jsonPath("$.totalElements").value(3))
				.andExpect(jsonPath("$.page").value(1))
				.andExpect(jsonPath("$.pageSize").value(50))
				.andExpect(jsonPath("$.totalPages").value(1))
				.andExpect(validAgainstContract());
	}

	// Fails if the NAME case (AdminProductQueryService.java:161) or the direction handling in
	// byKey (AdminProductQueryService.java:177-181) is removed.
	@Test
	void sortByNameDescending() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("sort", "name").param("direction", "desc").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("apple-iphone-16"))
				.andExpect(validAgainstContract());
	}

	// Fails if the MIN_PRICE case (AdminProductQueryService.java:164) or minVariantPrice
	// (AdminProductQueryService.java:147-156) is removed.
	@Test
	void sortByMinPrice() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("sort", "minPrice").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("nokia-105"))
				.andExpect(validAgainstContract());
	}

	// Fails if the RELEASED_AT case (AdminProductQueryService.java:163) is removed.
	@Test
	void sortByReleasedAtDescending() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("sort", "releasedAt").param("direction", "desc").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].slug").value("samsung-galaxy-s25"))
				.andExpect(validAgainstContract());
	}

	// Fails if matchesQ (AdminProductQueryService.java:112-120), in particular its use of
	// p.getSlug() at :117, is removed.
	@Test
	void qMatchesASlugOnlySubstring() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("q", "phone-16").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("apple-iphone-16")))
				.andExpect(jsonPath("$.totalElements").value(1))
				.andExpect(validAgainstContract());
	}

	// Fails if matchesBrand (AdminProductQueryService.java:122-124) is removed.
	@Test
	void brandFilterIsAnOr() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		// No contract check: the request validator rejects a repeated form-exploded array parameter
		// (same as ProductsApiTest.multipleBrandsUseOr).
		mockMvc.perform(get("/admin/products").param("brand", "Apple").param("brand", "Nokia").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("apple-iphone-16", "nokia-105")));
	}

	// Fails if matchesBrand (AdminProductQueryService.java:122-124) stops treating an empty
	// brand list (brand.isEmpty()) the same as no filter.
	// A single empty brand value binds to an empty list, not to [""].
	@Test
	void singleEmptyBrandValueMatchesEverything() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		// No contract check: the request validator reads a single empty value of a form-exploded
		// array parameter as a missing parameter.
		mockMvc.perform(get("/admin/products").param("brand", "").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(
						contains("samsung-galaxy-s25", "apple-iphone-16", "nokia-105")))
				.andExpect(jsonPath("$.totalElements").value(3));
	}

	// Fails if a single brand value is not split on commas before matchesBrand (Spring's
	// String-to-List conversion).
	@Test
	void oneCommaSeparatedBrandValueFiltersByBoth() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		// No contract check: the contract sends one brand per repeated key; a comma inside one value
		// is Spring's reading, not the contract's.
		mockMvc.perform(get("/admin/products").param("brand", "Apple,Nokia").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("apple-iphone-16", "nokia-105")))
				.andExpect(jsonPath("$.totalElements").value(2));
	}

	// Fails if matchesStatus's ACTIVE case (AdminProductQueryService.java:95) is removed.
	@Test
	void defaultStatusHidesArchived() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		jdbc.update("update product set archived_at = now() where id = 2");

		mockMvc.perform(get("/admin/products").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("samsung-galaxy-s25", "nokia-105")))
				.andExpect(validAgainstContract());
	}

	// Fails if matchesStatus's ARCHIVED case (AdminProductQueryService.java:96) is removed.
	@Test
	void statusArchivedShowsOnlyArchived() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		jdbc.update("update product set archived_at = now() where id = 2");

		mockMvc.perform(get("/admin/products").param("status", "archived").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("apple-iphone-16")))
				.andExpect(validAgainstContract());
	}

	// Fails if matchesStatus's ALL case (AdminProductQueryService.java:97) is removed.
	@Test
	void statusAllShowsEverything() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		jdbc.update("update product set archived_at = now() where id = 2");

		mockMvc.perform(get("/admin/products").param("status", "all").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(3))
				.andExpect(validAgainstContract());
	}

	// Fails if matchesFeatured (AdminProductQueryService.java:126-128) is removed.
	@Test
	void featuredTrueFilter() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("featured", "true").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("samsung-galaxy-s25")))
				.andExpect(validAgainstContract());
	}

	// Fails if Spring's Boolean conversion stops reading "yes" as true, which
	// matchesFeatured (AdminProductQueryService.java:126-128) relies on.
	@Test
	void featuredYesIsReadAsTrue() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		// No contract check: the contract's boolean takes only true or false, so this request breaks
		// it on purpose; the backend still reads yes as true.
		mockMvc.perform(get("/admin/products").param("featured", "yes").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("samsung-galaxy-s25")));
	}

	// Fails if matchesOutOfStock (AdminProductQueryService.java:130-136) or totalStock
	// (AdminProductQueryService.java:138-145) is removed.
	@Test
	void outOfStockTrueFilter() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("outOfStock", "true").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("nokia-105")))
				.andExpect(validAgainstContract());
	}

	// Fails if matchesOutOfStock (AdminProductQueryService.java:130-136) is removed.
	@Test
	void outOfStockFalseFilter() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("outOfStock", "false").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("samsung-galaxy-s25", "apple-iphone-16")))
				.andExpect(validAgainstContract());
	}

	// Fails if the paging slice (AdminProductQueryService.java:62-70) is removed.
	@Test
	void secondPageOfOne() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("page", "2").param("pageSize", "1").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[*].slug").value(contains("apple-iphone-16")))
				.andExpect(jsonPath("$.totalElements").value(3))
				.andExpect(jsonPath("$.totalPages").value(3))
				.andExpect(jsonPath("$.page").value(2))
				.andExpect(jsonPath("$.pageSize").value(1))
				.andExpect(validAgainstContract());
	}

	// Fails if the "fromIndex < totalElements" guard (AdminProductQueryService.java:64) is removed.
	@Test
	void pagePastTheEndIsEmptyWithTotals() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("page", "4").param("pageSize", "1").with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items").isEmpty())
				.andExpect(jsonPath("$.totalElements").value(3))
				.andExpect(jsonPath("$.totalPages").value(3))
				.andExpect(validAgainstContract());
	}

	// Fails if the generated @Max(100) on pageSize (AdminProductsApi.java) is removed, or if
	// ProblemAdvice#handleHandlerValidation (ProblemAdvice.java:187-209) stops reporting the
	// constraint name as params.reason.
	@Test
	void pageSizeOver100Is400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("pageSize", "101").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("pageSize"))
				.andExpect(jsonPath("$.params.reason").value("MAX"));
		// The request breaks the schema's maximum on purpose, so the interaction validator would reject it itself.
	}

	// Fails if the generated @Min(1) on page (AdminProductsApi.java) is removed, or if
	// ProblemAdvice#handleHandlerValidation (ProblemAdvice.java:187-209) stops reporting the
	// constraint name as params.reason.
	@Test
	void pageZeroIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("page", "0").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("page"))
				.andExpect(jsonPath("$.params.reason").value("MIN"));
		// The request breaks the schema's minimum on purpose, so the interaction validator would reject it itself.
	}

	// Fails if UnknownQueryParameterInterceptor (UnknownQueryParameterInterceptor.java) stops
	// rejecting an undeclared query parameter, or if ProblemAdvice#handleUnknownQueryParameter
	// (ProblemAdvice.java:100-106) is removed.
	@Test
	void unknownQueryParameterIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("colour", "red").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Unknown query parameter"))
				.andExpect(jsonPath("$.params.parameter").value("colour"));
		// The request breaks the contract's parameter list on purpose, so the interaction validator would reject it itself.
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for an invalid enum value.
	@Test
	void unknownStatusValueIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("status", "bogus").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("status"))
				.andExpect(jsonPath("$.params.reason").value("type AdminProductStatusFilter"));
		// The request breaks the schema's enum on purpose, so the interaction validator would reject it itself.
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for an invalid boolean value.
	@Test
	void unparsableFeaturedValueIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("featured", "maybe").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("featured"))
				.andExpect(jsonPath("$.params.reason").value("type Boolean"));
		// The request breaks the schema's boolean type on purpose, so the interaction validator would reject it itself.
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for an invalid boolean value.
	@Test
	void unparsableOutOfStockValueIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("outOfStock", "maybe").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("outOfStock"))
				.andExpect(jsonPath("$.params.reason").value("type Boolean"));
		// The request breaks the schema's boolean type on purpose, so the interaction validator would reject it itself.
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for an invalid sort field.
	@Test
	void unknownSortValueIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("sort", "bogus").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("sort"))
				.andExpect(jsonPath("$.params.reason").value("type AdminProductSortField"));
		// The request breaks the schema's enum on purpose, so the interaction validator would reject it itself.
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for an invalid sort direction.
	@Test
	void unknownDirectionValueIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("direction", "bogus").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("direction"))
				.andExpect(jsonPath("$.params.reason").value("type SortDirection"));
		// The request breaks the schema's enum on purpose, so the interaction validator would reject it itself.
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for a non-numeric page.
	@Test
	void nonNumericPageIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("page", "abc").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("page"))
				.andExpect(jsonPath("$.params.reason").value("type Integer"));
		// The request breaks the schema's integer type on purpose, so the interaction validator would reject it itself.
	}

	// Fails if ProblemAdvice#handleTypeMismatchParam (ProblemAdvice.java:108-115) stops
	// reporting the required type's simple name for a non-numeric page size.
	@Test
	void nonNumericPageSizeIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("pageSize", "abc").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter has the wrong type"))
				.andExpect(jsonPath("$.params.parameter").value("pageSize"))
				.andExpect(jsonPath("$.params.reason").value("type Integer"));
		// The request breaks the schema's integer type on purpose, so the interaction validator would reject it itself.
	}

	// Fails if the generated @Min(1) on pageSize (AdminProductsApi.java) is removed, or if
	// ProblemAdvice#handleHandlerValidation (ProblemAdvice.java:187-209) stops reporting the
	// constraint name as params.reason.
	@Test
	void pageSizeZeroIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("pageSize", "0").with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("pageSize"))
				.andExpect(jsonPath("$.params.reason").value("MIN"));
		// The request breaks the schema's minimum on purpose, so the interaction validator would reject it itself.
	}

	// Fails if the generated @Size(max = 100) on q (AdminProductsApi.java) is removed, or if
	// ProblemAdvice#handleHandlerValidation (ProblemAdvice.java:187-209) stops reporting the
	// constraint name as params.reason.
	@Test
	void searchTextOver100CharactersIs400() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(get("/admin/products").param("q", "a".repeat(101)).with(signed))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("q"))
				.andExpect(jsonPath("$.params.reason").value("SIZE"));
		// The request breaks the schema's maxLength on purpose, so the interaction validator would reject it itself.
	}

	// Fails if the admin security chain stops requiring a live session for /admin/products
	// (an unknown session cookie is not one).
	@Test
	void noSignInIs401() throws Exception {
		mockMvc.perform(get("/admin/products").cookie(new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session")))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(validAgainstContract());
	}
}
