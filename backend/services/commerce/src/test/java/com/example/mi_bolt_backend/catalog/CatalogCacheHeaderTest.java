package com.example.mi_bolt_backend.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.test.IntegrationTest;

/**
 * Integration tests for the Cache-Control headers on the catalogue endpoints.
 * Runs against the H2 fixture loaded by {@link CatalogLoader} (3 products, 10 variants,
 * 4 images). Every assertion matches the literal header value "no-cache". The contract
 * validator is applied to every response.
 */
@IntegrationTest
class CatalogCacheHeaderTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void listProductsIsRevalidatedOnEveryUse() throws Exception {
		mockMvc.perform(get("/products"))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-cache"))
				.andExpect(validAgainstContract());
	}

	@Test
	void getProductIsRevalidatedOnEveryUse() throws Exception {
		mockMvc.perform(get("/products/samsung-galaxy-s25"))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-cache"))
				.andExpect(validAgainstContract());
	}

	@Test
	void relatedProductsAreRevalidatedOnEveryUse() throws Exception {
		mockMvc.perform(get("/products/samsung-galaxy-s25/related"))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-cache"))
				.andExpect(validAgainstContract());
	}
}