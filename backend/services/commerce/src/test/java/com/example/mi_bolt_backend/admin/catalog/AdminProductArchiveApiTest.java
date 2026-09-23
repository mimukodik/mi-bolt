package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * {@code POST /admin/products/{productId}/archive} and
 * {@code POST /admin/products/{productId}/restore} against the real chain.
 * Every test creates its own products so the 3-product fixture (ids 1-3) is
 * never touched.
 */
@IntegrationTest
class AdminProductArchiveApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	private final List<Long> createdIds = new ArrayList<>();

	@AfterEach
	void deleteCreatedProducts() {
		for (Long id : createdIds) {
			AdminProductInputs.delete(jdbc, id);
		}
		createdIds.clear();
	}

	private MockHttpServletRequestBuilder action(String path, AdminLogin.Signed signed, String ifMatch) {
		MockHttpServletRequestBuilder builder = post(path).with(signed);
		if (ifMatch != null) {
			builder.header("If-Match", ifMatch);
		}
		return builder;
	}

	// Fails if archive stops setting archived_at, or the version stops rising once.
	@Test
	void archiveAnswers200ArchivedWithTheNextEtag() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a1", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, "\"0\""))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.status").value("archived"))
				.andExpect(jsonPath("$.archivedAt").exists())
				.andExpect(jsonPath("$.version").value(1))
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/products/b11-a1"))
				.andExpect(status().isNotFound());
	}

	// Fails if archiving an archived product stops being a no-op.
	@Test
	void archivingTwiceKeepsTheVersion() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a2", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, "\"0\""))
				.andExpect(status().isOk());
		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, "\"1\""))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.version").value(1));
	}

	// Fails if restore stops clearing archived_at.
	@Test
	void restoreAnswers200ActiveWithTheNextEtag() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a3", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, "\"0\""))
				.andExpect(status().isOk());
		mockMvc.perform(action("/admin/products/" + id + "/restore", signed, "\"1\""))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"2\""))
				.andExpect(jsonPath("$.status").value("active"))
				.andExpect(jsonPath("$.archivedAt").doesNotExist())
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/products/b11-a3"))
				.andExpect(status().isOk());
	}

	// Fails if restoring an active product stops being a no-op.
	@Test
	void restoringAnActiveProductKeepsTheVersion() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a4", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/restore", signed, "\"0\""))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"0\""))
				.andExpect(jsonPath("$.version").value(0));
	}

	// Fails if archive stops requiring If-Match.
	@Test
	void archiveWithoutIfMatchIs428() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a5", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, null))
				.andExpect(status().isPreconditionRequired())
				.andExpect(jsonPath("$.code").value("PRECONDITION_REQUIRED"))
				.andExpect(jsonPath("$.detail").value("If-Match required"))
				.andExpect(validAgainstContract());
	}

	// Fails if archive stops comparing If-Match with the stored version.
	@Test
	void archiveWithAStaleIfMatchIs412() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a6", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, "\"7\""))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("PRODUCT_VERSION_CONFLICT"))
				.andExpect(jsonPath("$.params.expected").value(0))
				.andExpect(jsonPath("$.params.received").value(7))
				.andExpect(validAgainstContract());
	}

	// Fails if archive stops answering 404 for an unknown id.
	@Test
	void archiveOfAnUnknownIdIs404() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);

		mockMvc.perform(action("/admin/products/999999/archive", signed, "\"0\""))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.detail").value("Product not found"))
				.andExpect(jsonPath("$.params.productId").value(999999))
				.andExpect(validAgainstContract());
	}

	// Fails if restore stops requiring If-Match.
	@Test
	void restoreWithoutIfMatchIs428() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a7", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, "\"0\""))
				.andExpect(status().isOk());
		mockMvc.perform(action("/admin/products/" + id + "/restore", signed, null))
				.andExpect(status().isPreconditionRequired())
				.andExpect(jsonPath("$.code").value("PRECONDITION_REQUIRED"));
	}

	// Fails if restore stops comparing If-Match with the stored version.
	@Test
	void restoreWithAStaleIfMatchIs412() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a8", false);
		createdIds.add(id);

		mockMvc.perform(action("/admin/products/" + id + "/archive", signed, "\"0\""))
				.andExpect(status().isOk());
		mockMvc.perform(action("/admin/products/" + id + "/restore", signed, "\"0\""))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("PRODUCT_VERSION_CONFLICT"))
				.andExpect(jsonPath("$.params.expected").value(1))
				.andExpect(jsonPath("$.params.received").value(0));
	}

	// Fails if the FEATURED_LIMIT check on restore is removed.
	@Test
	void restoringAFifthFeaturedProductIs409() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long archivedId = AdminProductInputs.create(mockMvc, signed, "b11-r", true);
		createdIds.add(archivedId);
		mockMvc.perform(action("/admin/products/" + archivedId + "/archive", signed, "\"0\""))
				.andExpect(status().isOk());

		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b11-r1", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b11-r2", true));
		createdIds.add(AdminProductInputs.create(mockMvc, signed, "b11-r3", true));

		mockMvc.perform(action("/admin/products/" + archivedId + "/restore", signed, "\"1\""))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("FEATURED_LIMIT"))
				.andExpect(jsonPath("$.detail").value("Featured limit reached"))
				.andExpect(jsonPath("$.params").doesNotExist())
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/admin/products/" + archivedId).with(signed))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("archived"))
				.andExpect(jsonPath("$.version").value(1));
	}

	// Fails if AdminProductsApi#archiveAdminProduct stops requiring the adminSession security scheme.
	@Test
	void archiveWithoutASessionIs401() throws Exception {
		String xsrf = AdminLogin.primeXsrf(mockMvc);

		mockMvc.perform(post("/admin/products/1/archive")
						.cookie(new Cookie(AdminLogin.XSRF_COOKIE, xsrf))
						.header(AdminLogin.XSRF_HEADER, xsrf)
						.header("If-Match", "\"0\"")
						.cookie(new Cookie(AdminLogin.SESSION_COOKIE, "not-a-real-session"))
						.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
	}

	// Fails if the admin chain stops enforcing the XSRF header on archive.
	@Test
	void archiveWithoutTheXsrfHeaderIs403() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "b11-a9", false);
		createdIds.add(id);

		mockMvc.perform(post("/admin/products/" + id + "/archive")
						.session(signed.session())
						.cookie(new Cookie(AdminLogin.SESSION_COOKIE, signed.session().getId()),
								new Cookie(AdminLogin.XSRF_COOKIE, signed.xsrfToken()))
						.header("If-Match", "\"0\"")
						.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
	}
}
