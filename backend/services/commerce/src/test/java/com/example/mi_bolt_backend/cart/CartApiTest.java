package com.example.mi_bolt_backend.cart;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.json.JsonMapper;

/**
 * Integration tests for the five cart endpoints. Runs against the H2 fixture
 * loaded by {@code CatalogLoader} (3 products, 10 variants, 4 images) and the
 * session-cookie filter. Every assertion matches a literal the brief states or
 * pins the helper behaviour (the {@code Set-Cookie} header on the first
 * request, the {@code ETag} that mirrors the version, the {@code If-Match}
 * check that blocks a stale write). The contract validator is applied to
 * every response.
 */
@IntegrationTest
class CartApiTest {

	private static final String NAVY_128 = "samsung-galaxy-s25--navy--128";
	private static final String NAVY_256 = "samsung-galaxy-s25--navy--256";
	private static final String NOKIA = "nokia-105--black--128";
	private static final String NAVY_SHA = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CartRepository carts;

	@Test
	void getCartCreatesAnEmptyCartWithEtag() throws Exception {
		MvcResult first = mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andExpect(header().exists("Set-Cookie"))
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.version").value(1))
				.andExpect(jsonPath("$.id").isString())
				.andExpect(jsonPath("$.items.length()").value(0))
				.andExpect(jsonPath("$.lineCount").value(0))
				.andExpect(jsonPath("$.totalQuantity").value(0))
				.andExpect(jsonPath("$.subtotal.amount").value(0))
				.andExpect(jsonPath("$.subtotal.currency").value("HUF"))
				.andExpect(jsonPath("$.notices.length()").value(0))
				.andExpect(jsonPath("$.expiresAt").isString())
				.andReturn();
		String cookie = extractCookieValue(first.getResponse().getHeader("Set-Cookie"));
		assertNotNull(cookie, "the first GET /cart must issue a Set-Cookie");

		mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(header().doesNotExist("Set-Cookie"))
				.andExpect(validAgainstContract());
	}

	@Test
	void addCreatesThenMergesTheLine() throws Exception {
		String cookie = newSession();

		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 2))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"2\""))
				.andExpect(jsonPath("$.version").value(2))
				.andExpect(jsonPath("$.items.length()").value(1))
				.andExpect(jsonPath("$.items[0].variantId").value(NAVY_128))
				.andExpect(jsonPath("$.items[0].variantSlug").isString())
				.andExpect(jsonPath("$.items[0].productSlug").value("samsung-galaxy-s25"))
				.andExpect(jsonPath("$.items[0].productName").value("Galaxy S25"))
				.andExpect(jsonPath("$.items[0].colorName").value("Sötétkék"))
				.andExpect(jsonPath("$.items[0].storageGb").value(128))
				.andExpect(jsonPath("$.items[0].image.src").value("/api/v1/media/" + NAVY_SHA))
				.andExpect(jsonPath("$.items[0].quantity").value(2))
				.andExpect(jsonPath("$.items[0].unitPrice.amount").value(299990))
				.andExpect(jsonPath("$.items[0].lineTotal.amount").value(599980))
				.andExpect(jsonPath("$.items[0].availability").value("in_stock"))
				.andExpect(jsonPath("$.items[0].maxQuantity").value(5))
				.andExpect(jsonPath("$.lineCount").value(1))
				.andExpect(jsonPath("$.totalQuantity").value(2))
				.andExpect(jsonPath("$.subtotal.amount").value(599980))
				.andExpect(validAgainstContract());

		mockMvc.perform(add(cookie, "\"2\"", NAVY_128, 3))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"3\""))
				.andExpect(jsonPath("$.items.length()").value(1))
				.andExpect(jsonPath("$.items[0].quantity").value(5))
				.andExpect(jsonPath("$.totalQuantity").value(5))
				.andExpect(jsonPath("$.subtotal.amount").value(1499950))
				.andExpect(validAgainstContract());
	}

	@Test
	void addOverTheLineMaximumIs409() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 2)).andExpect(status().isOk());
		mockMvc.perform(add(cookie, "\"2\"", NAVY_128, 3)).andExpect(status().isOk());

		mockMvc.perform(add(cookie, "\"3\"", NAVY_128, 1))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("QUANTITY_LIMIT"))
				.andExpect(jsonPath("$.params.max").value(5))
				.andExpect(jsonPath("$.params.requested").value(6))
				.andExpect(validAgainstContract());

		mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"3\""))
				.andExpect(jsonPath("$.items[0].quantity").value(5));
	}

	@Test
	void staleIfMatchIs412() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());

		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("CART_VERSION_CONFLICT"))
				.andExpect(jsonPath("$.params.expected").value(2))
				.andExpect(jsonPath("$.params.received").value(1))
				.andExpect(validAgainstContract());
	}

	@Test
	void missingOrMalformedIfMatchIs400() throws Exception {
		String cookie = newSession();

		mockMvc.perform(post("/cart/items")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"variantId\":\"" + NAVY_128 + "\",\"quantity\":1}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.params.header").value("If-Match"));

		mockMvc.perform(post("/cart/items")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "1")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"variantId\":\"" + NAVY_128 + "\",\"quantity\":1}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void outOfStockVariantIs409() throws Exception {
		String cookie = newSession();

		mockMvc.perform(add(cookie, "\"1\"", NOKIA, 1))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("OUT_OF_STOCK"))
				.andExpect(jsonPath("$.params.variantId").value(NOKIA))
				.andExpect(validAgainstContract());
	}

	@Test
	void unknownVariantIs404() throws Exception {
		String cookie = newSession();

		mockMvc.perform(add(cookie, "\"1\"", "nope", 1))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.params.variantId").value("nope"))
				.andExpect(validAgainstContract());
	}

	@Test
	void setQuantityIsAbsoluteAndCapped() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 2)).andExpect(status().isOk());

		mockMvc.perform(patch("/cart/items/" + NAVY_128)
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "\"2\"")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"quantity\":4}"))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"3\""))
				.andExpect(jsonPath("$.items[0].quantity").value(4))
				.andExpect(jsonPath("$.totalQuantity").value(4))
				.andExpect(validAgainstContract());

		mockMvc.perform(add(cookie, "\"3\"", NAVY_256, 1)).andExpect(status().isOk());

		mockMvc.perform(patch("/cart/items/" + NAVY_256)
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "\"4\"")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"quantity\":4}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("QUANTITY_LIMIT"))
				.andExpect(jsonPath("$.params.max").value(3))
				.andExpect(jsonPath("$.params.requested").value(4))
				.andExpect(validAgainstContract());
	}

	@Test
	void setQuantityOnAMissingLineIs404() throws Exception {
		String cookie = newSession();

		mockMvc.perform(patch("/cart/items/" + NAVY_128)
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "\"1\"")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"quantity\":1}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(jsonPath("$.params.variantId").value(NAVY_128))
				.andExpect(validAgainstContract());
	}

	@Test
	void removeIsIdempotentAndBumpsOnlyWhenItRemoves() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 2)).andExpect(status().isOk());

		mockMvc.perform(delete("/cart/items/" + NAVY_256)
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "\"2\""))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"2\""))
				.andExpect(jsonPath("$.items.length()").value(1))
				.andExpect(validAgainstContract());

		mockMvc.perform(delete("/cart/items/nope")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "\"2\""))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"))
				.andExpect(validAgainstContract());

		mockMvc.perform(delete("/cart/items/" + NAVY_128)
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "\"2\""))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"3\""))
				.andExpect(jsonPath("$.items.length()").value(0))
				.andExpect(jsonPath("$.lineCount").value(0))
				.andExpect(validAgainstContract());
	}

	@Test
	void clearBumpsTheVersionOnce() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(add(cookie, "\"2\"", NAVY_256, 1)).andExpect(status().isOk());

		mockMvc.perform(delete("/cart/items")
						.cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie))
						.header("If-Match", "\"3\""))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"4\""))
				.andExpect(jsonPath("$.items.length()").value(0))
				.andExpect(jsonPath("$.subtotal.amount").value(0))
				.andExpect(validAgainstContract());
	}

	@Test
	void expiredCartIs410ThenAFreshCartIsCreated() throws Exception {
		String cookie = newSession();
		MvcResult first = mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isOk())
				.andReturn();
		String firstId = JSON.readTree(first.getResponse().getContentAsString()).get("id").asText();
		Cart persisted = carts.findById(Long.parseLong(firstId))
				.orElseThrow(() -> new IllegalStateException("expected a persisted cart for the new session"));
		persisted.touch(OffsetDateTime.now(), OffsetDateTime.now().minusSeconds(1));
		carts.save(persisted);

		mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isGone())
				.andExpect(jsonPath("$.code").value("CART_EXPIRED"))
				.andExpect(validAgainstContract());

		MvcResult after = mockMvc.perform(get("/cart").cookie(new Cookie(SessionCookieFilter.COOKIE_NAME, cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(0))
				.andReturn();
		String secondId = JSON.readTree(after.getResponse().getContentAsString()).get("id").asText();
		if (secondId.equals(firstId)) {
			throw new IllegalStateException("expected a fresh cart id after expiry");
		}
	}

	private String newSession() throws Exception {
		MvcResult result = mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andReturn();
		String cookie = extractCookieValue(result.getResponse().getHeader("Set-Cookie"));
		assertNotNull(cookie, "the first GET /cart must issue a Set-Cookie");
		return cookie;
	}

	private static Cookie cookie(String value) {
		return new Cookie(SessionCookieFilter.COOKIE_NAME, value);
	}

	private static MockHttpServletRequestBuilder add(String cookie, String ifMatch, String variantId, int quantity) {
		return post("/cart/items")
				.cookie(cookie(cookie))
				.header("If-Match", ifMatch)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"variantId\":\"" + variantId + "\",\"quantity\":" + quantity + "}");
	}

	private static String extractCookieValue(String setCookieHeader) {
		if (setCookieHeader == null) {
			return null;
		}
		int eq = setCookieHeader.indexOf('=');
		int semi = setCookieHeader.indexOf(';', eq);
		if (eq < 0 || semi < 0) {
			return null;
		}
		String value = setCookieHeader.substring(eq + 1, semi);
		return value.isBlank() ? null : value;
	}
}