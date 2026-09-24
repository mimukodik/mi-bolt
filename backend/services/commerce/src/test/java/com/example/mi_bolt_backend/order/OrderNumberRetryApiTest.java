package com.example.mi_bolt_backend.order;

import static com.example.mi_bolt_backend.test.ContractValidation.JSON;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Random;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import com.example.mi_bolt_backend.session.SessionCookieFilter;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.servlet.http.Cookie;

/**
 * MIM-403: a request whose drawn order number collides with an already-persisted
 * one is retried on the whole {@code createOrder} transaction rather than
 * answering 503, per {@link OrdersController} and {@link OrderNumberConflict}.
 *
 * <p>{@code random} and {@code orders} are swapped on the live {@code OrderService}
 * bean via {@link ReflectionTestUtils} (the same pattern {@code OrderServiceTest}
 * uses on the mocked service): {@code random} so the first draw exactly matches an
 * order number already in the database, {@code orders} as a hand-written delegating
 * {@link Proxy} over the real repository so
 * {@link ShopOrderRepository#existsByOrderNumber} can answer {@code false} for that
 * one candidate, so the collision is only caught by the real unique constraint
 * {@code uq_shop_order_number}, not by {@code uniqueOrderNumber()}'s own in-memory
 * check.
 *
 * <p>Two mechanisms this Javadoc rules out, both measured against this module's
 * actual test setup: a {@code @MockitoSpyBean} rebuilds a second
 * {@code ApplicationContext}, whose own Liquibase run collides with the first
 * context's on the fixed named H2 database ({@code jdbc:h2:mem:mibolt},
 * {@code application-test.properties}), since both point at the same
 * already-migrated schema (measured: {@code liquibase.exception.DatabaseException:
 * Table "databasechangelog" already exists}). Plain {@code Mockito.spy(orders)} on
 * the autowired repository trips Spring-test's own {@code SpringMockResolver}
 * Mockito plugin, present on the classpath once {@code spring-test} is: the spy
 * inherits {@code Advised} from the repository's transactional proxy, and
 * resolving whether it "is a mock" invokes {@code getTargetSource()} on it mid-stub,
 * which Mockito reports back as an unfinished stubbing on another mock (measured:
 * {@code UnfinishedStubbingException} from inside {@code doReturn(...).when(...)}).
 */
@IntegrationTest
class OrderNumberRetryApiTest {

	private static final String NAVY_128 = "samsung-galaxy-s25--navy--128";

	private static final String CONTACT =
			"\"contact\":{\"fullName\":\"Anna Kovács\",\"email\":\"anna@example.com\",\"phone\":\"+36301234567\"}";
	private static final String BILLING =
			"\"billing\":{\"name\":\"Anna Kovács\",\"address\":{\"countryCode\":\"HU\",\"postalCode\":\"1111\","
					+ "\"city\":\"Budapest\",\"line1\":\"Fő utca 1\"}}";
	private static final String PICKUP = "\"delivery\":{\"optionId\":\"pickup_point\"}";
	private static final String COD = "\"payment\":{\"method\":\"cash_on_delivery\"}";
	private static final String COD_ORDER_BODY =
			"{\"paymentMethod\":\"cash_on_delivery\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private OrderService orderService;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private ShopOrderRepository orders;

	@AfterEach
	void restoreOrderServiceCollaboratorsAndStock() {
		ReflectionTestUtils.setField(orderService, "orders", orders);
		ReflectionTestUtils.setField(orderService, "random", new Random());
		jdbcTemplate.update("UPDATE product_variant SET stock = 7 WHERE id = ?", NAVY_128);
	}

	@Test
	void aCollidingOrderNumberIsRetriedOnTheWholeTransactionInsteadOfAnswering503() throws Exception {
		long ordersBefore = orders.count();

		// The already-persisted row the second request's first draw will collide with.
		String cookieA = newSession();
		String etagA = completeCodDraft(cookieA);
		MvcResult firstOrder = mockMvc.perform(order(cookieA, etagA))
				.andExpect(status().isCreated())
				.andReturn();
		String existingNumber = JSON.readTree(firstOrder.getResponse().getContentAsString())
				.get("orderNumber").asText();
		int collidingDraw = Integer.parseInt(existingNumber.substring("DEMO-".length()));
		int freshDraw = (collidingDraw + 1) % 1_000_000;
		assertThat(orders.count()).isEqualTo(ordersBefore + 1);

		// existsByOrderNumber must answer false for the colliding candidate exactly
		// once, so uniqueOrderNumber() hands it to orders.save() and the real
		// uq_shop_order_number constraint is what catches the collision. See the
		// class Javadoc for why this is a hand-written delegating proxy rather than
		// @MockitoSpyBean or Mockito.spy(orders).
		ReflectionTestUtils.setField(orderService, "orders", existsByOrderNumberLyingOnce(existingNumber));

		ReflectionTestUtils.setField(orderService, "random", new SequencedRandom(collidingDraw, freshDraw));

		String cookieB = newSession();
		String etagB = completeCodDraft(cookieB);
		mockMvc.perform(order(cookieB, etagB))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.orderNumber").value("DEMO-" + String.format("%06d", freshDraw)));

		assertThat(orders.count())
				.as("the rolled-back first attempt must leave no row behind; only the retried attempt persists")
				.isEqualTo(ordersBefore + 2);
	}

	/**
	 * A {@link ShopOrderRepository} that delegates every call to {@link #orders}
	 * except {@code existsByOrderNumber(falseForCandidate)}, which it answers
	 * {@code false} for regardless of what the database actually holds, so the
	 * real {@code uq_shop_order_number} constraint is what catches the collision.
	 */
	private ShopOrderRepository existsByOrderNumberLyingOnce(String falseForCandidate) {
		return (ShopOrderRepository) Proxy.newProxyInstance(
				ShopOrderRepository.class.getClassLoader(),
				new Class<?>[] { ShopOrderRepository.class },
				(proxyInstance, method, args) -> {
					if ("existsByOrderNumber".equals(method.getName()) && falseForCandidate.equals(args[0])) {
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

	private static MockHttpServletRequestBuilder order(String cookie, String etag) {
		return post("/orders")
				.cookie(cookie(cookie))
				.header("If-Match", "\"" + etag + "\"")
				.header("Idempotency-Key", "key-" + UUID.randomUUID())
				.contentType(MediaType.APPLICATION_JSON)
				.content(COD_ORDER_BODY);
	}

	/** Returns a fixed sequence of draws, then falls back to real randomness. */
	private static final class SequencedRandom extends Random {

		private final Deque<Integer> draws;

		SequencedRandom(Integer... draws) {
			this.draws = new ArrayDeque<>(List.of(draws));
		}

		@Override
		public int nextInt(int bound) {
			Integer next = draws.poll();
			return next != null ? next : super.nextInt(bound);
		}
	}

	private String newSession() throws Exception {
		MvcResult result = mockMvc.perform(get("/cart")).andExpect(status().isOk()).andReturn();
		String cookie = extractCookieValue(result.getResponse().getHeader("Set-Cookie"));
		assertThat(cookie).as("the first GET /cart must issue a Set-Cookie").isNotNull();
		return cookie;
	}

	private String completeCodDraft(String cookie) throws Exception {
		mockMvc.perform(add(cookie, "\"1\"", NAVY_128, 1)).andExpect(status().isOk());
		mockMvc.perform(patch(cookie, "\"2\"", "{" + CONTACT + "," + BILLING + "," + PICKUP + "," + COD + "}"))
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
