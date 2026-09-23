package com.example.mi_bolt_backend.test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.mi_bolt_backend.api.model.Product;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.opentest4j.AssertionFailedError;
import java.time.LocalDate;

@IntegrationTest
class JacksonNonNullTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void absentOptionalMemberIsOmittedNotNullViaSpringConverter() throws Exception {
		// Read what Spring's converter produces for an Address whose line2 was never set.
		// Spring Boot 4.1.1 honours spring.jackson.default-property-inclusion=non_null.
		MvcResult result = mockMvc.perform(get("/probe/__address"))
				.andExpect(status().isOk())
				.andReturn();
		String json = result.getResponse().getContentAsString();
		if (json.contains("\"line2\"")) {
			throw new AssertionFailedError(
					"absent line2 should be omitted, was: " + json);
		}
		if (json.contains(":null")) {
			throw new AssertionFailedError(
					"absent optional member must not serialise as null, was: " + json);
		}
	}

	@Test
	void productsEmptyVariantsListIsSerialisedAsEmptyArray() throws Exception {
		Product product = new Product(
				"id-1",
				"slug-1",
				"Brand",
				"Name",
				List.of("h1"),
				true,
				LocalDate.of(2026, 1, 1),
				"Description",
				List.of(),
				List.of());

		String json = ContractValidation.JSON.writeValueAsString(product);
		if (!json.contains("\"variants\":[]")) {
			throw new AssertionFailedError(
					"empty variants serialised as []: " + json);
		}
	}
}
