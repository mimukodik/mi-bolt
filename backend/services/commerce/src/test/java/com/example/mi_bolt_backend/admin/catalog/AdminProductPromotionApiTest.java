package com.example.mi_bolt_backend.admin.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.test.web.servlet.MvcResult;

import com.example.mi_bolt_backend.test.AdminLogin;
import com.example.mi_bolt_backend.test.IntegrationTest;
import com.jayway.jsonpath.JsonPath;

@IntegrationTest
class AdminProductPromotionApiTest {

	@Autowired
	private MockMvc mockMvc;
	@Autowired
	private JdbcTemplate jdbc;
	private final List<Long> createdIds = new ArrayList<>();

	@AfterEach
	void cleanUp() {
		for (long id : createdIds) {
			AdminProductInputs.delete(jdbc, id);
		}
	}

	private static String promotedBody(String slug) {
		return AdminProductInputs.body(slug, false)
				.replace("\"featured\":false", "\"featured\":false,\"promotion\":{\"enabled\":true,\"text\":\"  Offer  \","
						+ "\"startsAt\":\"2026-10-10T00:00:00Z\",\"endsAt\":\"2026-10-11T00:00:00Z\"}")
				.replace("\"stock\":5", "\"stock\":5,\"salePriceHuf\":1");
	}

	private MvcResult create(AdminLogin.Signed signed, String body) throws Exception {
		MvcResult result = mockMvc.perform(post("/admin/products").with(signed)
				.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated()).andExpect(validAgainstContract()).andReturn();
		Number id = JsonPath.read(result.getResponse().getContentAsString(), "$.id");
		createdIds.add(id.longValue());
		return result;
	}

	@Test
	void reorderedVariantSaleErrorPointsToTheRequestIndex() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String second = "{\"slug\":\"b6-field-order-black-256\",\"colorCode\":\"black\",\"storageGb\":256,"
				+ "\"price\":{\"amount\":99990,\"currency\":\"HUF\"},\"stock\":5}";
		String body = AdminProductInputs.body("b6-field-order", false)
				.replace("\"variants\":[", "\"promotion\":{\"enabled\":false},\"variants\":[")
				.replace("\"stock\":5}]", "\"stock\":5}," + second + "]");
		MvcResult created = create(signed, body);
		String invalidFirst = second.replace("black-256", "black-128").replace("\"storageGb\":256", "\"storageGb\":128")
				.replace("\"stock\":5", "\"stock\":5,\"salePriceHuf\":100000");
		String reordered = body.substring(0, body.indexOf("\"variants\":["))
				+ "\"variants\":[" + second + "," + invalidFirst + "]," + body.substring(body.indexOf("\"specGroups\":"));
		mockMvc.perform(put("/admin/products/" + createdIds.getFirst()).with(signed)
				.header("If-Match", created.getResponse().getHeader("ETag"))
				.contentType(MediaType.APPLICATION_JSON).content(reordered))
				.andExpect(status().isUnprocessableEntity()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/variants/1/salePriceHuf"));
	}

	@Test
	void activeBaseEditsKeepCapturedReferenceAndSale() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = promotedBody("b6-reference")
				.replace("2026-10-10T00:00:00Z", "2020-01-01T00:00:00Z")
				.replace("2026-10-11T00:00:00Z", "2099-01-01T00:00:00Z")
				.replace("\"salePriceHuf\":1", "\"salePriceHuf\":80000");
		MvcResult created = create(signed, body);
		long id = createdIds.getFirst();
		String legacyEdit = AdminProductInputs.body("b6-reference", false).replace("99990", "70000");
		mockMvc.perform(put("/admin/products/" + id).with(signed)
				.header("If-Match", created.getResponse().getHeader("ETag"))
				.contentType(MediaType.APPLICATION_JSON).content(legacyEdit))
				.andExpect(status().isOk()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.variants[0].price.amount").value(70000))
				.andExpect(jsonPath("$.variants[0].salePriceHuf").value(80000))
				.andExpect(jsonPath("$.variants[0].referencePriceHuf").value(99990));
		mockMvc.perform(get("/products/b6-reference"))
				.andExpect(status().isOk()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.variants[0].price.amount").value(80000))
				.andExpect(jsonPath("$.variants[0].priceMetadata.referencePrice.amount").value(99990))
				.andExpect(jsonPath("$.variants[0].priceMetadata.activePromotion").value(true));
	}

	@Test
	void scheduledBaseEditsRefreshReferenceAndSaleMustStayBelowIt() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		String body = promotedBody("b6-scheduled")
				.replace("2026-10-10T00:00:00Z", "2098-01-01T00:00:00Z")
				.replace("2026-10-11T00:00:00Z", "2099-01-01T00:00:00Z")
				.replace("\"salePriceHuf\":1", "\"salePriceHuf\":80000");
		MvcResult created = create(signed, body);
		long id = createdIds.getFirst();
		MvcResult updated = mockMvc.perform(put("/admin/products/" + id).with(signed)
				.header("If-Match", created.getResponse().getHeader("ETag"))
				.contentType(MediaType.APPLICATION_JSON).content(AdminProductInputs.body("b6-scheduled", false).replace("99990", "90000")))
				.andExpect(status().isOk()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.variants[0].referencePriceHuf").value(90000)).andReturn();
		mockMvc.perform(put("/admin/products/" + id).with(signed)
				.header("If-Match", updated.getResponse().getHeader("ETag"))
				.contentType(MediaType.APPLICATION_JSON).content(AdminProductInputs.body("b6-scheduled", false).replace("99990", "70000")))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.fieldErrors[0].code").value("SALE_PRICE_NOT_LOWER"));
	}

	@Test
	void legacyReplacePreservesPromotionAndSalePriceAndConflict() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		MvcResult created = create(signed, promotedBody("b6-preserve"));
		long id = createdIds.get(0);
		String etag = created.getResponse().getHeader("ETag");
		mockMvc.perform(put("/admin/products/" + id).with(signed).header("If-Match", etag)
				.contentType(MediaType.APPLICATION_JSON).content(AdminProductInputs.body("b6-preserve", false)))
				.andExpect(status().isOk()).andExpect(validAgainstContract())
				.andExpect(jsonPath("$.promotion.text").value("Offer"))
				.andExpect(jsonPath("$.variants[0].salePriceHuf").value(1));
		mockMvc.perform(put("/admin/products/" + id).with(signed).header("If-Match", etag)
				.contentType(MediaType.APPLICATION_JSON).content(promotedBody("b6-preserve")))
				.andExpect(status().isPreconditionFailed());
	}

	@Test
	void clearingLastSaleRequiresDisablingAndThenPersists() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		MvcResult created = create(signed, promotedBody("b6-clear"));
		long id = createdIds.get(0);
		String etag = created.getResponse().getHeader("ETag");
		String clearing = AdminProductInputs.body("b6-clear", false).replace("\"stock\":5", "\"stock\":5,\"clearSalePrice\":true");
		mockMvc.perform(put("/admin/products/" + id).with(signed).header("If-Match", etag)
				.contentType(MediaType.APPLICATION_JSON).content(clearing)).andExpect(status().isUnprocessableEntity());
		mockMvc.perform(get("/admin/products/" + id).with(signed))
				.andExpect(jsonPath("$.variants[0].salePriceHuf").value(1));
		String disabled = clearing.replace("\"featured\":false", "\"featured\":false,\"promotion\":{\"enabled\":false}");
		mockMvc.perform(put("/admin/products/" + id).with(signed).header("If-Match", etag)
				.contentType(MediaType.APPLICATION_JSON).content(disabled)).andExpect(status().isOk())
				.andExpect(validAgainstContract()).andExpect(jsonPath("$.promotion.enabled").value(false))
				.andExpect(jsonPath("$.variants[0].salePriceHuf").doesNotExist());
		mockMvc.perform(get("/admin/products/" + id).with(signed)).andExpect(status().isOk())
				.andExpect(jsonPath("$.promotion.enabled").value(false))
				.andExpect(jsonPath("$.variants[0].salePriceHuf").doesNotExist());
	}
	@Test
	void rejectsSalePricesOutsideContractBounds() throws Exception {
		AdminLogin.Signed signed = AdminLogin.signIn(mockMvc);
		for (int price : new int[] { 0, 100_000_001 }) {
			String body = promotedBody("b6-limit").replace("\"salePriceHuf\":1", "\"salePriceHuf\":" + price);
			mockMvc.perform(post("/admin/products").with(signed)
					.contentType(MediaType.APPLICATION_JSON).content(body))
					.andExpect(status().isUnprocessableEntity());
		}
	}

}
