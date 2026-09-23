package com.example.mi_bolt_backend.api.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.exc.InvalidTypeIdException;
import tools.jackson.databind.json.JsonMapper;

class DeliverySelectionDeserializationTest {

	private static final JsonMapper MAPPER = JsonMapper.builder().build();

	@Test
	void deserialisesHomeDeliveryBodyToHomeDeliverySelection() throws Exception {
		String body = """
				{"optionId":"home_delivery","address":{"countryCode":"HU","postalCode":"1111","city":"Budapest","line1":"Fo utca 1"}}
				""";

		DeliverySelection selection = MAPPER.readValue(body, DeliverySelection.class);

		HomeDeliverySelection home = assertInstanceOf(HomeDeliverySelection.class, selection);
		assertEquals("home_delivery", home.getOptionId());
		assertNotNull(home.getAddress());
		assertEquals(Address.CountryCodeEnum.HU, home.getAddress().getCountryCode());
		assertEquals("1111", home.getAddress().getPostalCode());
		assertEquals("Budapest", home.getAddress().getCity());
		assertEquals("Fo utca 1", home.getAddress().getLine1());
	}

	@Test
	void deserialisesPickupPointBodyToPickupPointSelection() throws Exception {
		String body = """
				{"optionId":"pickup_point"}
				""";

		DeliverySelection selection = MAPPER.readValue(body, DeliverySelection.class);

		PickupPointSelection pickup = assertInstanceOf(PickupPointSelection.class, selection);
		assertEquals("pickup_point", pickup.getOptionId());
	}

	@Test
	void rejectsUnknownOptionId() {
		String body = """
				{"optionId":"drone_delivery"}
				""";

		InvalidTypeIdException exception = assertThrows(
				InvalidTypeIdException.class,
				() -> MAPPER.readValue(body, DeliverySelection.class));
		assertTrue(exception.getMessage().contains("drone_delivery"),
				"expected the exception message to mention the unknown value, got: " + exception.getMessage());
	}

	@Test
	void roundTripWritesOptionIdExactlyOnce() throws Exception {
		Address address = new Address()
				.countryCode(Address.CountryCodeEnum.HU)
				.postalCode("1111")
				.city("Budapest")
				.line1("Fo utca 1");
		HomeDeliverySelection source = new HomeDeliverySelection("home_delivery", address);

		String json = MAPPER.writeValueAsString(source);

		int first = json.indexOf("\"optionId\"");
		int last = json.lastIndexOf("\"optionId\"");
		assertEquals(first, last, "optionId must appear exactly once in: " + json);
		assertTrue(json.contains("\"optionId\":\"home_delivery\""),
				"serialised JSON must contain \"optionId\":\"home_delivery\": " + json);
	}
}
