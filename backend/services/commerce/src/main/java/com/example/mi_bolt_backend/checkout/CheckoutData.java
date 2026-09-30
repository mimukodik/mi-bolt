package com.example.mi_bolt_backend.checkout;

import java.util.List;

/** Plain-data shapes returned by {@link CheckoutService} (docs/02-backend.md §4.3). */
public interface CheckoutData {

	record Options(List<DeliveryOption> deliveryOptions, List<PaymentOption> paymentMethods, String termsVersion) {
	}

	/** unavailableReason is null when available is true. */
	record DeliveryOption(String id, String label, String description, long fee, boolean requiresAddress,
			Integer estimatedDays, boolean available, String unavailableReason) {
	}

	record PaymentOption(String id, String label, String description, long fee, boolean available,
			String unavailableReason) {
	}

	record Contact(String fullName, String email, String phone) {
	}

	record Address(String countryCode, String postalCode, String city, String line1, String line2) {
	}

	record Billing(String name, Address address) {
	}

	/** address is null for pickup_point. */
	record Delivery(String optionId, Address address) {
	}

	record Payment(String method) {
	}

	record Summary(long subtotal, long shippingFee, long paymentFee, long total) {
	}

	/** Every section is null until set. */
	record Session(long version, Contact contact, Billing billing, Delivery delivery, Payment payment,
			Summary summary, boolean complete, long basketRevision, boolean priceChanged) {
		public Session(long version, Contact contact, Billing billing, Delivery delivery, Payment payment,
				Summary summary, boolean complete) {
			this(version, contact, billing, delivery, payment, summary, complete, 0L, false);
		}
	}

	/** What the controller passes in for a PATCH; a null section is "not sent". */
	record Update(Contact contact, Billing billing, Delivery delivery, Payment payment, Long acceptedPriceVersion) {
		public Update(Contact contact, Billing billing, Delivery delivery, Payment payment) {
			this(contact, billing, delivery, payment, null);
		}
	}
}
