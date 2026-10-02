package com.example.mi_bolt_backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.mi_bolt_backend.test.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

/** The run id comes from {@code MIBOLT_PUBLISHER_RUN_ID} in application-test.properties. */
@IntegrationTest
class ReleaseInfoTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void infoReportsThePublisherRunTheChartInstalled() throws Exception {
		mockMvc.perform(get("/actuator/info"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.release.publisherRunId").value("37049383413"));
	}
}
