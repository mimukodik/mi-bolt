package com.example.mi_bolt_backend.catalog;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.test.IntegrationTest;

/**
 * Smoke F6 from docs/02 §7.1: image serving works. The assertion is the
 * same as the broader media test but named so the contract reviewer's grep
 * for the smoke markers finds it.
 */
@IntegrationTest
class SmokeF6Test {

	private static final String NAVY_SHA = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";

	@Autowired
	private MockMvc mockMvc;

	@Test
	void f6_imageServingWorks() throws Exception {
		mockMvc.perform(get("/media/" + NAVY_SHA))
				.andExpect(status().isOk())
				.andExpect(header().string("Content-Type", "image/png"))
				.andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"));
	}
}
