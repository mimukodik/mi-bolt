package com.example.mi_bolt_backend.api.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class OrderRequestDeserializationTest {

	private static final JsonMapper MAPPER = JsonMapper.builder().build();

	@Test
	void deserialisesCardBodyToCardOrderRequest() throws Exception {
		String body = """
				{"paymentMethod":"card","paymentIntentId":"pi_123","termsVersion":"2026-09","acceptedTerms":true}
				""";

		OrderRequest request = MAPPER.readValue(body, OrderRequest.class);

		CardOrderRequest card = assertInstanceOf(CardOrderRequest.class, request);
		assertEquals("card", card.getPaymentMethod());
		assertEquals("pi_123", card.getPaymentIntentId());
		assertEquals("2026-09", card.getTermsVersion());
		assertEquals(Boolean.TRUE, card.getAcceptedTerms());
	}

	@Test
	void deserialisesCashOnDeliveryBodyToCashOnDeliveryOrderRequest() throws Exception {
		String body = """
				{"paymentMethod":"cash_on_delivery","termsVersion":"2026-09","acceptedTerms":false}
				""";

		OrderRequest request = MAPPER.readValue(body, OrderRequest.class);

		CashOnDeliveryOrderRequest cod = assertInstanceOf(CashOnDeliveryOrderRequest.class, request);
		assertEquals("cash_on_delivery", cod.getPaymentMethod());
		assertEquals("2026-09", cod.getTermsVersion());
		assertFalse(cod.getAcceptedTerms());
	}

	@Test
	void roundTripWritesPaymentMethodExactlyOnce() throws Exception {
		CardOrderRequest source = new CardOrderRequest()
				.paymentMethod("card")
				.paymentIntentId("pi_123")
				.termsVersion("2026-09")
				.acceptedTerms(true);

		String json = MAPPER.writeValueAsString(source);

		int first = json.indexOf("\"paymentMethod\"");
		int last = json.lastIndexOf("\"paymentMethod\"");
		assertEquals(first, last, "paymentMethod must appear exactly once in: " + json);
		assertTrue(json.contains("\"paymentMethod\":\"card\""),
				"serialised JSON must contain \"paymentMethod\":\"card\": " + json);
	}
}
