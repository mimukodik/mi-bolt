package com.example.mi_bolt_backend.test;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.atlassian.oai.validator.model.Request;
import com.atlassian.oai.validator.model.Response;
import com.atlassian.oai.validator.model.SimpleResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

@IntegrationTest
class ContractValidatorTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void problemJson404ForUnknownProductPassesContract() throws Exception {
		mockMvc.perform(get("/products/nope"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(validAgainstContract());
	}

	@Test
	void validatorAcceptsValidProblemBody() {
		String validBody = """
				{"type":"urn:mi-bolt:problem:not-found","title":"Not found","status":404,
				 "code":"NOT_FOUND","detail":"x","traceId":"abc","fieldErrors":[]}
				""";
		Response response = SimpleResponse.Builder.status(404)
				.withContentType("application/problem+json")
				.withBody(validBody)
				.build();
		var report = ContractValidation.validator().validateResponse(
				"/products/{slug}",
				Request.Method.GET,
				response);
		assertFalse(report.hasErrors(),
				"validator should accept a body that matches the Problem schema, was: " + report);
	}

	@Test
	void validatorRejectsProblemBodyWithoutCode() {
		String bodyWithoutCode = """
				{"type":"urn:mi-bolt:problem:not-found","title":"Not found","status":404,
				 "detail":"x","traceId":"abc","fieldErrors":[]}
				""";
		Response response = SimpleResponse.Builder.status(404)
				.withContentType("application/problem+json")
				.withBody(bodyWithoutCode)
				.build();
		var report = ContractValidation.validator().validateResponse(
				"/products/{slug}",
				Request.Method.GET,
				response);
		assertTrue(report.hasErrors(),
				"validator should reject a body missing the required code field");
		boolean hasRequiredKey = report.getMessages().stream()
				.anyMatch(m -> m.getKey() != null && m.getKey().contains("validation.response.body.schema.required"));
		assertTrue(hasRequiredKey,
				"expected at least one message with key validation.response.body.schema.required, was: "
						+ report.getMessages());
	}
}
