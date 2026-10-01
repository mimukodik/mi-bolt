package com.example.mi_bolt_backend.order;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartData;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.cart.CartService;
import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.catalog.SmokeCanaryBootstrap;
import com.example.mi_bolt_backend.checkout.CheckoutData;
import com.example.mi_bolt_backend.checkout.CheckoutDraftRepository;
import com.example.mi_bolt_backend.checkout.CheckoutService;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.session.SessionService;

/**
 * Places an order in one transaction from the checkout draft (docs/02-backend.md §4.5 rules 35–47).
 *
 * <p>The whole {@code place} call is one transaction: a {@link DomainException} thrown
 * anywhere inside rolls back every write of that request (rule 42).
 */
@Service
@Transactional
public class OrderService {

	static final String STATUS_CONFIRMED = "confirmed";
	static final String CARD = "card";
	static final String CASH_ON_DELIVERY = "cash_on_delivery";
	static final String ORDER_NUMBER_PREFIX = "DEMO-";
	// Demo notice carried on every receipt. Java constants bypass the .properties
	// ISO-8859-1 reader (Spring Boot reads application.properties as ISO-8859-1 by
	// default and turns Hungarian UTF-8 bytes into Latin-1 mojibake). The text is
	// legally mandated for the demo, not per-environment configuration, so a
	// constant fits.
	static final String NOTICE =
			"Ez egy demó rendelés: nem történt valódi fizetés, kiszállítás vagy e-mail-küldés.";

	private static final String INTENT_REQUIRES_ACTION = "requires_action";
	private static final String INTENT_SUCCEEDED = "succeeded";
	private static final String INTENT_DECLINED = "declined";
	private static final String INTENT_PENDING = "pending";
	private static final String PICKUP_POINT = "pickup_point";

	private final ShopOrderRepository orders;
	private final CartService cartService;
	private final CartRepository carts;
	private final CheckoutService checkoutService;
	private final CheckoutDraftRepository drafts;
	private final PaymentIntentService intentService;
	private final ProductVariantRepository variants;
	private final ShopSessionRepository sessions;
	private final SessionService sessionService;
	private final Clock clock;
	private final String termsVersion;
	private final boolean smokeEnabled;
	// Order numbers are demo identifiers, not security tokens; java.util.Random is
	// thread-safe, unlike a ThreadLocalRandom instance held across threads.
	private final Random random = new Random();

	public OrderService(ShopOrderRepository orders,
			CartService cartService,
			CartRepository carts,
			CheckoutService checkoutService,
			CheckoutDraftRepository drafts,
			PaymentIntentService intentService,
			ProductVariantRepository variants,
			ShopSessionRepository sessions,
			SessionService sessionService,
			Clock clock,
			@Value("${mibolt.checkout.terms-version}") String termsVersion,
			@Value("${mibolt.smoke.enabled:false}") boolean smokeEnabled) {
		this.orders = orders;
		this.cartService = cartService;
		this.carts = carts;
		this.checkoutService = checkoutService;
		this.drafts = drafts;
		this.intentService = intentService;
		this.variants = variants;
		this.sessions = sessions;
		this.sessionService = sessionService;
		this.clock = clock;
		this.termsVersion = termsVersion;
		this.smokeEnabled = smokeEnabled;
	}

	/** {@code paymentIntentId} is null for cash on delivery. */
	public OrderData.Receipt place(ShopSession current, String ifMatch, String paymentMethod,
			String paymentIntentId, String requestedTermsVersion, boolean acceptedTerms) {

		// Rule 47: cart and price/stock changes first.
		CartData.CartView cart = cartService.getCart(current);
		List<String> noticeCodes = new ArrayList<>();
		boolean priceChanged = false;
		for (CartData.Notice n : cart.notices()) {
			noticeCodes.add(n.code());
			if ("PRICE_CHANGED".equals(n.code())) {
				priceChanged = true;
			}
		}
		if (priceChanged) {
			throw new DomainException(ErrorCode.PRICE_CHANGED,
					"Cart prices were updated; the shopper must review the new total",
					Map.of("notices", noticeCodes));
		}
		if (!noticeCodes.isEmpty()) {
			throw new DomainException(ErrorCode.OUT_OF_STOCK,
					"Stock ran out while the shopper was in checkout",
					Map.of("notices", noticeCodes));
		}

		// Rule 37: version after replay, before the draft.
		cartService.expectVersion(current, ifMatch);

		// Rules 40–41: consent.
		if (!acceptedTerms) {
			throw new DomainException(ErrorCode.VALIDATION_FAILED, "Terms must be accepted", null,
					List.of(new FieldError("/acceptedTerms", "TERMS_NOT_ACCEPTED")), null);
		}
		if (!termsVersion.equals(requestedTermsVersion)) {
			throw new DomainException(ErrorCode.VALIDATION_FAILED,
					"Terms version is outdated",
					Map.of("current", termsVersion),
					List.of(new FieldError("/termsVersion", "TERMS_VERSION_OUTDATED")), null);
		}

		// Rule 38's precondition and the contract's checkoutIncomplete example.
		CheckoutData.Session checkout = checkoutService.getCheckout(current);
		if (!checkout.complete()) {
			throw new DomainException(ErrorCode.CHECKOUT_INCOMPLETE,
					"A required checkout section is missing", null,
					sectionMissingFieldErrors(checkout, cart, current), null);
		}

		// Rule 44: the draft is the authority on the payment method.
		if (!paymentMethod.equals(checkout.payment().method())) {
			throw new DomainException(ErrorCode.CHECKOUT_INCOMPLETE,
					"The order's payment method differs from the draft", null,
					List.of(new FieldError("/paymentMethod", "PAYMENT_METHOD_MISMATCH")), null);
		}

		// Rule 38: payment state (card only).
		if (CARD.equals(paymentMethod)) {
			OrderData.IntentView intent = intentService.get(current, paymentIntentId);
			if (INTENT_REQUIRES_ACTION.equals(intent.status())) {
				throw new DomainException(ErrorCode.PAYMENT_REQUIRED,
						"The referenced payment intent still requires action from the shopper",
						Map.of("paymentIntentId", paymentIntentId, "status", intent.status()));
			}
			if (INTENT_PENDING.equals(intent.status())) {
				throw new DomainException(ErrorCode.PAYMENT_PENDING,
						"The referenced payment intent has not reached a terminal status yet",
						Map.of("paymentIntentId", paymentIntentId, "status", intent.status()));
			}
			if (INTENT_DECLINED.equals(intent.status())) {
				throw new DomainException(ErrorCode.PAYMENT_DECLINED,
						"The referenced payment intent was declined. A new attempt needs a new idempotency key",
						Map.of("paymentIntentId", paymentIntentId, "status", intent.status()));
			}
			if (orders.existsByPaymentIntentId(paymentIntentId)) {
				throw new DomainException(ErrorCode.PAYMENT_REQUIRED,
						"The referenced payment intent already backs an order; a new card order needs a new payment",
						Map.of("paymentIntentId", paymentIntentId, "status", intent.status()));
			}
			if (intent.amount() != checkout.summary().total()) {
				throw new DomainException(ErrorCode.PRICE_CHANGED,
						"The payment intent amount does not match the current total",
						Map.of("intentAmount", intent.amount(), "total", checkout.summary().total()));
			}
		}

		// Rule 42, docs/04 §4: conditional stock decrement.
		// decrementStock is @Modifying(clearAutomatically=true, flushAutomatically=true), so
		// every entity loaded before this point is detached after the first call; we load
		// session/cart/draft only in the next step.
		for (CartData.Line line : cart.items()) {
			int updated = variants.decrementStock(line.variantId(), line.quantity());
			if (updated == 0) {
				throw new DomainException(ErrorCode.OUT_OF_STOCK,
						"Stock ran out while the shopper was in checkout",
						Map.of("variantId", line.variantId()));
			}
			// ADR 0023: balance only the synthetic fixture's decrement in this same transaction.
			if (smokeEnabled && SmokeCanaryBootstrap.VARIANT_ID.equals(line.variantId())) {
				if (variants.incrementStock(line.variantId(), line.quantity()) != 1) {
					throw new IllegalStateException("Smoke canary stock compensation failed");
				}
			}
		}

		// Rule 46: order number, skip collisions.
		String orderNumber = uniqueOrderNumber();

		// Rules 42–44: persist the order from the draft and close the cart.
		OffsetDateTime at = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
		ShopSession session = sessions.findById(current.getId())
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND, "session not found"));
		Cart cartEntity = carts.findBySessionIdWithItems(current.getId())
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND, "cart not found"));
		CheckoutData.Address billingAddress = checkout.billing().address();
		CheckoutData.Delivery deliveryDraft = checkout.delivery();
		CheckoutData.Address deliveryAddress = deliveryDraft.address();

		ShopOrder order = new ShopOrder(
				orderNumber, session, STATUS_CONFIRMED, paymentMethod,
				CARD.equals(paymentMethod) ? paymentIntentId : null,
				checkout.summary().subtotal(), checkout.summary().shippingFee(),
				checkout.summary().paymentFee(), checkout.summary().total(),
				deliveryDraft.optionId(),
				deliveryAddress == null ? null : deliveryAddress.countryCode(),
				deliveryAddress == null ? null : deliveryAddress.postalCode(),
				deliveryAddress == null ? null : deliveryAddress.city(),
				deliveryAddress == null ? null : deliveryAddress.line1(),
				deliveryAddress == null ? null : deliveryAddress.line2(),
				checkout.billing().name(),
				billingAddress.countryCode(), billingAddress.postalCode(), billingAddress.city(),
				billingAddress.line1(), billingAddress.line2(),
				checkout.contact().fullName(), checkout.contact().email(), checkout.contact().phone(),
				termsVersion, NOTICE, at);
		int position = 0;
		for (CartData.Line line : cart.items()) {
			order.addLine(new OrderLine(order, position, line.variantId(), line.productName(),
					line.colorName(), line.storageGb(), line.quantity(),
					line.unitPrice(), line.lineTotal()));
			position = position + 1;
		}
		orders.save(order);

		drafts.findByCartId(cartEntity.getId()).ifPresent(drafts::delete);
		carts.delete(cartEntity);
		carts.flush();

		OffsetDateTime expiresAt = at.plus(sessionService.lifetime());
		carts.save(new Cart(session, at, expiresAt));
		session.bumpStateVersion();
		session.extend(at, expiresAt);

		return toReceipt(order);
	}

	/** Rule 45: read the order belonging to the current session. */
	public OrderData.Receipt get(ShopSession current, String orderId) {
		long id;
		try {
			id = Long.parseLong(orderId);
		}
		catch (NumberFormatException e) {
			throw new DomainException(ErrorCode.NOT_FOUND, "order not found",
					Map.of("orderId", orderId), null, e);
		}
		ShopOrder order = orders.findByIdAndSessionIdWithLines(id, current.getId())
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND, "order not found",
						Map.of("orderId", orderId)));
		return toReceipt(order);
	}

	private String uniqueOrderNumber() {
		while (true) {
			String candidate = ORDER_NUMBER_PREFIX + String.format("%06d", random.nextInt(1_000_000));
			if (!orders.existsByOrderNumber(candidate)) {
				return candidate;
			}
		}
	}

	private List<FieldError> sectionMissingFieldErrors(CheckoutData.Session checkout,
			CartData.CartView cart, ShopSession current) {
		List<FieldError> errors = new ArrayList<>();
		if (checkout.contact() == null) {
			errors.add(new FieldError("/contact", "SECTION_MISSING"));
		}
		if (checkout.billing() == null) {
			errors.add(new FieldError("/billing", "SECTION_MISSING"));
		}
		if (checkout.delivery() == null) {
			errors.add(new FieldError("/delivery", "SECTION_MISSING"));
		}
		if (checkout.payment() == null) {
			errors.add(new FieldError("/payment", "SECTION_MISSING"));
		}
		if (!errors.isEmpty()) {
			return errors;
		}
		if (cart.lineCount() == 0) {
			errors.add(new FieldError("/cart", "CART_EMPTY"));
			return errors;
		}
		// Decision 0010: stored selection the current cart makes unavailable.
		CheckoutData.Options options = checkoutService.getOptions(current);
		if (checkout.delivery() != null) {
			String optionId = checkout.delivery().optionId();
			for (CheckoutData.DeliveryOption opt : options.deliveryOptions()) {
				if (opt.id().equals(optionId) && !opt.available()) {
					errors.add(new FieldError("/delivery/optionId", "DELIVERY_OPTION_UNAVAILABLE"));
					break;
				}
			}
		}
		if (checkout.payment() != null) {
			String method = checkout.payment().method();
			for (CheckoutData.PaymentOption opt : options.paymentMethods()) {
				if (opt.id().equals(method) && !opt.available()) {
					errors.add(new FieldError("/payment/method", "PAYMENT_METHOD_UNAVAILABLE"));
					break;
				}
			}
		}
		return errors;
	}

	private OrderData.Receipt toReceipt(ShopOrder order) {
		List<OrderData.Line> items = new ArrayList<>(order.getLines().size());
		for (OrderLine line : order.getLines()) {
			items.add(new OrderData.Line(
					line.getProductName(), line.getVariantId(), line.getColorName(),
					line.getStorageGb(), line.getQuantity(),
					line.getUnitPriceHuf(), line.getLineTotalHuf()));
		}
		CheckoutData.Delivery delivery;
		String optionId = order.getDeliveryOption();
		if (PICKUP_POINT.equals(optionId)) {
			delivery = new CheckoutData.Delivery(optionId, null);
		}
		else {
			delivery = new CheckoutData.Delivery(optionId, new CheckoutData.Address(
					order.getDeliveryCountryCode(), order.getDeliveryPostalCode(),
					order.getDeliveryCity(), order.getDeliveryLine1(), order.getDeliveryLine2()));
		}
		CheckoutData.Billing billing = new CheckoutData.Billing(order.getBillingName(),
				new CheckoutData.Address(
						order.getBillingCountryCode(), order.getBillingPostalCode(),
						order.getBillingCity(), order.getBillingLine1(), order.getBillingLine2()));
		return new OrderData.Receipt(
				String.valueOf(order.getId()), order.getOrderNumber(), order.getCreatedAt(),
				order.getStatus(), items, order.getSubtotalHuf(),
				order.getShippingFeeHuf(), order.getPaymentFeeHuf(), order.getTotalHuf(),
				order.getPaymentMethod(),
				delivery, billing, order.getContactEmail(), order.getNotice());
	}
}
