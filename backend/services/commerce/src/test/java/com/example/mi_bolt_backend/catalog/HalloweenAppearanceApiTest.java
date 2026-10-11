package com.example.mi_bolt_backend.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.demo.DemoAccessService;
import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;
import jakarta.persistence.EntityManager;

@IntegrationTest
@Transactional
class HalloweenAppearanceApiTest {
	private static final String ADMIN_PATH = "/admin/halloween-appearance";
	private static final String ACTIVE = "{\"enabled\":true,\"startsAt\":\"2020-01-01T00:00:00Z\",\"endsAt\":\"2099-01-01T00:00:00Z\"}";
	@Autowired
	private MockMvc mockMvc;
	@Autowired
	private JdbcTemplate jdbc;
	@Autowired
	private EntityManager entityManager;

	@Test
	void defaultIsDisabledAndPublicResponseIsNotCacheable() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		mockMvc.perform(get(ADMIN_PATH).with(signed)).andExpect(status().isOk())
				.andExpect(validAgainstContract()).andExpect(header().string("ETag", "\"0\""))
				.andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.version").value(0))
				.andExpect(jsonPath("$.startsAt").doesNotExist()).andExpect(jsonPath("$.endsAt").doesNotExist());
		mockMvc.perform(get("/shop-appearance")).andExpect(status().isOk()).andExpect(validAgainstContract())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.serverTime").isString()).andExpect(jsonPath("$.halloweenActive").value(false));
	}

	@Test
	void savedSettingsIncrementVersionAndFailuresPreserveThem() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		mockMvc.perform(put(ADMIN_PATH).with(signed).header("If-Match", "\"0\"")
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mockMvc.perform(put(ADMIN_PATH).with(signed).contentType(MediaType.APPLICATION_JSON).content(ACTIVE))
				.andExpect(status().isPreconditionRequired()).andExpect(validAgainstContract());
		mockMvc.perform(put(ADMIN_PATH).with(signed).header("If-Match", "\"0\"")
				.contentType(MediaType.APPLICATION_JSON).content(ACTIVE))
				.andExpect(status().isOk()).andExpect(validAgainstContract()).andExpect(header().string("ETag", "\"1\""));
		mockMvc.perform(put(ADMIN_PATH).with(signed).header("If-Match", "\"0\"")
				.contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
				.andExpect(status().isPreconditionFailed()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.code").value("APPEARANCE_VERSION_CONFLICT"));
		mockMvc.perform(put(ADMIN_PATH).with(signed).header("If-Match", "\"1\"")
				.contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
				.andExpect(status().isUnprocessableEntity()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/startsAt"));
		mockMvc.perform(get(ADMIN_PATH).with(signed)).andExpect(status().isOk())
				.andExpect(jsonPath("$.enabled").value(true)).andExpect(jsonPath("$.version").value(1));
		mockMvc.perform(put(ADMIN_PATH).with(signed).header("If-Match", "\"1\"")
				.contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false,\"startsAt\":null,\"endsAt\":null}"))
				.andExpect(status().isOk()).andExpect(validAgainstContract()).andExpect(header().string("ETag", "\"2\""))
				.andExpect(jsonPath("$.enabled").value(false));
	}

	@Test
	void nonRepresentablePrecisionIsRejectedBeforePostgresCanCollapseThePeriod() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = "{\"enabled\":true,\"startsAt\":\"2026-10-30T18:00:00.000000001Z\","
				+ "\"endsAt\":\"2026-10-30T18:00:00.000000002Z\"}";
		mockMvc.perform(put(ADMIN_PATH).with(signed).header("If-Match", "\"0\"")
				.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isUnprocessableEntity()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/startsAt"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("DATETIME_PRECISION"))
				.andExpect(jsonPath("$.fieldErrors[1].path").value("/endsAt"));
		mockMvc.perform(get(ADMIN_PATH).with(signed)).andExpect(status().isOk())
				.andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void productSalesAndDecorationCanRunIndependently() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		jdbc.update("update product set promotion_enabled = true, promotion_text = 'Sale',"
				+ " promotion_starts_at = '2020-01-01T00:00:00Z', promotion_ends_at = '2099-01-01T00:00:00Z'");
		jdbc.update("update product_variant set sale_price_huf = 1, promotion_reference_price_huf = price_huf");
		entityManager.clear();
		mockMvc.perform(get("/products").param("activePromotion", "true")).andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].priceMetadata.activePromotion").value(true));
		mockMvc.perform(get("/shop-appearance")).andExpect(status().isOk())
				.andExpect(jsonPath("$.halloweenActive").value(false));
		jdbc.update("update product set promotion_enabled = false");
		entityManager.clear();
		mockMvc.perform(put(ADMIN_PATH).with(signed).header("If-Match", "\"0\"")
				.contentType(MediaType.APPLICATION_JSON).content(ACTIVE)).andExpect(status().isOk());
		mockMvc.perform(get("/products").param("activePromotion", "true")).andExpect(status().isOk())
				.andExpect(jsonPath("$.items").isEmpty());
		mockMvc.perform(get("/shop-appearance")).andExpect(status().isOk()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.halloweenActive").value(true))
				.andExpect(jsonPath("$.nextChangeAt").value("2099-01-01T00:00:00Z"));
	}

	@Test
	void adminNeedsSignInAndCsrfAndShopNeedsDemoAccess() throws Exception {
		mockMvc.perform(get(ADMIN_PATH)).andExpect(status().isUnauthorized());
		mockMvc.perform(put(ADMIN_PATH).contentType(MediaType.APPLICATION_JSON).content(ACTIVE))
				.andExpect(status().isForbidden());
		mockMvc.perform(get("/shop-appearance").cookie(new Cookie(DemoAccessService.COOKIE_NAME, "invalid")))
				.andExpect(status().isUnauthorized()).andExpect(validAgainstContract());
	}
}
