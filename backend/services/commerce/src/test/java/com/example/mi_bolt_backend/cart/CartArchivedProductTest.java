package com.example.mi_bolt_backend.cart;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.catalog.ProductRepository;
import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * Integration tests for the cart-side archive exclusion (MIM-327 B7).
 * Runs against the shared H2 fixture. Every test archives the product
 * whose line it adds, runs its scenario, and restores the original
 * {@code archivedAt} value in {@code @AfterEach} so the shared fixture
 * is left untouched.
 */
@IntegrationTest
class CartArchivedProductTest {

	private static final String APPLE_SLUG = "apple-iphone-16";
	private static final String APPLE_128 = "apple-iphone-16--midnight--128";
	private static final String SAMSUNG_SLUG = "samsung-galaxy-s25";
	private static final String NAVY_128 = "samsung-galaxy-s25--navy--128";

	private static final String CONTACT =
			"\"contact\":{\"fullName\":\"Anna Kovács\",\"email\":\"anna@example.com\",\"phone\":\"+36301234567\"}";
	private static final String BILLING =
			"\"billing\":{\"name\":\"Anna Kovács\",\"address\":{\"countryCode\":\"HU\",\"postalCode\":\"1111\","
					+ "\"city\":\"Budapest\",\"line1\":\"Fő utca 1\"}}";
	private static final String PICKUP = "\"delivery\":{\"optionId\":\"pickup_point\"}";
	private static final String COD = "\"payment\":{\"method\":\"cash_on_delivery\"}";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ProductRepository products;

	private final Map<String, OffsetDateTime> savedArchivedAt = new HashMap<>();

	@AfterEach
	void restoreProducts() {
		List<Product> all = products.findAll();
		for (Product p : all) {
			if (savedArchivedAt.containsKey(p.getSlug())) {
				p.setArchivedAt(savedArchivedAt.get(p.getSlug()));
				products.save(p);
			}
		}
		savedArchivedAt.clear();
	}

	private void archiveProduct(String slug) {
		List<Product> all = products.findAll();
		for (Product p : all) {
			if (slug.equals(p.getSlug())) {
				savedArchivedAt.put(slug, p.getArchivedAt());
				p.setArchivedAt(OffsetDateTime.now(ZoneOffset.UTC));
				products.save(p);
				return;
			}
		}
		throw new IllegalStateException(slug + " missing from the fixture");
	}

	@Test
	void archivedLineIsRemovedWithNoticeAndVersionBumps() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", APPLE_128, 1)).andExpect(status().isOk());

		archiveProduct(APPLE_SLUG);

		mockMvc.perform(get("/cart").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"3\""))
				.andExpect(jsonPath("$.version").value(3))
				.andExpect(jsonPath("$.items.length()").value(0))
				.andExpect(jsonPath("$.lineCount").value(0))
				.andExpect(jsonPath("$.notices.length()").value(1))
				.andExpect(jsonPath("$.notices[0].code").value("ITEM_REMOVED"))
				.andExpect(jsonPath("$.notices[0].variantId").value(APPLE_128))
				.andExpect(jsonPath("$.notices[0].params.quantity").value(1))
				.andExpect(jsonPath("$.notices[0].productName").value("iPhone 16"))
				.andExpect(jsonPath("$.notices[0].params.from").doesNotExist())
				.andExpect(jsonPath("$.notices[0].params.to").doesNotExist())
				.andExpect(validAgainstContract());
	}

	@Test
	void addOfArchivedVariantIs409OutOfStock() throws Exception {
		String cookie = newSession();
		archiveProduct(APPLE_SLUG);

		mockMvc.perform(add(cookie, "\"1\"", APPLE_128, 1))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("OUT_OF_STOCK"))
				.andExpect(jsonPath("$.params.variantId").value(APPLE_128))
				.andExpect(validAgainstContract());
	}

	@Test
	void setQuantityOnArchivedLineIs409QuantityLimitWithMaxZero() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", APPLE_128, 1)).andExpect(status().isOk());

		archiveProduct(APPLE_SLUG);

		mockMvc.perform(patch("/cart/items/" + APPLE_128)
						.cookie(cookie(cookie))
						.header("If-Match", "\"2\"")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"quantity\":1}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("QUANTITY_LIMIT"))
				.andExpect(jsonPath("$.params.max").value(0))
				.andExpect(jsonPath("$.params.requested").value(1))
				.andExpect(validAgainstContract());
	}

	@Test
	void placeOrderWithArchivedLineIs409OutOfStock() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch("/checkout")
				.cookie(cookie(cookie))
				.header("If-Match", "\"2\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{" + CONTACT + "," + BILLING + "," + PICKUP + "," + COD + "}"))
				.andExpect(status().isOk());

		archiveProduct(SAMSUNG_SLUG);

		mockMvc.perform(post("/orders")
						.cookie(cookie(cookie))
						.header("If-Match", "\"3\"")
						.header("Idempotency-Key", "key-" + UUID.randomUUID())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"paymentMethod\":\"cash_on_delivery\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("OUT_OF_STOCK"))
				.andExpect(jsonPath("$.params.notices[0]").value("ITEM_REMOVED"))
				.andExpect(validAgainstContract());
	}

	private String newSession() throws Exception {
		MvcResult result = mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andReturn();
		return result.getResponse().getCookie(SessionCookieFilter.COOKIE_NAME).getValue();
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
}
