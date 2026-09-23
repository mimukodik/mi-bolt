package com.example.mi_bolt_backend.problem;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.mi_bolt_backend.test.IntegrationTest;
import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

/**
 * R1: drive a REAL error dispatch through the dispatcher servlet to
 * {@link ProblemErrorController} at {@code /error} (not the
 * {@code @ExceptionHandler} in {@link ProblemAdvice}). A request that
 * carries {@link RequestDispatcher#ERROR_STATUS_CODE} simulates the state
 * Boot's error-page machinery hands to {@code /error} and the controller
 * must answer with 503 problem+json for any non-404 status.
 */
@IntegrationTest
class RealDispatchTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void uncaughtRuntimeExceptionRoutesThroughErrorControllerAs503() throws Exception {
		mockMvc.perform(get("/error")
						.requestAttr(RequestDispatcher.ERROR_STATUS_CODE, 500)
						.requestAttr(RequestDispatcher.ERROR_EXCEPTION,
								new RuntimeException("kaboom")))
				.andExpect(status().isServiceUnavailable())
				.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
				.andExpect(jsonPath("$.code").value("SERVICE_UNAVAILABLE"))
				.andExpect(header().exists("X-Trace-Id"));
	}
}


