package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import com.example.mi_bolt_backend.test.IntegrationTest;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;

/** Real TCP HTTP, real security, production controllers and migrations on isolated H2. */
@IntegrationTest
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = "spring.datasource.url=jdbc:h2:mem:promotion-http;MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
@Import(PromotionHttpApiTest.TimeConfiguration.class)
class PromotionHttpApiTest {
	@LocalServerPort private int port;
	@Autowired private ObjectMapper json;
	@Autowired private JdbcTemplate jdbc;
	@Autowired private MutableClock clock;
	private final HttpClient http = HttpClient.newHttpClient();
	private final Map<String, String> cookies = new LinkedHashMap<>();

	@BeforeEach
	void signIn() throws Exception {
		clock.at = Instant.now().truncatedTo(ChronoUnit.MILLIS);
		cookies.clear();
		request("GET", "/admin/auth/session", null, null, null);
		assertThat(request("POST", "/admin/auth/login", "{\"username\":\"admin\",\"password\":\"integration-admin-password\"}", null, null).statusCode()).isEqualTo(200);
		assertThat(request("POST", "/demo/session", "{\"password\":\"1MiBoltDemo1\"}", null, null).statusCode()).isEqualTo(204);
	}
	@Test
	void createAndReplaceRejectEveryInvalidSaleAtomically() throws Exception {
		String slug = "promotion-http-" + UUID.randomUUID().toString().substring(0, 8);
		String base = AdminProductInputs.body(slug, false);
		long count = jdbc.queryForObject("select count(*) from product", Long.class);
		for (String amount : new String[] {"0", "-1", "99990", "99991", "100000001"}) {
			HttpResponse<String> response = request("POST", "/admin/products", sale(base, amount), null, null);
			assertThat(response.statusCode()).as(response.body()).isEqualTo(422);
			assertThat(tree(response).get("code").asText()).isEqualTo("VALIDATION_FAILED");
			assertThat(tree(response).get("fieldErrors").get(0).get("path").asText()).isEqualTo("/variants/0/salePrice/amount");
			assertThat(jdbc.queryForObject("select count(*) from product", Long.class)).isEqualTo(count);
		}
		for (String amount : new String[] {"\"wrong\"", "\"80000\"", "1.5", "999999999999999999999999999"}) {
			assertThat(request("POST", "/admin/products", sale(base, amount), null, null).statusCode()).isEqualTo(400);
		}
		HttpResponse<String> created = request("POST", "/admin/products", sale(base, "80000"), null, null);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		long id = tree(created).get("id").asLong();
		try {
			String etag = created.headers().firstValue("ETag").orElseThrow();
			for (String amount : new String[] {"0", "-1", "99990", "99991", "100000001"}) {
				HttpResponse<String> response = request("PUT", "/admin/products/" + id, sale(base, amount), etag, null);
				assertThat(response.statusCode()).as(response.body()).isEqualTo(422);
				assertThat(tree(response).get("fieldErrors").get(0).get("path").asText()).isEqualTo("/variants/0/salePrice/amount");
				assertThat(jdbc.queryForObject("select sale_price_huf from product_variant where product_id = ?", Long.class, id)).isEqualTo(80000);
				assertThat(jdbc.queryForObject("select version from product where id = ?", Long.class, id)).isEqualTo(0L);
			}
			for (String amount : new String[] {"\"wrong\"", "\"80000\"", "1.5", "999999999999999999999999999"}) {
				assertThat(request("PUT", "/admin/products/" + id, sale(base, amount), etag, null).statusCode()).isEqualTo(400);
			}
			assertThat(request("PUT", "/admin/products/" + id, sale(base, "70000"), etag, null).statusCode()).isEqualTo(200);
			assertThat(request("PUT", "/admin/products/" + id, sale(base, "60000"), etag, null).statusCode()).isEqualTo(412);
		}
		finally { AdminProductInputs.delete(jdbc, id); }
	}
	@Test
	void sharedCampaignValidationAndConcurrencyAndClear() throws Exception {
		HttpResponse<String> initial = request("GET", "/admin/promotion", null, null, null);
		String etag = initial.headers().firstValue("ETag").orElseThrow();
		String start = OffsetDateTime.ofInstant(clock.at, ZoneOffset.UTC).toString();
		String end = OffsetDateTime.ofInstant(clock.at.plusSeconds(120), ZoneOffset.UTC).toString();
		for (String body : new String[] {"{\"text\":\"Halloween\"}", campaign(" ", start, end), campaign("Halloween", start, start), campaign("Halloween", end, start)}) {
			HttpResponse<String> rejected = request("PUT", "/admin/promotion", body, etag, null);
			assertThat(rejected.statusCode()).as(rejected.body()).isEqualTo(422);
			assertThat(tree(rejected).get("code").asText()).isEqualTo("VALIDATION_FAILED");
			assertThat(request("GET", "/admin/promotion", null, null, null).body()).isEqualTo(initial.body());
		}
		assertThat(request("PUT", "/admin/promotion", campaign("Halloween", start, end), null, null).statusCode()).isEqualTo(428);
		HttpResponse<String> saved = request("PUT", "/admin/promotion", campaign("Halloween", start, end), etag, null);
		assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
		assertThat(tree(saved).get("active").asBoolean()).isTrue();
		assertThat(request("PUT", "/admin/promotion", campaign("Other", start, end), etag, null).statusCode()).isEqualTo(412);
		assertThat(tree(request("GET", "/promotion", null, null, null)).get("text").asText()).isEqualTo("Halloween");
		assertThat(request("PUT", "/admin/promotion", "{}", saved.headers().firstValue("ETag").orElseThrow(), null).statusCode()).isEqualTo(200);
	}
	@Test
	void catalogueBoundariesFilterStockAndReferencePriceUseOnePolicy() throws Exception {
		String slug = "catalog-http-" + UUID.randomUUID().toString().substring(0, 8);
		String body = sale(AdminProductInputs.body(slug, false), "80000").replace("Testbrand", slug);
		HttpResponse<String> created = request("POST", "/admin/products", body, null, null);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		long id = tree(created).get("id").asLong();
		Instant start = clock.at.plusSeconds(10);
		Instant end = clock.at.plusSeconds(70);
		try {
			configureCampaign(start, end);
			for (long millis : new long[] {-1L, 0L, 59999L, 60000L, 60001L}) {
				clock.at = start.plusMillis(millis);
				boolean active = millis >= 0 && millis < 60000;
				HttpResponse<String> detail = request("GET", "/products/" + slug, null, null, null);
				JsonNode variant = tree(detail).get("variants").get(0);
				assertThat(variant.get("price").get("amount").asInt()).isEqualTo(active ? 80000 : 99990);
				assertThat(variant.has("originalPrice")).isEqualTo(active);
				HttpResponse<String> list = request("GET", "/products?onPromotion=true&brand=" + slug + "&color=black&storageGb=128&minPrice=70000&maxPrice=90000&sort=price_asc", null, null, null);
				assertThat(tree(list).get("total").asInt()).isEqualTo(active ? 1 : 0);
				if (active) { assertThat(tree(list).get("facets").get("priceRange").get("min").get("amount").asInt()).isEqualTo(80000); }
			}
			clock.at = start;
			HttpResponse<String> changed = request("PUT", "/admin/products/" + id, body.replace("99990", "109990"), created.headers().firstValue("ETag").orElseThrow(), null);
			assertThat(changed.statusCode()).as(changed.body()).isEqualTo(200);
			assertThat(tree(request("GET", "/products/" + slug, null, null, null)).get("variants").get(0).get("originalPrice").get("amount").asInt()).isEqualTo(109990);
			HttpResponse<String> out = request("PUT", "/admin/products/" + id, body.replace("99990", "109990").replace("\"stock\":5", "\"stock\":0"), changed.headers().firstValue("ETag").orElseThrow(), null);
			assertThat(out.statusCode()).isEqualTo(200);
			JsonNode variant = tree(request("GET", "/products/" + slug, null, null, null)).get("variants").get(0);
			assertThat(variant.has("promotion")).isFalse();
			assertThat(variant.has("originalPrice")).isFalse();
			assertThat(variant.get("price").get("amount").asInt()).isEqualTo(109990);
			assertThat(tree(request("GET", "/products?onPromotion=true&brand=" + slug, null, null, null)).get("total").asInt()).isZero();
		}
		finally { AdminProductInputs.delete(jdbc, id); jdbc.update("update promotion_campaign set text=null, starts_at=null, ends_at=null where id=1"); }
	}
	@Test
	void expiredSaleNeedsExplicitCurrentVersionAcceptanceAfterRepeatedReads() throws Exception {
		String slug = "consent-http-" + UUID.randomUUID().toString().substring(0, 8);
		HttpResponse<String> created = request("POST", "/admin/products", sale(AdminProductInputs.body(slug, false), "80000"), null, null);
		assertThat(created.statusCode()).isEqualTo(201);
		configureCampaign(clock.at.minusSeconds(10), clock.at.plusSeconds(60));
		String etag = request("GET", "/cart", null, null, null).headers().firstValue("ETag").orElseThrow();
		HttpResponse<String> cart = request("POST", "/cart/items", "{\"variantId\":\"" + slug + "--black--128\",\"quantity\":1}", etag, null);
		HttpResponse<String> checkout = request("PATCH", "/checkout", checkoutBody(), cart.headers().firstValue("ETag").orElseThrow(), null);
		assertThat(checkout.statusCode()).isEqualTo(200);
		clock.at = clock.at.plusSeconds(180);
		HttpResponse<String> changed = request("GET", "/checkout", null, null, null);
		long version = tree(changed).get("version").asLong();
		assertThat(version).isEqualTo(tree(checkout).get("version").asLong() + 1);
		assertThat(tree(changed).get("priceChanged").asBoolean()).isTrue();
		HttpResponse<String> again = request("GET", "/checkout", null, null, null);
		assertThat(tree(again).get("version").asLong()).isEqualTo(version);
		assertThat(tree(again).get("priceChanged").asBoolean()).isTrue();
		assertThat(request("POST", "/payment-intents", null, again.headers().firstValue("ETag").orElseThrow(), UUID.randomUUID().toString()).statusCode()).isEqualTo(409);
		assertThat(request("PATCH", "/checkout", "{\"acceptedPriceVersion\":" + (version - 1) + "}", again.headers().firstValue("ETag").orElseThrow(), null).statusCode()).isEqualTo(412);
		HttpResponse<String> accepted = request("PATCH", "/checkout", "{\"acceptedPriceVersion\":" + version + "}", again.headers().firstValue("ETag").orElseThrow(), null);
		assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(200);
		assertThat(tree(accepted).get("priceChanged").asBoolean()).isFalse();
		HttpResponse<String> intent = request("POST", "/payment-intents", null, accepted.headers().firstValue("ETag").orElseThrow(), UUID.randomUUID().toString());
		assertThat(intent.statusCode()).as(intent.body()).isEqualTo(201);
		assertThat(tree(intent).get("amount").get("amount").asInt()).isEqualTo(99990);
		jdbc.update("update promotion_campaign set text=null, starts_at=null, ends_at=null where id=1");
	}
	@Test
	void acceptedPaymentKeepsSaleAfterExpiryAndReplayButCannotMoveToChangedBasket() throws Exception {
		String slug = "payment-http-" + UUID.randomUUID().toString().substring(0, 8);
		HttpResponse<String> created = request("POST", "/admin/products", sale(AdminProductInputs.body(slug, false), "80000"), null, null);
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		try {
			configureCampaign(clock.at.minusSeconds(10), clock.at.plusSeconds(60));
			String etag = request("GET", "/cart", null, null, null).headers().firstValue("ETag").orElseThrow();
			HttpResponse<String> cart = request("POST", "/cart/items", "{\"variantId\":\"" + slug + "--black--128\",\"quantity\":1}", etag, null);
			assertThat(tree(cart).get("subtotal").get("amount").asInt()).isEqualTo(80000);
			HttpResponse<String> checkout = request("PATCH", "/checkout", checkoutBody(), cart.headers().firstValue("ETag").orElseThrow(), null);
			assertThat(checkout.statusCode()).as(checkout.body()).isEqualTo(200);
			String key = UUID.randomUUID().toString();
			HttpResponse<String> intent = request("POST", "/payment-intents", null, checkout.headers().firstValue("ETag").orElseThrow(), key);
			assertThat(intent.statusCode()).as(intent.body()).isEqualTo(201);
			String intentId = tree(intent).get("id").asText();
			clock.at = clock.at.plusSeconds(180);
			HttpResponse<String> refreshed = request("GET", "/checkout", null, null, null);
			assertThat(tree(refreshed).get("summary").get("total").get("amount").asInt()).isEqualTo(80000);
			assertThat(tree(refreshed).get("priceChanged").asBoolean()).isFalse();
			HttpResponse<String> lockedCart = request("GET", "/cart", null, null, null);
			assertThat(tree(lockedCart).get("items").get(0).get("unitPrice").get("amount").asInt()).isEqualTo(80000);
			assertThat(request("POST", "/payment-intents", null, refreshed.headers().firstValue("ETag").orElseThrow(), key).body()).isEqualTo(intent.body());
			assertThat(request("POST", "/payment-intents/" + intentId + "/outcome", "{\"outcome\":\"succeeded\"}", null, null).statusCode()).isEqualTo(200);
			HttpResponse<String> returned = request("GET", "/checkout", null, null, null);
			assertThat(tree(returned).get("summary").get("total").get("amount").asInt()).isEqualTo(80000);
			assertThat(tree(returned).get("priceChanged").asBoolean()).isFalse();
			String orderKey = UUID.randomUUID().toString();
			String orderBody = "{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId + "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}";
			HttpResponse<String> order = request("POST", "/orders", orderBody, refreshed.headers().firstValue("ETag").orElseThrow(), orderKey);
			assertThat(order.statusCode()).as(order.body()).isEqualTo(201);
			assertThat(tree(order).get("total").get("amount").asInt()).isEqualTo(80000);
			assertThat(tree(order).get("items").get(0).get("unitPrice").get("amount").asInt()).isEqualTo(80000);
			assertThat(request("POST", "/orders", orderBody, "\"1\"", orderKey).body()).isEqualTo(order.body());
			configureCampaign(clock.at.minusSeconds(1), clock.at.plusSeconds(60));
			HttpResponse<String> empty = request("GET", "/cart", null, null, null);
			HttpResponse<String> secondCart = request("POST", "/cart/items", "{\"variantId\":\"" + slug + "--black--128\",\"quantity\":1}", empty.headers().firstValue("ETag").orElseThrow(), null);
			HttpResponse<String> secondCheckout = request("PATCH", "/checkout", checkoutBody(), secondCart.headers().firstValue("ETag").orElseThrow(), null);
			HttpResponse<String> secondIntent = request("POST", "/payment-intents", null, secondCheckout.headers().firstValue("ETag").orElseThrow(), UUID.randomUUID().toString());
			assertThat(secondIntent.statusCode()).isEqualTo(201);
			String secondId = tree(secondIntent).get("id").asText();
			assertThat(request("POST", "/payment-intents/" + secondId + "/outcome", "{\"outcome\":\"succeeded\"}", null, null).statusCode()).isEqualTo(200);
			HttpResponse<String> changedCart = request("PATCH", "/cart/items/" + slug + "--black--128", "{\"quantity\":2}", secondCheckout.headers().firstValue("ETag").orElseThrow(), null);
			assertThat(changedCart.statusCode()).as(changedCart.body()).isEqualTo(200);
			HttpResponse<String> refused = request("POST", "/orders", orderBody.replace(intentId, secondId), changedCart.headers().firstValue("ETag").orElseThrow(), UUID.randomUUID().toString());
			assertThat(refused.statusCode()).as(refused.body()).isEqualTo(422);
			assertThat(tree(refused).get("code").asText()).isEqualTo("PAYMENT_REQUIRED");
		}
		finally { jdbc.update("update promotion_campaign set text=null, starts_at=null, ends_at=null where id=1"); }
	}

	@Test
	void invalidSnapshotsReleaseAcceptedPricesWhilePendingKeepsThem() throws Exception {
		for (String state : new String[] {"declined", "expired", "edited", "reverted", "pending", "stock"}) {
			signIn();
			String slug = "released-http-" + UUID.randomUUID().toString().substring(0, 8);
			assertThat(request("POST", "/admin/products", sale(AdminProductInputs.body(slug, false), "80000"), null, null).statusCode()).isEqualTo(201);
			try {
				configureCampaign(clock.at.minusSeconds(10), clock.at.plusSeconds(60));
				String etag = request("GET", "/cart", null, null, null).headers().firstValue("ETag").orElseThrow();
				HttpResponse<String> cart = request("POST", "/cart/items", "{\"variantId\":\"" + slug + "--black--128\",\"quantity\":1}", etag, null);
				HttpResponse<String> draft = request("PATCH", "/checkout", checkoutBody(), cart.headers().firstValue("ETag").orElseThrow(), null);
				HttpResponse<String> intent = request("POST", "/payment-intents", null, draft.headers().firstValue("ETag").orElseThrow(), UUID.randomUUID().toString());
				assertThat(intent.statusCode()).as(intent.body()).isEqualTo(201);
				String intentId = tree(intent).get("id").asText();
				if ("declined".equals(state) || "pending".equals(state) || "expired".equals(state)) {
					String outcome = "declined".equals(state) ? "declined" : "pending";
					assertThat(request("POST", "/payment-intents/" + intentId + "/outcome", "{\"outcome\":\"" + outcome + "\"}", null, null).statusCode()).isEqualTo(200);
				}
				clock.at = "expired".equals(state) ? OffsetDateTime.parse(tree(intent).get("expiresAt").asText()).toInstant() : clock.at.plusSeconds(180);
				if ("stock".equals(state)) {
					jdbc.update("update product_variant set stock=0 where id=?", slug + "--black--128");
				}
				if ("edited".equals(state)) {
					HttpResponse<String> current = request("GET", "/checkout", null, null, null);
					assertThat(request("PATCH", "/checkout", checkoutBody(), current.headers().firstValue("ETag").orElseThrow(), null).statusCode()).isEqualTo(200);
				}
				if ("reverted".equals(state)) {
					assertThat(request("POST", "/payment-intents/" + intentId + "/outcome", "{\"outcome\":\"succeeded\"}", null, null).statusCode()).isEqualTo(200);
					HttpResponse<String> changed = request("PATCH", "/checkout", checkoutBody().replace("Test Person", "Changed Person"), draft.headers().firstValue("ETag").orElseThrow(), null);
					HttpResponse<String> restored = request("PATCH", "/checkout", checkoutBody(), changed.headers().firstValue("ETag").orElseThrow(), null);
					assertThat(restored.statusCode()).as(restored.body()).isEqualTo(200);
					String body = "{\"paymentMethod\":\"card\",\"paymentIntentId\":\"" + intentId + "\",\"termsVersion\":\"2026-09\",\"acceptedTerms\":true}";
					HttpResponse<String> rejected = request("POST", "/orders", body, restored.headers().firstValue("ETag").orElseThrow(), UUID.randomUUID().toString());
					assertThat(rejected.statusCode()).as(rejected.body()).isEqualTo(422);
					assertThat(tree(rejected).get("code").asText()).isEqualTo("PAYMENT_REQUIRED");
				}
				HttpResponse<String> current = request("GET", "/checkout", null, null, null);
				assertThat(current.statusCode()).as(current.body()).isEqualTo(200);
				int expectedTotal = "stock".equals(state) ? 0 : "pending".equals(state) ? 80000 : 99990;
				assertThat(tree(current).get("summary").get("total").get("amount").asInt()).isEqualTo(expectedTotal);
				assertThat(tree(current).get("priceChanged").asBoolean()).isEqualTo(!"pending".equals(state) && !"stock".equals(state));
				if ("stock".equals(state)) {
					jdbc.update("update product_variant set stock=5 where id=?", slug + "--black--128");
					HttpResponse<String> restored = request("GET", "/cart", null, null, null);
					assertThat(tree(restored).get("items").size()).isZero();
					assertThat(tree(request("GET", "/checkout", null, null, null)).get("summary").get("total").get("amount").asInt()).isZero();
				}
			}
			finally { jdbc.update("update promotion_campaign set text=null, starts_at=null, ends_at=null where id=1"); }
		}
	}

	private void configureCampaign(Instant start, Instant end) throws Exception {
		String etag = request("GET", "/admin/promotion", null, null, null).headers().firstValue("ETag").orElseThrow();
		assertThat(request("PUT", "/admin/promotion", campaign("Halloween", start.toString(), end.toString()), etag, null).statusCode()).isEqualTo(200);
	}
	private static String sale(String body, String amount) {
		return body.replace("\"stock\":5", "\"salePrice\":{\"amount\":" + amount + ",\"currency\":\"HUF\"},\"stock\":5");
	}
	private static String campaign(String text, String start, String end) {
		return "{\"text\":\"" + text + "\",\"startsAt\":\"" + start + "\",\"endsAt\":\"" + end + "\"}";
	}
	private static String checkoutBody() {
		return """
				{"contact":{"fullName":"Test Person","email":"test@example.com","phone":"+36301234567"},
				"billing":{"name":"Test Person","address":{"countryCode":"HU","postalCode":"1111","city":"Budapest","line1":"Test utca 1"}},
				"delivery":{"optionId":"pickup_point"},"payment":{"method":"card"}}
				""";
	}
	private JsonNode tree(HttpResponse<String> response) { return json.readTree(response.body()); }
	private HttpResponse<String> request(String method, String path, String body, String etag, String key) throws Exception {
		HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1" + path))
				.header("Content-Type", "application/json").method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
		if (!cookies.isEmpty()) { builder.header("Cookie", String.join("; ", cookies.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue()).toList())); }
		if (cookies.containsKey("XSRF-TOKEN")) { builder.header("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN")); }
		if (etag != null) { builder.header("If-Match", etag); }
		if (key != null) { builder.header("Idempotency-Key", key); }
		HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
		for (String cookie : response.headers().allValues("Set-Cookie")) {
			String pair = cookie.substring(0, cookie.indexOf(';'));
			int equals = pair.indexOf('=');
			cookies.put(pair.substring(0, equals), pair.substring(equals + 1));
		}
		return response;
	}
	@TestConfiguration
	static class TimeConfiguration {
		@Bean @Primary MutableClock promotionClock() { return new MutableClock(); }
	}
	static class MutableClock extends Clock {
		private Instant at = Instant.now();
		@Override public ZoneId getZone() { return ZoneOffset.UTC; }
		@Override public Clock withZone(ZoneId zone) { return this; }
		@Override public Instant instant() { return at; }
	}
}
