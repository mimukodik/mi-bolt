package com.example.mi_bolt_backend.order;

import static com.example.mi_bolt_backend.test.ContractValidation.JSON;
import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * Integration tests for the two order endpoints. Runs against the shared H2
 * fixture (3 products, 10 variants). NAVY_128 (samsung-galaxy-s25--navy--128,
 * stock 7) drives the card-path tests; NAVY_ALT_256
 * (samsung-galaxy-s25--navy-alt--256, stock 1) drives the stock-race test.
 */
@IntegrationTest
class OrdersApiTest {

	private static final String NAVY_128 = "samsung-galaxy-s25--navy--128";
	private static final String NAVY_ALT_256 = "samsung-galaxy-s25--navy-alt--256";

	private static final String CONTACT =
			"\"contact\":{\"fullName\":\"Anna Kovács\",\"email\":\"anna@example.com\",\"phone\":\"+36301234567\"}";
	private static final String BILLING =
			"\"billing\":{\"name\":\"Anna Kovács\",\"address\":{\"countryCode\":\"HU\",\"postalCode\":\"1111\","
					+ "\"city\":\"Budapest\",\"line1\":\"Fő utca 1\"}}";
	private static final String HOME =
			"\"delivery\":{\"optionId\":\"home_delivery\",\"address\":{\"countryCode\":\"HU\",\"postalCode\":\"1111\","
					+ "\"city\":\"Budapest\",\"line1\":\"Fő utca 1\",\"line2\":\"2. em.\"}}";
	private static final String PICKUP = "\"delivery\":{\"optionId\":\"pickup_point\"}";
	private static final String CARD = "\"payment\":{\"method\":\"card\"}";
	private static final String COD = "\"payment\":{\"method\":\"cash_on_delivery\"}";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CartRepository carts;

	@Autowired
	private ProductVariantRepository variants;

	@Autowired
	private ShopOrderRepository orders;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private OrderService orderService;

	@Test
	void cardOrderHappyPath() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		String intentId = createResolvedIntent(cookie, etag);

		String key = "key-" + UUID.randomUUID();
		String body = "{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
				+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}";
		try {
			MvcResult result = mockMvc.perform(post("/orders")
					.cookie(cookie(cookie))
					.header("If-Match", "\"" + etag + "\"")
					.header("Idempotency-Key", key)
					.contentType(MediaType.APPLICATION_JSON)
					.content(body))
					.andExpect(status().isCreated())
					.andExpect(jsonPath("$.orderNumber").value(Matchers.matchesPattern("^DEMO-[0-9]{6}$")))
					.andExpect(jsonPath("$.status").value("confirmed"))
					.andExpect(jsonPath("$.items.length()").value(1))
					.andExpect(jsonPath("$.items[0].variantId").value(NAVY_128))
					.andExpect(jsonPath("$.items[0].productName").value("Galaxy S25"))
					.andExpect(jsonPath("$.items[0].colorName").value("Sötétkék"))
					.andExpect(jsonPath("$.items[0].storageGb").value(128))
					.andExpect(jsonPath("$.items[0].quantity").value(1))
					.andExpect(jsonPath("$.items[0].unitPrice.amount").value(299990))
					.andExpect(jsonPath("$.items[0].lineTotal.amount").value(299990))
					.andExpect(jsonPath("$.subtotal.amount").value(299990))
					.andExpect(jsonPath("$.shippingFee.amount").value(0))
					.andExpect(jsonPath("$.paymentFee.amount").value(0))
					.andExpect(jsonPath("$.total.amount").value(299990))
					.andExpect(jsonPath("$.paymentMethod").value("card"))
					.andExpect(jsonPath("$.delivery.optionId").value("home_delivery"))
					.andExpect(jsonPath("$.delivery.address.line2").value("2. em."))
					.andExpect(jsonPath("$.billing.name").value("Anna Kovács"))
					.andExpect(jsonPath("$.contactEmail").value("anna@example.com"))
					.andExpect(jsonPath("$.notice").value(
							"Ez egy demó rendelés: nem történt valódi fizetés, kiszállítás vagy e-mail-küldés."))
					.andExpect(validAgainstContract())
					.andReturn();
			String id = JSON.readTree(result.getResponse().getContentAsString()).get("id").asText();
			String location = result.getResponse().getHeader("Location");
			assertNotNull(location, "Location header is required");
			assertTrue(location.endsWith("/orders/" + id),
					"Location must end with /orders/<id>, got " + location);

			// Fresh empty cart, version bumped to 4.
			mockMvc.perform(get("/cart").cookie(cookie(cookie)))
					.andExpect(status().isOk())
					.andExpect(header().string("ETag", "\"4\""))
					.andExpect(jsonPath("$.items.length()").value(0));

			mockMvc.perform(get("/checkout").cookie(cookie(cookie)))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.contact").doesNotExist())
					.andExpect(jsonPath("$.complete").value(false));

			mockMvc.perform(get("/orders/" + id).cookie(cookie(cookie)))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.orderNumber")
							.value(JSON.readTree(result.getResponse().getContentAsString()).get("orderNumber").asText()));

			String other = newSession();
			mockMvc.perform(get("/orders/" + id).cookie(cookie(other)))
					.andExpect(status().isNotFound())
					.andExpect(jsonPath("$.code").value("NOT_FOUND"));

			assertEquals(6L, variants.findById(NAVY_128).orElseThrow().getStock().longValue(),
					"stock must decrement by one after a successful card order");
		}
		finally {
			jdbcTemplate.update("UPDATE product_variant SET stock = 7 WHERE id = ?", NAVY_128);
		}
	}

	@Test
	void sameKeyReplaysTheReceiptBeforeAnyCheck() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);
		long ordersBefore = orders.count();

		String key = "key-" + UUID.randomUUID();
		String body = "{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
				+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}";
		MvcResult first = mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
				.andExpect(status().isCreated())
				.andReturn();
		MvcResult replay = mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"3\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
				.andExpect(status().isCreated())
				.andReturn();
		assertEquals(first.getResponse().getContentAsString(),
				replay.getResponse().getContentAsString(),
				"the replayed receipt must equal the first response byte-for-byte");
		assertEquals(ordersBefore + 1, orders.count(),
				"a replayed request must not create a second order");
	}

	@Test
	void sameKeyDifferentBodyIs409IdempotencyConflict() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);

		String key = "key-" + UUID.randomUUID();
		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":false}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
	}

	@Test
	void codOrderNeedsNoIntentAndAddsItsFee() throws Exception {
		String cookie = newSession();
		String etag = completeCodDraft(cookie);

		String key = "key-" + UUID.randomUUID();
		try {
			mockMvc.perform(post("/orders")
					.cookie(cookie(cookie))
					.header("If-Match", "\"" + etag + "\"")
					.header("Idempotency-Key", key)
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"paymentMethod\":\"cash_on_delivery\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
					.andExpect(status().isCreated())
					.andExpect(jsonPath("$.paymentFee.amount").value(490))
					.andExpect(jsonPath("$.shippingFee.amount").value(0))
					.andExpect(jsonPath("$.total.amount").value(300480))
					.andExpect(jsonPath("$.delivery.optionId").value("pickup_point"))
					.andExpect(jsonPath("$.delivery.address").doesNotExist())
					.andExpect(validAgainstContract());
		}
		finally {
			jdbcTemplate.update("UPDATE product_variant SET stock = 7 WHERE id = ?", NAVY_128);
		}
	}

	@Test
	void termsNotAcceptedIs422() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":false}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/acceptedTerms"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("TERMS_NOT_ACCEPTED"));
	}

	@Test
	void outdatedTermsVersionIs422() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2020-01\",\"acceptedTerms\":true}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/termsVersion"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("TERMS_VERSION_OUTDATED"))
				.andExpect(jsonPath("$.params.current").value("2026-09"));
	}

	@Test
	void cardOrderWithoutIntentIs400() throws Exception {
		// docs/02 rule 38: a card order without paymentIntentId is a schema
		// violation. The generated @NotNull on CardOrderRequest.paymentIntentId
		// fires through ProblemAdvice.handleBodyValidation, which answers 400
		// INVALID_REQUEST for a missing member since T9b.
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/paymentIntentId"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("REQUIRED"));
		// validAgainstContract() would fail here: the request body is intentionally
		// missing paymentIntentId, which is exactly what the test pins. The local
		// unknownPaymentMethodIs400 follows the same pattern and does not chain
		// the matcher either.
	}

	@Test
	void unknownPaymentMethodIs400() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"bitcoin\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void codOrderWithIntentIdIs400() throws Exception {
		// docs/02 rule 39: paymentIntentId does not exist on a cash-on-delivery
		// order. Jackson fails on the undeclared member and ProblemAdvice answers
		// 400. No validAgainstContract(): the request is invalid on purpose.
		String cookie = newSession();
		String etag = completeCodDraft(cookie);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"cash_on_delivery\",\"paymentIntentId\":\"pi-123\","
						+ "\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.detail").value("Malformed request body"));
	}

	@Test
	void requiresActionIntentIs422PaymentRequired() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createIntent(cookie, etag);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PAYMENT_REQUIRED"));
	}

	@Test
	void aSucceededIntentBacksOneOrderOnly() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);
		long ordersBefore = orders.count();
		long stockBefore = variants.findById(NAVY_128).orElseThrow().getStock().longValue();
		try {
			mockMvc.perform(cardOrder(cookie, etag, intentId)).andExpect(status().isCreated());
			String secondEtag = refillCardDraftAfterAnOrder(cookie);

			mockMvc.perform(cardOrder(cookie, secondEtag, intentId))
					.andExpect(status().isUnprocessableEntity())
					.andExpect(jsonPath("$.code").value("PAYMENT_REQUIRED"));

			assertEquals(ordersBefore + 1, orders.count(), "a reused intent must not create a second order");
			assertEquals(stockBefore - 1, variants.findById(NAVY_128).orElseThrow().getStock().longValue(),
					"the refused second order must not decrement stock");
		}
		finally {
			jdbcTemplate.update("UPDATE product_variant SET stock = 7 WHERE id = ?", NAVY_128);
		}
	}

	@Test
	void theUniqueConstraintRefusesAReusedIntentThatSlipsPastTheServiceCheck() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);
		long ordersBefore = orders.count();
		long stockBefore = variants.findById(NAVY_128).orElseThrow().getStock().longValue();
		try {
			mockMvc.perform(cardOrder(cookie, etag, intentId)).andExpect(status().isCreated());
			String secondEtag = refillCardDraftAfterAnOrder(cookie);

			// Stands in for a concurrent request that passed OrderService's check before the
			// first order committed: existsByPaymentIntentId answers false, so only the
			// uq_shop_order_payment_intent constraint can refuse the insert. A delegating proxy
			// rather than a spy, for the reasons OrderNumberRetryApiTest's Javadoc gives.
			ReflectionTestUtils.setField(orderService, "orders", existsByPaymentIntentIdAlwaysFalse());

			mockMvc.perform(cardOrder(cookie, secondEtag, intentId))
					.andExpect(status().isUnprocessableEntity())
					.andExpect(jsonPath("$.code").value("PAYMENT_REQUIRED"));

			assertEquals(ordersBefore + 1, orders.count(), "the constraint must leave no second order behind");
			assertEquals(stockBefore - 1, variants.findById(NAVY_128).orElseThrow().getStock().longValue(),
					"the rolled-back second order must not decrement stock");
		}
		finally {
			ReflectionTestUtils.setField(orderService, "orders", orders);
			jdbcTemplate.update("UPDATE product_variant SET stock = 7 WHERE id = ?", NAVY_128);
		}
	}

	@Test
	void pendingIntentIs422PaymentPending() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag, "pending");

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PAYMENT_PENDING"));
	}

	@Test
	void declinedIntentIs422PaymentDeclined() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag, "declined");

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PAYMENT_DECLINED"));
	}

	@Test
	void incompleteDraftIs422() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "}")).andExpect(status().isOk());

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"3\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"any\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("CHECKOUT_INCOMPLETE"))
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/billing')]").exists())
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/delivery')]").exists())
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/payment')]").exists());
	}

	@Test
	void paymentMethodMismatchIs422() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"cash_on_delivery\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("CHECKOUT_INCOMPLETE"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/paymentMethod"));
	}

	@Test
	void stockRunningOutIs409OutOfStock() throws Exception {
		try {
			// First scenario: reconciliation notice path. Stock is forced to 0
			// before the order call, so the cart's reconciliation produces an
			// ITEM_REMOVED notice and the order answers 409 OUT_OF_STOCK.
			String cookieA = newSession();
			String etagA = completeDraftWithAlt(cookieA);
			String intentIdA = createResolvedIntent(cookieA, etagA);
			jdbcTemplate.update("UPDATE product_variant SET stock = 0 WHERE id = ?", NAVY_ALT_256);
			try {
				mockMvc.perform(post("/orders")
						.cookie(cookie(cookieA))
						.header("If-Match", "\"" + etagA + "\"")
						.header("Idempotency-Key", "key-" + UUID.randomUUID())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentIdA
								+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
						.andExpect(status().isConflict())
						.andExpect(jsonPath("$.code").value("OUT_OF_STOCK"));
			}
			finally {
				jdbcTemplate.update("UPDATE product_variant SET stock = 1 WHERE id = ?", NAVY_ALT_256);
			}

			// Second scenario: two sessions, stock 1. The first order lands and
			// decrements stock to 0; the conditional update in the second order
			// affects zero rows and the order answers 409 OUT_OF_STOCK.
			String cookie1 = newSession();
			String etag1 = completeDraftWithAlt(cookie1);
			String intentId1 = createResolvedIntent(cookie1, etag1);
			String cookie2 = newSession();
			String etag2 = completeDraftWithAlt(cookie2);
			String intentId2 = createResolvedIntent(cookie2, etag2);

			mockMvc.perform(post("/orders")
					.cookie(cookie(cookie1))
					.header("If-Match", "\"" + etag1 + "\"")
					.header("Idempotency-Key", "key-" + UUID.randomUUID())
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId1
							+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
					.andExpect(status().isCreated());
			mockMvc.perform(post("/orders")
					.cookie(cookie(cookie2))
					.header("If-Match", "\"" + etag2 + "\"")
					.header("Idempotency-Key", "key-" + UUID.randomUUID())
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId2
							+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
					.andExpect(status().isConflict())
					.andExpect(jsonPath("$.code").value("OUT_OF_STOCK"));
		}
		finally {
			jdbcTemplate.update("UPDATE product_variant SET stock = 1 WHERE id = ?", NAVY_ALT_256);
		}
	}

	@Test
	void staleIfMatchIs412() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"1\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("CART_VERSION_CONFLICT"));
	}

	@Test
	void expiredCartIs410() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		String intentId = createResolvedIntent(cookie, etag);

		MvcResult cartGet = mockMvc.perform(get("/cart").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andReturn();
		String firstId = JSON.readTree(cartGet.getResponse().getContentAsString()).get("id").asText();
		Cart persisted = carts.findById(Long.parseLong(firstId))
				.orElseThrow(() -> new IllegalStateException("expected a persisted cart for the new session"));
		persisted.touch(OffsetDateTime.now(), OffsetDateTime.now().minusSeconds(1));
		carts.save(persisted);

		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(status().isGone())
				.andExpect(jsonPath("$.code").value("CART_EXPIRED"));
	}

	private String newSession() throws Exception {
		MvcResult result = mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andReturn();
		String cookie = extractCookieValue(result.getResponse().getHeader("Set-Cookie"));
		assertNotNull(cookie, "the first GET /cart must issue a Set-Cookie");
		return cookie;
	}

	private String createIntent(String cookie, String etag) throws Exception {
		MvcResult created = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		return JSON.readTree(created.getResponse().getContentAsString()).get("id").asText();
	}

	private String createResolvedIntent(String cookie, String etag) throws Exception {
		return createResolvedIntent(cookie, etag, "succeeded");
	}

	private String createResolvedIntent(String cookie, String etag, String outcome) throws Exception {
		String id = createIntent(cookie, etag);
		mockMvc.perform(post("/payment-intents/" + id + "/outcome")
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"" + outcome + "\"}"))
				.andExpect(status().isOk());
		return id;
	}

	private MockHttpServletRequestBuilder cardOrder(String cookie, String etag, String intentId) {
		return post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}");
	}

	/**
	 * After an order the session's fresh cart is at version 4 (cardOrderHappyPath
	 * asserts ETag "4"); one add and one draft patch bring it to 6.
	 */
	private String refillCardDraftAfterAnOrder(String cookie) throws Exception {
		mockMvc.perform(add(cookie, "\"4\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"5\"", "{" + CONTACT + "," + BILLING + "," + HOME + "," + CARD + "}"))
				.andExpect(status().isOk());
		return "6";
	}

	/**
	 * A {@link ShopOrderRepository} that delegates every call to {@link #orders}
	 * except {@code existsByPaymentIntentId}, which always answers {@code false},
	 * so only the real {@code uq_shop_order_payment_intent} constraint can refuse
	 * a reused intent.
	 */
	private ShopOrderRepository existsByPaymentIntentIdAlwaysFalse() {
		return (ShopOrderRepository) Proxy.newProxyInstance(
				ShopOrderRepository.class.getClassLoader(),
				new Class<?>[] { ShopOrderRepository.class },
				(proxyInstance, method, args) -> {
					if ("existsByPaymentIntentId".equals(method.getName())) {
						return false;
					}
					try {
						return method.invoke(orders, args);
					}
					catch (InvocationTargetException e) {
						throw e.getCause();
					}
				});
	}

	private String completeCardDraft(String cookie) throws Exception {
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "," + BILLING + "," + HOME + "," + CARD + "}"))
				.andExpect(status().isOk());
		return "3";
	}

	private String completeCodDraft(String cookie) throws Exception {
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "," + BILLING + "," + PICKUP + "," + COD + "}"))
				.andExpect(status().isOk());
		return "3";
	}

	private String completeDraftWithAlt(String cookie) throws Exception {
		mockMvc.perform(add(cookie, "\"1\"", NAVY_ALT_256, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "," + BILLING + "," + HOME + "," + CARD + "}"))
				.andExpect(status().isOk());
		return "3";
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

	private static MockHttpServletRequestBuilder patch(String cookie, String ifMatch, String json) {
		return MockMvcRequestBuilders.patch("/checkout")
				.cookie(cookie(cookie))
				.header("If-Match", ifMatch)
				.contentType(MediaType.APPLICATION_JSON)
				.content(json);
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
