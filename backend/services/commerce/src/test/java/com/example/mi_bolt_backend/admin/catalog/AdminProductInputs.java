package com.example.mi_bolt_backend.admin.catalog;

import com.example.mi_bolt_backend.test.AdminLogin;
import com.jayway.jsonpath.JsonPath;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A valid AdminProductInput body and the create/delete steps the write API tests share. */
final class AdminProductInputs {

	static final String IMAGE_ID = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";

	private AdminProductInputs() {
	}

	static String body(String productSlug, boolean featured) {
		return """
				{"slug":"%s","brand":"Testbrand","name":"Test phone","description":"A phone made for a test.",
				"is5g":true,"releasedAt":"2026-01-15","rank":90,"popularityScore":10,"featured":%s,
				"highlights":["Long battery"],
				"colors":[{"code":"black","name":"Fekete","swatchHex":"#000000","imageId":"%s","alt":"Test phone, black"}],
				"variants":[{"slug":"%s-black-128","colorCode":"black","storageGb":128,
				"price":{"amount":99990,"currency":"HUF"},"stock":5}],
				"specGroups":[{"title":"Kijelző","rows":[{"label":"Méret","value":"6,1 hüvelyk"}]}]}
				""".formatted(productSlug, featured, IMAGE_ID, productSlug);
	}

	static long create(MockMvc mockMvc, AdminLogin.Signed signed, String productSlug, boolean featured) throws Exception {
		MvcResult result = mockMvc.perform(post("/admin/products")
						.with(signed)
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(productSlug, featured)))
				.andExpect(status().isCreated())
				.andReturn();
		Number id = JsonPath.read(result.getResponse().getContentAsString(), "$.id");
		return id.longValue();
	}

	static void delete(JdbcTemplate jdbc, long productId) {
		jdbc.update("delete from product_variant where product_id = ?", productId);
		jdbc.update("delete from product_color where product_id = ?", productId);
		jdbc.update("delete from product_highlight where product_id = ?", productId);
		jdbc.update("delete from spec_row where spec_group_id in (select id from spec_group where product_id = ?)", productId);
		jdbc.update("delete from spec_group where product_id = ?", productId);
		jdbc.update("delete from product where id = ?", productId);
	}
}
