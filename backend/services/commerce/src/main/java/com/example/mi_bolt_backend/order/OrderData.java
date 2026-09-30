package com.example.mi_bolt_backend.order;

import java.time.OffsetDateTime;
import java.util.List;

import com.example.mi_bolt_backend.checkout.CheckoutData;

public interface OrderData {

	record IntentView(String id, String status, long amount, String redirectUrl, String returnUrl,
			OffsetDateTime createdAt, OffsetDateTime expiresAt, Long basketRevision) {
		public IntentView(String id, String status, long amount, String redirectUrl, String returnUrl,
				OffsetDateTime createdAt, OffsetDateTime expiresAt) {
			this(id, status, amount, redirectUrl, returnUrl, createdAt, expiresAt, null);
		}
	}

	/** A stored response to replay: status, optional Location, JSON body. */
	record StoredResponse(int status, String location, String body) {
	}

	record Line(String productName, String variantId, String colorName, int storageGb, int quantity,
			long unitPrice, long lineTotal) {
	}

	record Receipt(String id, String orderNumber, OffsetDateTime createdAt, String status, List<Line> items,
			long subtotal, long shippingFee, long paymentFee, long total, String paymentMethod,
			CheckoutData.Delivery delivery, CheckoutData.Billing billing, String contactEmail, String notice) {
	}
}
