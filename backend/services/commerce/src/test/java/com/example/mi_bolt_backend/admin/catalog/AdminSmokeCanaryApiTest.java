package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.example.mi_bolt_backend.catalog.SmokeCanaryBootstrap;
import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;

/** ADR 0023: the reserved fixture is hidden and immutable through the admin API. */
@IntegrationTest
@TestPropertySource(properties = {
		"mibolt.smoke.enabled=true",
		"spring.datasource.url=jdbc:h2:mem:admin-smoke-canary;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class AdminSmokeCanaryApiTest {

	private static final String SLUG = SmokeCanaryBootstrap.PRODUCT_SLUG;
	private static final String REFUSAL = "The smoke canary is reserved and cannot be changed through the admin API";

	@Autowired
	private MockMvc mockMvc;
	@Autowired
	private JdbcTemplate jdbc;
	@Autowired
	private SmokeCanaryBootstrap bootstrap;

	@AfterEach
	void restoreFixture() {
		jdbc.update("update product set featured = false where id in (2, 3)");
		for (Long id : jdbc.queryForList("select id from product where slug in (?, ?)", Long.class,
				SLUG, "temporary-canary")) {
			AdminProductInputs.delete(jdbc, id);
		}
		bootstrap.run(null);
	}

	@ParameterizedTest
	@ValueSource(strings = {"active", "archived"})
	void listCountsSearchAndBrandsExcludeCanaryInEveryState(String state) throws Exception {
		if ("archived".equals(state)) {
			jdbc.update("update product set archived_at = now() where slug = ?", SLUG);
		}
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		mockMvc.perform(get("/admin/products").param("status", "all").param("pageSize", "1").with(signed))
				.andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3))
				.andExpect(jsonPath("$.totalPages").value(3)).andExpect(validAgainstContract());
		mockMvc.perform(get("/admin/products").param("status", "all").with(signed))
				.andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(3))
				.andExpect(jsonPath("$.items[?(@.slug=='mi-bolt-smoke-canary')]").isEmpty())
				.andExpect(validAgainstContract());
		mockMvc.perform(get("/admin/products").param("status", state).param("q", SLUG).with(signed))
				.andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0))
				.andExpect(jsonPath("$.items").isEmpty()).andExpect(validAgainstContract());
		// Same validator limitation as AdminProductListApiTest.brandFilterIsAnOr:
		// it cannot parse a form-exploded array parameter; assert this response directly.
		mockMvc.perform(get("/admin/products").param("status", "all").param("brand", "MiBolt").with(signed))
				.andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
		mockMvc.perform(get("/admin/brands").with(signed))
				.andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[?(@=='MiBolt')]").isEmpty()).andExpect(validAgainstContract());
		mockMvc.perform(get("/admin/products/" + canaryId()).with(signed))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(validAgainstContract());
	}

	@ParameterizedTest
	@ValueSource(strings = {"update", "feature", "image", "stock", "archive", "restore"})
	void everyAdminWriteIsRefusedWithoutChangingFixture(String operation) throws Exception {
		long id = canaryId();
		Map<String, Object> before = productState(id);
		Map<String, Object> variantBefore = variantState(id);
		Map<String, Object> colorBefore = colorState(id);
		String body = AdminProductInputs.body(SLUG, "feature".equals(operation));
		if ("image".equals(operation)) {
			body = body.replace(AdminProductInputs.IMAGE_ID,
					"052fbcc4bbaa16e953edf6427e20fba34bb43601a5282b314177ee89d5b85062");
		}
		if ("stock".equals(operation)) {
			body = body.replace("\"stock\":5", "\"stock\":0");
		}
		MockHttpServletRequestBuilder request;
		if ("archive".equals(operation) || "restore".equals(operation)) {
			request = post("/admin/products/" + id + "/" + operation);
		}
		else {
			request = put("/admin/products/" + id).contentType(MediaType.APPLICATION_JSON).content(body);
		}
		mockMvc.perform(request.with(AdminLogin.signIn(mockMvc)).header("If-Match", "\"0\""))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.detail").value(REFUSAL)).andExpect(validAgainstContract());
		assertThat(productState(id)).isEqualTo(before);
		assertThat(variantState(id)).isEqualTo(variantBefore);
		assertThat(colorState(id)).isEqualTo(colorBefore);
	}

	@Test
	void archivedCanaryCannotBeRestoredThroughAdmin() throws Exception {
		jdbc.update("update product set archived_at = now() where slug = ?", SLUG);
		long id = canaryId();
		Map<String, Object> before = productState(id);
		mockMvc.perform(post("/admin/products/" + id + "/restore").with(AdminLogin.signIn(mockMvc))
				.header("If-Match", "\"0\""))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value(REFUSAL))
				.andExpect(validAgainstContract());
		assertThat(productState(id)).isEqualTo(before);
	}

	@Test
	void adminCannotCreateTheReservedSlugEvenWithoutFixture() throws Exception {
		// Move only this isolated test fixture aside to exercise the missing-canary case.
		long id = canaryId();
		jdbc.update("update product set slug = ? where slug = ?", "temporary-canary", SLUG);
		long before = jdbc.queryForObject("select count(*) from product", Long.class);
		try {
			mockMvc.perform(post("/admin/products").with(AdminLogin.signIn(mockMvc))
					.contentType(MediaType.APPLICATION_JSON).content(AdminProductInputs.body(SLUG, false)))
					.andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
					.andExpect(jsonPath("$.detail").value(REFUSAL))
					.andExpect(jsonPath("$.fieldErrors[0].path").value("/slug"))
					.andExpect(jsonPath("$.fieldErrors[0].code").value("SLUG_TAKEN"))
					.andExpect(validAgainstContract());
			assertThat(jdbc.queryForObject("select count(*) from product", Long.class)).isEqualTo(before);
		}
		finally {
			for (Long created : jdbc.queryForList("select id from product where slug = ?", Long.class, SLUG)) {
				AdminProductInputs.delete(jdbc, created);
			}
			jdbc.update("update product set slug = ? where id = ?", SLUG, id);
		}
	}

	@Test
	void canaryDoesNotCountAgainstTheNormalFeaturedLimit() throws Exception {
		// Simulate previously edited data: three normal products plus a featured canary.
		jdbc.update("update product set featured = true where id in (1, 2, 3) or slug = ?", SLUG);
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		long id = AdminProductInputs.create(mockMvc, signed, "fourth-normal-featured", true);
		try {
			mockMvc.perform(get("/admin/products").param("featured", "true").with(signed))
					.andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(4))
					.andExpect(jsonPath("$.items[?(@.slug=='mi-bolt-smoke-canary')]").isEmpty())
					.andExpect(validAgainstContract());
		}
		finally {
			AdminProductInputs.delete(jdbc, id);
		}
	}

	@Test
	void sharedNormalBrandRemainsVisible() throws Exception {
		jdbc.update("update product set brand = 'Samsung' where slug = ?", SLUG);
		mockMvc.perform(get("/admin/brands").with(AdminLogin.signIn(mockMvc)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[2]").value("Samsung")).andExpect(validAgainstContract());
	}

	private long canaryId() {
		return jdbc.queryForObject("select id from product where slug = ?", Long.class, SLUG);
	}

	private Map<String, Object> productState(long id) {
		return jdbc.queryForMap("select * from product where id = ?", id);
	}

	private Map<String, Object> variantState(long id) {
		return jdbc.queryForMap("select * from product_variant where product_id = ?", id);
	}

	private Map<String, Object> colorState(long id) {
		return jdbc.queryForMap("select * from product_color where product_id = ?", id);
	}
}
