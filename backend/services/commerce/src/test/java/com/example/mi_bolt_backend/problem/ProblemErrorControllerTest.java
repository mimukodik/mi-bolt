package com.example.mi_bolt_backend.problem;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.mi_bolt_backend.test.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import jakarta.servlet.RequestDispatcher;

@IntegrationTest
class ProblemErrorControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void errorPathRenders404AsProblemJson() throws Exception {
		mockMvc.perform(get("/error")
						.requestAttr(RequestDispatcher.ERROR_STATUS_CODE, 404))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}
}
