package com.example.mi_bolt_backend.checkout;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartData;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.cart.CartService;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.session.SessionService;

/**
 * Read and write side of the checkout draft (docs/02-backend.md §4.3).
 *
 * <p>The cart is always resolved through {@link CartService} first, so an expired
 * cart surfaces as {@link ErrorCode#CART_EXPIRED} on every checkout method, exactly
 * as it does on {@code /cart}.
 */
@Service
@Transactional(noRollbackFor = DomainException.class)
public class CheckoutService {

	private static final String HOME_DELIVERY = "home_delivery";
	private static final String PICKUP_POINT = "pickup_point";
	private static final String CARD = "card";
	private static final String CASH_ON_DELIVERY = "cash_on_delivery";
	private static final String CART_VALUE_TOO_HIGH = "CART_VALUE_TOO_HIGH";
	private static final String CART_EMPTY = "CART_EMPTY";
	private static final String OPTION_UNKNOWN = "OPTION_UNKNOWN";

	private final CartService cartService;
	private final CartRepository carts;
	private final CheckoutDraftRepository drafts;
	private final ShopSessionRepository sessions;
	private final SessionService sessionService;
	private final Clock clock;
	private final long homeDeliveryFee;
	private final long pickupFee;
	private final long freeShippingThreshold;
	private final long cardFee;
	private final long codFee;
	private final long codMaxCart;
	private final String termsVersion;

	public CheckoutService(CartService cartService,
			CartRepository carts,
			CheckoutDraftRepository drafts,
			ShopSessionRepository sessions,
			SessionService sessionService,
			Clock clock,
			@Value("${mibolt.checkout.home-delivery-fee-huf}") long homeDeliveryFee,
			@Value("${mibolt.checkout.pickup-fee-huf}") long pickupFee,
			@Value("${mibolt.checkout.free-shipping-threshold-huf}") long freeShippingThreshold,
			@Value("${mibolt.checkout.card-fee-huf}") long cardFee,
			@Value("${mibolt.checkout.cash-on-delivery-fee-huf}") long codFee,
			@Value("${mibolt.checkout.cash-on-delivery-max-cart-huf}") long codMaxCart,
			@Value("${mibolt.checkout.terms-version}") String termsVersion) {
		this.cartService = cartService;
		this.carts = carts;
		this.drafts = drafts;
		this.sessions = sessions;
		this.sessionService = sessionService;
		this.clock = clock;
		this.homeDeliveryFee = homeDeliveryFee;
		this.pickupFee = pickupFee;
		this.freeShippingThreshold = freeShippingThreshold;
		this.cardFee = cardFee;
		this.codFee = codFee;
		this.codMaxCart = codMaxCart;
		this.termsVersion = termsVersion;
	}

	public CheckoutData.Options getOptions(ShopSession current) {
		CartData.CartView cart = cartService.getCart(current);
		return buildOptions(cart);
	}

	public CheckoutData.Session getCheckout(ShopSession current) {
		CartData.CartView cart = cartService.getCart(current);
		ShopSession session = loadSession(current);
		Cart cartEntity = loadCartEntity(session);
		CheckoutDraft draft = loadOrCreateDraft(cartEntity);
		CheckoutData.Options options = buildOptions(cart);
		return buildView(session, cart, draft, options);
	}

	public void expectVersion(ShopSession current, String ifMatch) {
		cartService.expectVersion(current, ifMatch);
	}

	public CheckoutData.Session update(ShopSession current, CheckoutData.Update update) {
		long versionBefore = current.getStateVersion();
		CartData.CartView cart = cartService.getCart(current);
		ShopSession session = loadSession(current);
		Cart cartEntity = loadCartEntity(session);
		CheckoutData.Options options = buildOptions(cart);
		validateUpdate(options, update);
		CheckoutDraft draft = loadOrCreateDraft(cartEntity);
		OffsetDateTime at = now();
		applyUpdate(draft, update, at);
		if (cart.version() == versionBefore) {
			session.bumpStateVersion();
		}
		Duration lifetime = sessionService.lifetime();
		session.extend(at, at.plus(lifetime));
		cartEntity.touch(at, at.plus(lifetime));
		return buildView(session, cart, draft, options);
	}

	private void validateUpdate(CheckoutData.Options options, CheckoutData.Update update) {
		if (update.contact() == null && update.billing() == null && update.delivery() == null
				&& update.payment() == null) {
			throw new DomainException(ErrorCode.VALIDATION_FAILED, "No section supplied", null,
					List.of(new FieldError("/", "MIN_PROPERTIES")), null);
		}
		if (update.delivery() != null) {
			String optionId = update.delivery().optionId();
			CheckoutData.DeliveryOption matching = findDeliveryOption(options, optionId);
			if (matching == null) {
				throw new DomainException(ErrorCode.VALIDATION_FAILED,
						"delivery option unknown",
						Map.of("reason", OPTION_UNKNOWN),
						List.of(new FieldError("/delivery/optionId", "DELIVERY_OPTION_UNAVAILABLE")), null);
			}
			if (!matching.available()) {
				throw new DomainException(ErrorCode.VALIDATION_FAILED,
						"delivery option unavailable",
						Map.of("reason", matching.unavailableReason()),
						List.of(new FieldError("/delivery/optionId", "DELIVERY_OPTION_UNAVAILABLE")), null);
			}
			if (HOME_DELIVERY.equals(optionId) && update.delivery().address() == null) {
				throw new DomainException(ErrorCode.VALIDATION_FAILED,
						"address is required for home delivery",
						null,
						List.of(new FieldError("/delivery/address", "REQUIRED")), null);
			}
		}
		if (update.payment() != null) {
			String method = update.payment().method();
			CheckoutData.PaymentOption matching = findPaymentOption(options, method);
			if (matching == null) {
				throw new DomainException(ErrorCode.VALIDATION_FAILED,
						"payment method unknown",
						Map.of("reason", OPTION_UNKNOWN),
						List.of(new FieldError("/payment/method", "PAYMENT_METHOD_UNAVAILABLE")), null);
			}
			if (!matching.available()) {
				throw new DomainException(ErrorCode.VALIDATION_FAILED,
						"payment method unavailable",
						Map.of("reason", matching.unavailableReason()),
						List.of(new FieldError("/payment/method", "PAYMENT_METHOD_UNAVAILABLE")), null);
			}
		}
	}

	private static CheckoutData.DeliveryOption findDeliveryOption(CheckoutData.Options options, String id) {
		for (CheckoutData.DeliveryOption opt : options.deliveryOptions()) {
			if (opt.id().equals(id)) {
				return opt;
			}
		}
		return null;
	}

	private static CheckoutData.PaymentOption findPaymentOption(CheckoutData.Options options, String id) {
		for (CheckoutData.PaymentOption opt : options.paymentMethods()) {
			if (opt.id().equals(id)) {
				return opt;
			}
		}
		return null;
	}

	private void applyUpdate(CheckoutDraft draft, CheckoutData.Update update, OffsetDateTime at) {
		if (update.contact() != null) {
			CheckoutData.Contact c = update.contact();
			draft.setContact(c.fullName(), c.email(), c.phone(), at);
		}
		if (update.billing() != null) {
			CheckoutData.Billing b = update.billing();
			CheckoutData.Address a = b.address();
			draft.setBilling(b.name(),
					addressPart(a, CheckoutData.Address::countryCode),
					addressPart(a, CheckoutData.Address::postalCode),
					addressPart(a, CheckoutData.Address::city),
					addressPart(a, CheckoutData.Address::line1),
					addressPart(a, CheckoutData.Address::line2),
					at);
		}
		if (update.delivery() != null) {
			CheckoutData.Delivery d = update.delivery();
			CheckoutData.Address a = d.address();
			draft.setDelivery(d.optionId(),
					addressPart(a, CheckoutData.Address::countryCode),
					addressPart(a, CheckoutData.Address::postalCode),
					addressPart(a, CheckoutData.Address::city),
					addressPart(a, CheckoutData.Address::line1),
					addressPart(a, CheckoutData.Address::line2),
					at);
		}
		if (update.payment() != null) {
			draft.setPayment(update.payment().method(), at);
		}
	}

	private static String addressPart(CheckoutData.Address address,
			Function<CheckoutData.Address, String> getter) {
		return address == null ? null : getter.apply(address);
	}

	private CheckoutData.Options buildOptions(CartData.CartView cart) {
		long subtotal = cart.subtotal();
		boolean empty = cart.lineCount() == 0;
		boolean free = subtotal >= freeShippingThreshold;
		long homeFee = free ? 0L : homeDeliveryFee;
		long pickupFeeCalc = free ? 0L : pickupFee;
		String emptyReason = empty ? CART_EMPTY : null;

		CheckoutData.DeliveryOption home = new CheckoutData.DeliveryOption(
				HOME_DELIVERY, "Házhoz szállítás", "Futárral, 1–2 munkanapon belül.",
				homeFee, true, 2, !empty, emptyReason);
		CheckoutData.DeliveryOption pickup = new CheckoutData.DeliveryOption(
				PICKUP_POINT, "Átvételi pont", "Csomagponton, 2–3 munkanapon belül.",
				pickupFeeCalc, false, 3, !empty, emptyReason);

		boolean codAvailable = !empty && subtotal <= codMaxCart;
		String codReason;
		if (empty) {
			codReason = CART_EMPTY;
		}
		else if (subtotal > codMaxCart) {
			codReason = CART_VALUE_TOO_HIGH;
		}
		else {
			codReason = null;
		}
		CheckoutData.PaymentOption card = new CheckoutData.PaymentOption(
				CARD, "Bankkártya", "Online kártyás fizetés.",
				cardFee, !empty, emptyReason);
		CheckoutData.PaymentOption cod = new CheckoutData.PaymentOption(
				CASH_ON_DELIVERY, "Utánvét", "Készpénzzel vagy kártyával a futárnál.",
				codFee, codAvailable, codReason);

		return new CheckoutData.Options(List.of(home, pickup), List.of(card, cod), termsVersion);
	}

	private CheckoutData.Session buildView(ShopSession session, CartData.CartView cart, CheckoutDraft draft,
			CheckoutData.Options options) {
		CheckoutData.Contact contact = draft.getContactFullName() == null
				? null
				: new CheckoutData.Contact(draft.getContactFullName(), draft.getContactEmail(),
						draft.getContactPhone());
		CheckoutData.Billing billing = draft.getBillingName() == null
				? null
				: new CheckoutData.Billing(draft.getBillingName(),
						new CheckoutData.Address(draft.getBillingCountryCode(), draft.getBillingPostalCode(),
								draft.getBillingCity(), draft.getBillingLine1(), draft.getBillingLine2()));
		CheckoutData.Delivery delivery = draft.getDeliveryOption() == null
				? null
				: new CheckoutData.Delivery(draft.getDeliveryOption(),
						PICKUP_POINT.equals(draft.getDeliveryOption())
								? null
								: new CheckoutData.Address(draft.getDeliveryCountryCode(),
										draft.getDeliveryPostalCode(), draft.getDeliveryCity(),
										draft.getDeliveryLine1(), draft.getDeliveryLine2()));
		CheckoutData.Payment payment = draft.getPaymentMethod() == null
				? null
				: new CheckoutData.Payment(draft.getPaymentMethod());

		CheckoutData.DeliveryOption chosenDelivery = findDeliveryOption(options, draft.getDeliveryOption());
		CheckoutData.PaymentOption chosenPayment = findPaymentOption(options, draft.getPaymentMethod());
		CheckoutData.Summary summary = buildSummary(cart, chosenDelivery, chosenPayment);
		boolean complete = contact != null && billing != null && delivery != null && payment != null
				&& cart.lineCount() > 0
				&& chosenDelivery != null && chosenDelivery.available()
				&& chosenPayment != null && chosenPayment.available();

		return new CheckoutData.Session(session.getStateVersion(), contact, billing, delivery, payment,
				summary, complete);
	}

	private static CheckoutData.Summary buildSummary(CartData.CartView cart,
			CheckoutData.DeliveryOption delivery, CheckoutData.PaymentOption payment) {
		long shippingFee = delivery != null && delivery.available() ? delivery.fee() : 0L;
		long paymentFee = payment != null && payment.available() ? payment.fee() : 0L;
		long total = cart.subtotal() + shippingFee + paymentFee;
		return new CheckoutData.Summary(cart.subtotal(), shippingFee, paymentFee, total);
	}

	private CheckoutDraft loadOrCreateDraft(Cart cart) {
		return drafts.findByCartId(cart.getId())
				.orElseGet(() -> drafts.save(new CheckoutDraft(cart, now())));
	}

	private Cart loadCartEntity(ShopSession session) {
		return carts.findBySessionIdWithItems(session.getId())
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND, "cart not found"));
	}

	private ShopSession loadSession(ShopSession current) {
		return sessions.findById(current.getId())
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND, "session not found"));
	}

	private OffsetDateTime now() {
		return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
	}
}
