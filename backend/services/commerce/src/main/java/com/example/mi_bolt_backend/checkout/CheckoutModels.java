package com.example.mi_bolt_backend.checkout;

import com.example.mi_bolt_backend.api.model.Address;
import com.example.mi_bolt_backend.api.model.BillingDetails;
import com.example.mi_bolt_backend.api.model.CheckoutOptions;
import com.example.mi_bolt_backend.api.model.CheckoutSession;
import com.example.mi_bolt_backend.api.model.CheckoutSummary;
import com.example.mi_bolt_backend.api.model.Contact;
import com.example.mi_bolt_backend.api.model.DeliveryOption;
import com.example.mi_bolt_backend.api.model.DeliveryOptionId;
import com.example.mi_bolt_backend.api.model.DeliverySelection;
import com.example.mi_bolt_backend.api.model.HomeDeliverySelection;
import com.example.mi_bolt_backend.api.model.Money;
import com.example.mi_bolt_backend.api.model.PaymentMethodId;
import com.example.mi_bolt_backend.api.model.PaymentMethodOption;
import com.example.mi_bolt_backend.api.model.PaymentSelection;
import com.example.mi_bolt_backend.api.model.PickupPointSelection;
import com.example.mi_bolt_backend.api.model.UnavailableReason;
import com.example.mi_bolt_backend.api.model.UpdateCheckoutRequest;

import java.util.ArrayList;
import java.util.List;

/** Constructs the generated checkout DTOs from {@link CheckoutData}; the only class that does. */
public final class CheckoutModels {

	private static final String HOME_DELIVERY = "home_delivery";
	private static final String PICKUP_POINT = "pickup_point";

	private CheckoutModels() {
	}

	public static CheckoutOptions toOptions(CheckoutData.Options options) {
		List<DeliveryOption> deliveries = new ArrayList<>();
		for (CheckoutData.DeliveryOption opt : options.deliveryOptions()) {
			DeliveryOption mapped = new DeliveryOption(DeliveryOptionId.fromValue(opt.id()), opt.label(),
					opt.description(), money(opt.fee()), opt.requiresAddress(), opt.available());
			mapped.estimatedDays(opt.estimatedDays());
			if (opt.unavailableReason() != null) {
				mapped.unavailableReason(UnavailableReason.fromValue(opt.unavailableReason()));
			}
			deliveries.add(mapped);
		}
		List<PaymentMethodOption> payments = new ArrayList<>();
		for (CheckoutData.PaymentOption opt : options.paymentMethods()) {
			PaymentMethodOption mapped = new PaymentMethodOption(PaymentMethodId.fromValue(opt.id()), opt.label(),
					opt.description(), money(opt.fee()), opt.available());
			if (opt.unavailableReason() != null) {
				mapped.unavailableReason(UnavailableReason.fromValue(opt.unavailableReason()));
			}
			payments.add(mapped);
		}
		return new CheckoutOptions(deliveries, payments, options.termsVersion());
	}

	public static CheckoutSession toCheckoutSession(CheckoutData.Session view) {
		CheckoutSession session = new CheckoutSession(Math.toIntExact(view.version()),
				toSummary(view.summary()), view.complete());
		if (view.contact() != null) {
			CheckoutData.Contact c = view.contact();
			session.contact(new Contact(c.fullName(), c.email(), c.phone()));
		}
		if (view.billing() != null) {
			CheckoutData.Billing b = view.billing();
			session.billing(new BillingDetails(b.name(), toAddress(b.address())));
		}
		if (view.delivery() != null) {
			CheckoutData.Delivery d = view.delivery();
			DeliverySelection selection;
			if (HOME_DELIVERY.equals(d.optionId())) {
				selection = new HomeDeliverySelection(HOME_DELIVERY, toAddress(d.address()));
			}
			else {
				selection = new PickupPointSelection(PICKUP_POINT);
			}
			session.delivery(selection);
		}
		if (view.payment() != null) {
			session.payment(new PaymentSelection(PaymentMethodId.fromValue(view.payment().method())));
		}
		return session;
	}

	private static CheckoutSummary toSummary(CheckoutData.Summary summary) {
		return new CheckoutSummary(money(summary.subtotal()), money(summary.shippingFee()),
				money(summary.paymentFee()), money(summary.total()));
	}

	/** Made public so {@code OrderModels} can build the same {@link Address} for an order receipt. */
	public static Address toAddress(CheckoutData.Address a) {
		Address address = new Address(Address.CountryCodeEnum.fromValue(a.countryCode()), a.postalCode(), a.city(),
				a.line1());
		if (a.line2() != null) {
			address.line2(a.line2());
		}
		return address;
	}

	public static CheckoutData.Update toUpdate(UpdateCheckoutRequest request) {
		CheckoutData.Contact contact = null;
		if (request.getContact() != null) {
			Contact c = request.getContact();
			contact = new CheckoutData.Contact(c.getFullName(), c.getEmail(), c.getPhone());
		}
		CheckoutData.Billing billing = null;
		if (request.getBilling() != null) {
			BillingDetails b = request.getBilling();
			billing = new CheckoutData.Billing(b.getName(), fromAddress(b.getAddress()));
		}
		CheckoutData.Delivery delivery = null;
		DeliverySelection ds = request.getDelivery();
		if (ds != null) {
			if (ds instanceof HomeDeliverySelection h) {
				delivery = new CheckoutData.Delivery(HOME_DELIVERY, fromAddress(h.getAddress()));
			}
			else {
				delivery = new CheckoutData.Delivery(ds.getOptionId(), null);
			}
		}
		CheckoutData.Payment payment = null;
		if (request.getPayment() != null) {
			payment = new CheckoutData.Payment(request.getPayment().getMethod().getValue());
		}
		return new CheckoutData.Update(contact, billing, delivery, payment);
	}

	private static CheckoutData.Address fromAddress(Address a) {
		return new CheckoutData.Address(a.getCountryCode().getValue(), a.getPostalCode(), a.getCity(),
				a.getLine1(), a.getLine2());
	}

	private static Money money(long amount) {
		return new Money(Math.toIntExact(amount), Money.CurrencyEnum.HUF);
	}
}