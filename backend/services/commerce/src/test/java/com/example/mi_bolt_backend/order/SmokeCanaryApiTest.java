package com.example.mi_bolt_backend.order;

import static com.example.mi_bolt_backend.test.ContractValidation.JSON;
import static com.example.mi_bolt_backend.test.ContractValidation.validAgainstContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;
import org.mockito.AdditionalAnswers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.example.mi_bolt_backend.catalog.ProductRepository;
import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.catalog.SmokeCanaryBootstrap;
import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

@IntegrationTest
@TestPropertySource(properties = {
		"mibolt.smoke.enabled=true",
		"spring.datasource.url=jdbc:h2:mem:smoke-canary;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class SmokeCanaryApiTest {

	private static final String CANARY = SmokeCanaryBootstrap.VARIANT_ID;
	private static final String NORMAL = "samsung-galaxy-s25--navy--128";
	private static final String COD_ORDER = "{\"paymentMethod\":\"cash_on_delivery\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}";
	private static final String DRAFT = """
			{"contact":{"fullName":"Smoke Canary","email":"smoke@example.com","phone":"+36301234567"},
			"billing":{"name":"Smoke Canary","address":{"countryCode":"HU","postalCode":"1111","city":"Budapest","line1":"Demo utca 1"}},
			"delivery":{"optionId":"pickup_point"},"payment":{"method":"cash_on_delivery"}}
			""";

	@Autowired
	private MockMvc mockMvc;
	@Autowired
	private ProductVariantRepository variants;
	@Autowired
	private ProductRepository products;
	@Autowired
	private SmokeCanaryBootstrap bootstrap;
	@Autowired
	private OrderService orderService;
	@Autowired
	private ShopOrderRepository orders;
	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void fixtureBootstrapOnPopulatedDatabaseIsIdempotentAndPreservesNormalStock() {
		long before = products.count();
		int normalStock = stock(NORMAL);
		bootstrap.run(null);
		bootstrap.run(null);
		assertThat(before).isEqualTo(4);
		assertThat(products.count()).isEqualTo(before);
		assertThat(stock(NORMAL)).isEqualTo(normalStock);
	}

	@Test
	void canaryIsHiddenFromListSearchFacetsFeaturedAndRelatedButDetailWorks() throws Exception {
		mockMvc.perform(get("/products")).andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(6))
				.andExpect(jsonPath("$.facets.brands[?(@.value=='MiBolt')]").isEmpty())
				.andExpect(validAgainstContract());
		mockMvc.perform(get("/products").param("q", "Smoke canary"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0))
				.andExpect(validAgainstContract());
		MvcResult featured = mockMvc.perform(get("/products").param("featured", "true"))
				.andExpect(status().isOk()).andExpect(validAgainstContract()).andReturn();
		assertThat(featured.getResponse().getContentAsString()).doesNotContain(SmokeCanaryBootstrap.PRODUCT_SLUG);
		MvcResult related = mockMvc.perform(get("/products/samsung-galaxy-s25/related"))
				.andExpect(status().isOk()).andExpect(validAgainstContract()).andReturn();
		assertThat(related.getResponse().getContentAsString()).doesNotContain(SmokeCanaryBootstrap.PRODUCT_SLUG);
		mockMvc.perform(get("/products/" + SmokeCanaryBootstrap.PRODUCT_SLUG + "/related"))
				.andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty()).andExpect(validAgainstContract());
		mockMvc.perform(get("/products/" + SmokeCanaryBootstrap.PRODUCT_SLUG))
				.andExpect(status().isOk()).andExpect(jsonPath("$.variants[0].id").value(CANARY))
				.andExpect(jsonPath("$.variants[0].maxQuantity").value(5))
				.andExpect(validAgainstContract());
	}

	@Test
	void repeatedPurchasesAndReplaysNeverConsumeStock() throws Exception {
		long ordersBefore = orders.count();
		for (int attempt = 0; attempt < 8; attempt++) {
			Cookie session = draft(CANARY, 5);
			String key = UUID.randomUUID().toString();
			MvcResult first = mockMvc.perform(order(session, key)).andExpect(status().isCreated())
					.andExpect(validAgainstContract()).andReturn();
			MvcResult replay = mockMvc.perform(order(session, key)).andExpect(status().isCreated()).andReturn();
			assertThat(replay.getResponse().getContentAsString()).isEqualTo(first.getResponse().getContentAsString());
			assertThat(stock(CANARY)).isEqualTo(5);
			mockMvc.perform(get("/cart").cookie(session)).andExpect(jsonPath("$.items").isEmpty());
		}
		assertThat(orders.count()).isEqualTo(ordersBefore + 8);
	}

	@Test
	void abandonedAndRefusedFlowsDoNotChangeCanaryStock() throws Exception {
		Cookie session = draft(CANARY, 5);
		mockMvc.perform(order(session, UUID.randomUUID().toString())
				.content(COD_ORDER.replace("true", "false")))
				.andExpect(status().isUnprocessableEntity());
		assertThat(stock(CANARY)).isEqualTo(5);
		mockMvc.perform(get("/cart").cookie(session)).andExpect(jsonPath("$.items[0].quantity").value(5));
	}

	@Test
	void canaryCardFlowSupportsDeclinedAbandonedAndSucceededPayment() throws Exception {
		Cookie session = draft(CANARY, 1);
		mockMvc.perform(patch("/checkout").cookie(session).header("If-Match", "\"3\"")
				.contentType(MediaType.APPLICATION_JSON).content("{\"payment\":{\"method\":\"card\"}}"))
				.andExpect(status().isOk());
		String declined = intent(session);
		mockMvc.perform(post("/payment-intents/" + declined + "/outcome").cookie(session)
				.contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"declined\"}"))
				.andExpect(status().isOk());
		mockMvc.perform(cardOrder(session, declined)).andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PAYMENT_DECLINED"));
		assertThat(stock(CANARY)).isEqualTo(5);
		String succeeded = intent(session);
		mockMvc.perform(cardOrder(session, succeeded)).andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value("PAYMENT_REQUIRED"));
		assertThat(stock(CANARY)).isEqualTo(5);
		mockMvc.perform(post("/payment-intents/" + succeeded + "/outcome").cookie(session)
				.contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"succeeded\"}"))
				.andExpect(status().isOk());
		mockMvc.perform(cardOrder(session, succeeded)).andExpect(status().isCreated()).andExpect(validAgainstContract());
		assertThat(stock(CANARY)).isEqualTo(5);
	}

	@Test
	void concurrentSuccessfulOrdersKeepStockBalanced() throws Exception {
		Cookie first = draft(CANARY, 5);
		Cookie second = draft(CANARY, 5);
		try (var executor = Executors.newFixedThreadPool(2)) {
			List<Callable<Integer>> calls = List.of(
					() -> mockMvc.perform(order(first, UUID.randomUUID().toString())).andReturn().getResponse().getStatus(),
					() -> mockMvc.perform(order(second, UUID.randomUUID().toString())).andReturn().getResponse().getStatus());
			for (var result : executor.invokeAll(calls)) {
				assertThat(result.get()).isEqualTo(201);
			}
		}
		assertThat(stock(CANARY)).isEqualTo(5);
	}

	@Test
	void enabledSmokeFlagStillConsumesNormalStock() throws Exception {
		int before = stock(NORMAL);
		try {
			mockMvc.perform(order(draft(NORMAL, 1), UUID.randomUUID().toString()))
					.andExpect(status().isCreated()).andExpect(validAgainstContract());
			assertThat(stock(NORMAL)).isEqualTo(before - 1);
		}
		finally {
			jdbc.update("update product_variant set stock = ? where id = ?", before, NORMAL);
		}
	}

	@Test
	void disabledFlagDoesNotCompensateExistingFixture() throws Exception {
		ReflectionTestUtils.setField(orderService, "smokeEnabled", false);
		try {
			mockMvc.perform(order(draft(CANARY, 1), UUID.randomUUID().toString())).andExpect(status().isCreated());
			assertThat(stock(CANARY)).isEqualTo(4);
		}
		finally {
			ReflectionTestUtils.setField(orderService, "smokeEnabled", true);
			jdbc.update("update product_variant set stock = 5 where id = ?", CANARY);
		}
	}

	@Test
	void failureAfterCompensationRollsBackStockOrderAndCart() throws Exception {
		Cookie session = draft(CANARY, 5);
		long before = orders.count();
		ShopOrderRepository failing = Mockito.mock(ShopOrderRepository.class, AdditionalAnswers.delegatesTo(orders));
		doThrow(new IllegalStateException("injected order persistence failure")).when(failing).save(any());
		ReflectionTestUtils.setField(orderService, "orders", failing);
		try {
			mockMvc.perform(order(session, UUID.randomUUID().toString())).andExpect(status().isServiceUnavailable());
			assertThat(stock(CANARY)).isEqualTo(5);
			assertThat(orders.count()).isEqualTo(before);
			mockMvc.perform(get("/cart").cookie(session)).andExpect(jsonPath("$.items[0].quantity").value(5));
		}
		finally {
			ReflectionTestUtils.setField(orderService, "orders", orders);
		}
	}

	private Cookie draft(String variantId, int quantity) throws Exception {
		MvcResult cart = mockMvc.perform(get("/cart")).andExpect(status().isOk()).andReturn();
		String header = cart.getResponse().getHeader("Set-Cookie");
		assertThat(header).isNotNull();
		Cookie session = new Cookie(SessionCookieFilter.COOKIE_NAME, header.substring(header.indexOf('=') + 1, header.indexOf(';')));
		mockMvc.perform(post("/cart/items").cookie(session).header("If-Match", "\"1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"variantId\":\"" + variantId + "\",\"quantity\":" + quantity + "}"))
				.andExpect(status().isOk());
		mockMvc.perform(patch("/checkout").cookie(session).header("If-Match", "\"2\"")
				.contentType(MediaType.APPLICATION_JSON).content(DRAFT)).andExpect(status().isOk());
		return session;
	}

	private MockHttpServletRequestBuilder order(Cookie session, String key) {
		return post("/orders").cookie(session).header("If-Match", "\"3\"")
				.header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(COD_ORDER);
	}

	private int stock(String variantId) {
		return variants.findById(variantId).orElseThrow().getStock();
	}

	private String intent(Cookie session) throws Exception {
		MvcResult result = mockMvc.perform(post("/payment-intents").cookie(session).header("If-Match", "\"4\"")
				.header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON))
				.andExpect(status().isCreated()).andReturn();
		return JSON.readTree(result.getResponse().getContentAsString()).get("id").asText();
	}

	private MockHttpServletRequestBuilder cardOrder(Cookie session, String intentId) {
		return post("/orders").cookie(session).header("If-Match", "\"4\"")
				.header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId
						+ "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}");
	}
}
