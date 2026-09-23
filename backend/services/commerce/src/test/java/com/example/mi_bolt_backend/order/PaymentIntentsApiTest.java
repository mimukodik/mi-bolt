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

import java.time.OffsetDateTime;
import java.util.UUID;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * Integration tests for the three payment-intent endpoints. Runs against the
 * shared H2 fixture (3 products, 10 variants) and the session-cookie filter.
 * The card draft is set up by adding NAVY_128 ×1 then PATCHing the four
 * sections; the resulting ETag is "3".
 */
@IntegrationTest
class PaymentIntentsApiTest {

	private static final String NAVY_128 = "samsung-galaxy-s25--navy--128";

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
	private JdbcTemplate jdbc;

	@Test
	void createReturns201WithLocationAndRequiresAction() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		String key = "key-" + UUID.randomUUID();
		MvcResult result = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.status").value("requires_action"))
				.andExpect(jsonPath("$.amount.amount").value(299990))
				.andExpect(jsonPath("$.amount.currency").value("HUF"))
				.andExpect(validAgainstContract())
				.andReturn();
		String id = idOf(result);
		String body = result.getResponse().getContentAsString();
		assertEquals("http://localhost:4210/demo-fizetes/" + id, JSON.readTree(body).get("redirectUrl").asText());
		assertEquals("http://localhost:4200/penztar?paymentIntentId=" + id, JSON.readTree(body).get("returnUrl").asText());
		String location = result.getResponse().getHeader("Location");
		assertNotNull(location, "Location header is required");
		assertTrue(location.endsWith("/payment-intents/" + id),
				"Location must end with /payment-intents/<id>, got " + location);

		OffsetDateTime createdAt = OffsetDateTime.parse(JSON.readTree(body).get("createdAt").asText());
		OffsetDateTime expiresAt = OffsetDateTime.parse(JSON.readTree(body).get("expiresAt").asText());
		assertTrue(expiresAt.isAfter(createdAt), "expiresAt must be after createdAt");

		// POST /payment-intents does not bump the cart version.
		mockMvc.perform(get("/cart").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"3\""));
	}

	@Test
	void sameKeyReplaysTheSameIntent() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		String key = "key-" + UUID.randomUUID();
		MvcResult first = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		MvcResult second = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		String firstBody = first.getResponse().getContentAsString();
		String secondBody = second.getResponse().getContentAsString();
		assertEquals(firstBody, secondBody, "The replayed body must equal the first response byte-for-byte");
		assertEquals(first.getResponse().getHeader("Location"),
				second.getResponse().getHeader("Location"),
				"The replayed Location must equal the first Location");
		String id = JSON.readTree(firstBody).get("id").asText();
		mockMvc.perform(get("/payment-intents/" + id).cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id))
				.andExpect(validAgainstContract());
	}

	@Test
	void sameKeyOnOrdersIsADifferentScope() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		String key = "key-" + UUID.randomUUID();
		MvcResult intent = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		String intentId = JSON.readTree(intent.getResponse().getContentAsString()).get("id").asText();

		// Reusing the intent key on POST /orders is a different scope; the order
		// endpoint reaches its own checks. The intent is requires_action, so the
		// order call returns 422 PAYMENT_REQUIRED, never 409 IDEMPOTENCY_CONFLICT.
		mockMvc.perform(post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}"))
				.andExpect(jsonPath("$.code").value(Matchers.not("IDEMPOTENCY_CONFLICT")));
	}

	@Test
	void missingOrShortIdempotencyKeyIs400() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.params.header").value("Idempotency-Key"));

		mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "short")
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void incompleteDraftIs422CheckoutIncomplete() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "}")).andExpect(status().isOk());

		mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"3\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("CHECKOUT_INCOMPLETE"))
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/billing')]").exists())
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/delivery')]").exists())
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/payment')]").exists());
	}

	@Test
	void codDraftIs422() throws Exception {
		String cookie = newSession();
		String etag = completeCodDraft(cookie);

		mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("CHECKOUT_INCOMPLETE"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/payment/method"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("CARD_REQUIRED"));
	}

	@Test
	void staleIfMatchIs412() throws Exception {
		String cookie = newSession();
		completeCardDraft(cookie);

		mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"1\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("CART_VERSION_CONFLICT"));
	}

	@Test
	void expiredCartIs410() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		MvcResult cartGet = mockMvc.perform(get("/cart").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andReturn();
		Cart persisted = carts.findById(Long.parseLong(idOf(cartGet)))
				.orElseThrow(() -> new IllegalStateException("expected a persisted cart for the new session"));
		persisted.touch(OffsetDateTime.now(), OffsetDateTime.now().minusSeconds(1));
		carts.save(persisted);

		mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isGone())
				.andExpect(jsonPath("$.code").value("CART_EXPIRED"))
				.andExpect(validAgainstContract());
	}

	@Test
	void resolveIsOneShotAndSessionScoped() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		String key = "key-" + UUID.randomUUID();
		MvcResult created = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		String id = idOf(created);

		mockMvc.perform(post("/payment-intents/" + id + "/outcome")
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"succeeded\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("succeeded"))
				.andExpect(validAgainstContract());

		mockMvc.perform(post("/payment-intents/" + id + "/outcome")
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"succeeded\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("PAYMENT_ALREADY_RESOLVED"))
				.andExpect(jsonPath("$.params.status").value("succeeded"));

		mockMvc.perform(get("/payment-intents/" + id).cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("succeeded"));

		String otherCookie = newSession();
		mockMvc.perform(get("/payment-intents/" + id).cookie(cookie(otherCookie)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
		mockMvc.perform(post("/payment-intents/" + id + "/outcome")
				.cookie(cookie(otherCookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"succeeded\"}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	void declinedAndPendingAre200Outcomes() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		String declinedKey = "key-" + UUID.randomUUID();
		MvcResult declined = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", declinedKey)
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		String declinedId = idOf(declined);
		mockMvc.perform(post("/payment-intents/" + declinedId + "/outcome")
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"declined\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("declined"))
				.andExpect(validAgainstContract());

		String pendingKey = "key-" + UUID.randomUUID();
		MvcResult pending = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", pendingKey)
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		String pendingId = idOf(pending);
		mockMvc.perform(post("/payment-intents/" + pendingId + "/outcome")
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"pending\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("pending"))
				.andExpect(validAgainstContract());
	}

	@Test
	void unknownOutcomeIs400() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);

		MvcResult created = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		String id = idOf(created);

		mockMvc.perform(post("/payment-intents/" + id + "/outcome")
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"maybe\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void lazyExpiryIsCommittedEvenWhenTheOutcomeIsRefused() throws Exception {
		String cookie = newSession();
		String etag = completeCardDraft(cookie);
		MvcResult created = mockMvc.perform(post("/payment-intents")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated())
				.andReturn();
		String id = idOf(created);
		jdbc.update("update payment_intent set expires_at = ? where id = ?",
				OffsetDateTime.now().minusSeconds(1), id);

		mockMvc.perform(post("/payment-intents/" + id + "/outcome")
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"outcome\":\"succeeded\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("PAYMENT_ALREADY_RESOLVED"))
				.andExpect(jsonPath("$.params.status").value("declined"));

		// Read outside any Spring transaction: the lazy-expiry write must have
		// been committed although the request itself ended in a DomainException.
		assertEquals("declined",
				jdbc.queryForObject("select status from payment_intent where id = ?", String.class, id));
	}

	private String newSession() throws Exception {
		MvcResult result = mockMvc.perform(get("/cart"))
				.andExpect(status().isOk())
				.andReturn();
		String cookie = extractCookieValue(result.getResponse().getHeader("Set-Cookie"));
		assertNotNull(cookie, "the first GET /cart must issue a Set-Cookie");
		return cookie;
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

	private static String idOf(MvcResult result) throws Exception {
		return JSON.readTree(result.getResponse().getContentAsString()).get("id").asText();
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
