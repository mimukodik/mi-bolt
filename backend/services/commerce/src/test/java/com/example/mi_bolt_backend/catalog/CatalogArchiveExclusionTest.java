package com.example.mi_bolt_backend.catalog;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import com.example.mi_bolt_backend.test.IntegrationTest;

/**
 * Integration tests for the shop-side archive exclusion (MIM-327 B7).
 * Runs against the shared H2 fixture (3 products: samsung-galaxy-s25,
 * apple-iphone-16, nokia-105). The Apple product is archived through
 * {@link ProductRepository} in {@code @BeforeEach} and restored in
 * {@code @AfterEach}, so the shared fixture is unchanged for the rest of
 * the suite.
 */
@IntegrationTest
class CatalogArchiveExclusionTest {

	private static final String APPLE_SLUG = "apple-iphone-16";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ProductRepository products;

	private OffsetDateTime savedAppleArchivedAt;

	@BeforeEach
	void archiveApple() {
		Product apple = findApple();
		savedAppleArchivedAt = apple.getArchivedAt();
		apple.setArchivedAt(OffsetDateTime.now(ZoneOffset.UTC));
		products.save(apple);
	}

	@AfterEach
	void restoreApple() {
		Product apple = findApple();
		apple.setArchivedAt(savedAppleArchivedAt);
		products.save(apple);
	}

	private Product findApple() {
		List<Product> all = products.findAll();
		for (Product p : all) {
			if (APPLE_SLUG.equals(p.getSlug())) {
				return p;
			}
		}
		throw new IllegalStateException("apple-iphone-16 missing from the fixture");
	}

	@Test
	void listProductsOmitsAppleAndDropsTotalToFour() throws Exception {
		mockMvc.perform(get("/products"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(4))
				.andExpect(jsonPath("$.items.length()").value(4))
				.andExpect(jsonPath("$.items[?(@.brand == 'Apple')]").isEmpty())
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void listProductsBrandFacetHasNoApple() throws Exception {
		mockMvc.perform(get("/products"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.facets.brands[?(@.value == 'Apple')]").isEmpty())
				.andExpect(validAgainstContract());
	}

	@Test
	void getArchivedProductReturns404() throws Exception {
		mockMvc.perform(get("/products/" + APPLE_SLUG))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.params.slug").value(APPLE_SLUG))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void relatedForActiveProductHasNoApple() throws Exception {
		mockMvc.perform(get("/products/samsung-galaxy-s25/related"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.slug == 'apple-iphone-16')]").isEmpty())
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void relatedForArchivedProductReturns404() throws Exception {
		mockMvc.perform(get("/products/" + APPLE_SLUG + "/related"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.params.slug").value(APPLE_SLUG))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}
}
