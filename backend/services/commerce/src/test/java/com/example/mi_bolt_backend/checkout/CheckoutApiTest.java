package com.example.mi_bolt_backend.checkout;

import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;
import org.hamcrest.Matchers;
import tools.jackson.databind.json.JsonMapper;

/**
 * Integration tests for the three checkout endpoints (options, get, patch).
 * Runs against the H2 fixture loaded by {@code CatalogLoader} (3 products,
 * 10 variants) and the session-cookie filter. Every assertion matches a
 * literal the brief states or pins the helper behaviour (the {@code ETag}
 * that mirrors the session state version, the {@code If-Match} check that
 * blocks a stale write, the {@code complete} flag the service computes).
 * The contract validator is applied to every response that is a valid
 * request; the two deliberately invalid requests (tests 7 missing header
 * and 13 unknown member) skip it because their shape fails Jackson before
 * the body is parsed.
 */
@IntegrationTest
class CheckoutApiTest {

	private static final String NAVY_128 = "samsung-galaxy-s25--navy--128";
	private static final String NOKIA = "nokia-105--black--128";

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

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CartRepository carts;

	@Test
	void optionsOnAnEmptyCartAreUnavailable() throws Exception {
		String cookie = newSession();

		mockMvc.perform(get("/checkout/options").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(header().doesNotExist("ETag"))
				.andExpect(jsonPath("$.deliveryOptions.length()").value(2))
				.andExpect(jsonPath("$.deliveryOptions[0].id").value("home_delivery"))
				.andExpect(jsonPath("$.deliveryOptions[0].fee.amount").value(1490))
				.andExpect(jsonPath("$.deliveryOptions[0].fee.currency").value("HUF"))
				.andExpect(jsonPath("$.deliveryOptions[0].requiresAddress").value(true))
				.andExpect(jsonPath("$.deliveryOptions[0].estimatedDays").value(2))
				.andExpect(jsonPath("$.deliveryOptions[0].available").value(false))
				.andExpect(jsonPath("$.deliveryOptions[0].unavailableReason").value("CART_EMPTY"))
				.andExpect(jsonPath("$.deliveryOptions[1].id").value("pickup_point"))
				.andExpect(jsonPath("$.deliveryOptions[1].fee.amount").value(990))
				.andExpect(jsonPath("$.deliveryOptions[1].available").value(false))
				.andExpect(jsonPath("$.paymentMethods[0].id").value("card"))
				.andExpect(jsonPath("$.paymentMethods[0].fee.amount").value(0))
				.andExpect(jsonPath("$.paymentMethods[1].id").value("cash_on_delivery"))
				.andExpect(jsonPath("$.paymentMethods[1].fee.amount").value(490))
				.andExpect(jsonPath("$.paymentMethods[1].available").value(false))
				.andExpect(jsonPath("$.termsVersion").value("2026-09"))
				.andExpect(validAgainstContract());
	}

	@Test
	void optionsAboveTheFreeShippingThresholdShipFree() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());

		mockMvc.perform(get("/checkout/options").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.deliveryOptions[0].fee.amount").value(0))
				.andExpect(jsonPath("$.deliveryOptions[1].fee.amount").value(0))
				.andExpect(jsonPath("$.deliveryOptions[0].available").value(true))
				.andExpect(jsonPath("$.deliveryOptions[0].unavailableReason").doesNotExist())
				.andExpect(jsonPath("$.deliveryOptions[1].available").value(true))
				.andExpect(jsonPath("$.deliveryOptions[1].unavailableReason").doesNotExist())
				.andExpect(jsonPath("$.paymentMethods[1].available").value(true))
				.andExpect(jsonPath("$.paymentMethods[1].unavailableReason").doesNotExist())
				.andExpect(validAgainstContract());
	}

	@Test
	void optionsAboveTheCodCeilingDisableCod() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 2)).andExpect(status().isOk());

		mockMvc.perform(get("/checkout/options").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.paymentMethods[1].available").value(false))
				.andExpect(jsonPath("$.paymentMethods[1].unavailableReason").value("CART_VALUE_TOO_HIGH"))
				.andExpect(jsonPath("$.paymentMethods[0].available").value(true))
				.andExpect(validAgainstContract());
	}

	@Test
	void getCheckoutCreatesAnEmptyDraft() throws Exception {
		String cookie = newSession();

		mockMvc.perform(get("/checkout").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"1\""))
				.andExpect(jsonPath("$.version").value(1))
				.andExpect(jsonPath("$.complete").value(false))
				.andExpect(jsonPath("$.summary.subtotal.amount").value(0))
				.andExpect(jsonPath("$.summary.shippingFee.amount").value(0))
				.andExpect(jsonPath("$.summary.paymentFee.amount").value(0))
				.andExpect(jsonPath("$.summary.total.amount").value(0))
				.andExpect(jsonPath("$.contact").doesNotExist())
				.andExpect(jsonPath("$.billing").doesNotExist())
				.andExpect(jsonPath("$.delivery").doesNotExist())
				.andExpect(jsonPath("$.payment").doesNotExist())
				.andExpect(validAgainstContract());
	}

	@Test
	void patchMergesSectionsAndBumpsOnce() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());

		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "}"))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"3\""))
				.andExpect(jsonPath("$.version").value(3))
				.andExpect(jsonPath("$.contact.fullName").value("Anna Kovács"))
				.andExpect(jsonPath("$.billing").doesNotExist())
				.andExpect(jsonPath("$.complete").value(false))
				.andExpect(validAgainstContract());

		mockMvc.perform(patch(cookie, "\"3\"", "{" + BILLING + "," + HOME + "," + CARD + "}"))
				.andExpect(status().isOk())
				.andExpect(header().string("ETag", "\"4\""))
				.andExpect(jsonPath("$.version").value(4))
				.andExpect(jsonPath("$.contact.phone").value("+36301234567"))
				.andExpect(jsonPath("$.billing.address.postalCode").value("1111"))
				.andExpect(jsonPath("$.delivery.optionId").value("home_delivery"))
				.andExpect(jsonPath("$.delivery.address.line2").value("2. em."))
				.andExpect(jsonPath("$.payment.method").value("card"))
				.andExpect(jsonPath("$.complete").value(true))
				.andExpect(jsonPath("$.summary.subtotal.amount").value(299990))
				.andExpect(jsonPath("$.summary.shippingFee.amount").value(0))
				.andExpect(jsonPath("$.summary.paymentFee.amount").value(0))
				.andExpect(jsonPath("$.summary.total.amount").value(299990))
				.andExpect(validAgainstContract());
	}

	@Test
	void pickupDropsTheAddressAndCodAddsItsFee() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "}"))
				.andExpect(status().isOk())
				.andExpect(validAgainstContract());
		mockMvc.perform(patch(cookie, "\"3\"", "{" + BILLING + "," + HOME + "," + CARD + "}"))
				.andExpect(status().isOk())
				.andExpect(validAgainstContract());

		mockMvc.perform(patch(cookie, "\"4\"", "{" + PICKUP + "," + COD + "}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.delivery.optionId").value("pickup_point"))
				.andExpect(jsonPath("$.delivery.address").doesNotExist())
				.andExpect(jsonPath("$.summary.paymentFee.amount").value(490))
				.andExpect(jsonPath("$.summary.total.amount").value(300480))
				.andExpect(validAgainstContract());
	}

	@Test
	void staleIfMatchIs412AndMissingIs400() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());

		// Stale If-Match (version is 2, the request sends 1).
		mockMvc.perform(patch(cookie, "\"1\"", "{" + CONTACT + "}"))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("CART_VERSION_CONFLICT"));

		// Missing If-Match header entirely.
		mockMvc.perform(patchCheckout("/checkout", cookie, "{" + CONTACT + "}"))
				// Contract validation skipped because the request body is missing the header.
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("$.params.header").value("If-Match"));
	}

	@Test
	void invalidPhoneAndPostalCodeAre422WithContractCodes() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());

		String body = "{"
				+ "\"contact\":{\"fullName\":\"Anna Kovács\",\"email\":\"anna@example.com\",\"phone\":\"12345\"},"
				+ "\"billing\":{\"name\":\"Anna Kovács\",\"address\":{\"countryCode\":\"HU\","
				+ "\"postalCode\":\"0111\",\"city\":\"Budapest\",\"line1\":\"Fő utca 1\"}}"
				+ "}";

		mockMvc.perform(patch(cookie, "\"2\"", body))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/contact/phone')].code")
						.value(Matchers.hasItem("PHONE_FORMAT")))
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/billing/address/postalCode')].code")
						.value(Matchers.hasItem("POSTAL_CODE_FORMAT")));
	}

	@Test
	void emptyPatchIs422() throws Exception {
		String cookie = newSession();

		mockMvc.perform(patch(cookie, "\"1\"", "{}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("MIN_PROPERTIES"));
	}

	@Test
	void codAboveTheCeilingIsRejected() throws Exception {
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 2)).andExpect(status().isOk());

		mockMvc.perform(patch(cookie, "\"2\"", "{" + COD + "}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/payment/method"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("PAYMENT_METHOD_UNAVAILABLE"))
				.andExpect(jsonPath("$.params.reason").value("CART_VALUE_TOO_HIGH"));

		mockMvc.perform(get("/checkout").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.payment").doesNotExist())
				.andExpect(jsonPath("$.version").value(2))
				.andExpect(validAgainstContract());
	}

	@Test
	void selectionOnAnEmptyCartIsRejected() throws Exception {
		String cookie = newSession();

		mockMvc.perform(patch(cookie, "\"1\"", "{" + PICKUP + "}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/delivery/optionId"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("DELIVERY_OPTION_UNAVAILABLE"))
				.andExpect(jsonPath("$.params.reason").value("CART_EMPTY"));
	}

	@Test
	void expiredCartIs410OnCheckout() throws Exception {
		String cookie = newSession();
		MvcResult first = mockMvc.perform(get("/cart").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andReturn();
		String firstId = JSON.readTree(first.getResponse().getContentAsString()).get("id").asText();
		Cart persisted = carts.findById(Long.parseLong(firstId))
				.orElseThrow(() -> new IllegalStateException("expected a persisted cart for the new session"));
		persisted.touch(OffsetDateTime.now(), OffsetDateTime.now().minusSeconds(1));
		carts.save(persisted);

		mockMvc.perform(get("/checkout").cookie(cookie(cookie)))
				.andExpect(status().isGone())
				.andExpect(jsonPath("$.code").value("CART_EXPIRED"));

		mockMvc.perform(get("/checkout").cookie(cookie(cookie)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.complete").value(false))
				.andExpect(validAgainstContract());
	}

	@Test
	void unknownMemberInASectionIs400() throws Exception {
		// The contract enforces additionalProperties: false on every section;
		// Jackson fails on the unknown member and ProblemAdvice answers 400.
		// No validAgainstContract() here: the matcher validates the request body
		// too, and this request is invalid on purpose.
		String cookie = newSession();
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());

		mockMvc.perform(patch(cookie, "\"2\"", "{\"payment\":{\"method\":\"card\",\"extra\":1}}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
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

	private static MockHttpServletRequestBuilder patchCheckout(String path, String cookie, String json) {
		return MockMvcRequestBuilders.patch(path)
				.cookie(cookie(cookie))
				.contentType(MediaType.APPLICATION_JSON)
				.content(json);
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