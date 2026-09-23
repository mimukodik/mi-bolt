package com.example.mi_bolt_backend.order;

import java.util.ArrayList;
import java.util.List;

import com.example.mi_bolt_backend.api.model.BillingDetails;
import com.example.mi_bolt_backend.api.model.DeliverySelection;
import com.example.mi_bolt_backend.api.model.HomeDeliverySelection;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.OrderLine;
import com.example.mi_bolt_backend.api.model.OrderReceipt;
import com.example.mi_bolt_backend.api.model.PaymentIntent;
import com.example.mi_bolt_backend.api.model.PaymentIntentStatus;
import com.example.mi_bolt_backend.api.model.PaymentMethodId;
import com.example.mi_bolt_backend.api.model.PickupPointSelection;
import com.example.mi_bolt_backend.api.model.StorageGb;
import com.example.mi_bolt_backend.checkout.CheckoutData;
import com.example.mi_bolt_backend.checkout.CheckoutModels;

/** Constructs the generated payment-intent and order DTOs from {@link OrderData}. */
public final class OrderModels {

	private static final String HOME_DELIVERY = "home_delivery";
	private static final String PICKUP_POINT = "pickup_point";

	private OrderModels() {
	}

	public static PaymentIntent toPaymentIntent(OrderData.IntentView v) {
		return new PaymentIntent(v.id(), PaymentIntentStatus.fromValue(v.status()), money(v.amount()),
				v.redirectUrl(), v.returnUrl(), v.createdAt(), v.expiresAt());
	}

	public static OrderReceipt toOrderReceipt(OrderData.Receipt r) {
		List<OrderLine> items = new ArrayList<>(r.items().size());
		for (OrderData.Line line : r.items()) {
			items.add(new OrderLine(line.productName(), line.variantId(), line.colorName(),
					StorageGb.fromValue(line.storageGb()), line.quantity(),
					money(line.unitPrice()), money(line.lineTotal())));
		}
		return new OrderReceipt(r.id(), r.orderNumber(), r.createdAt(),
				OrderReceipt.StatusEnum.fromValue(r.status()), items,
				money(r.subtotal()), money(r.shippingFee()), money(r.paymentFee()), money(r.total()),
				PaymentMethodId.fromValue(r.paymentMethod()), toDelivery(r.delivery()),
				new BillingDetails(r.billing().name(), CheckoutModels.toAddress(r.billing().address())),
				r.contactEmail(), r.notice());
	}

	private static DeliverySelection toDelivery(CheckoutData.Delivery delivery) {
		if (PICKUP_POINT.equals(delivery.optionId())) {
			return new PickupPointSelection(PICKUP_POINT);
		}
		return new HomeDeliverySelection(HOME_DELIVERY, CheckoutModels.toAddress(delivery.address()));
	}

	public static Money money(long amount) {
		return new Money(Math.toIntExact(amount), Money.CurrencyEnum.HUF);
	}
}
