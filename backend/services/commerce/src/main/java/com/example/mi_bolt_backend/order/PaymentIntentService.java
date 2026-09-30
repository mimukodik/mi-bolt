package com.example.mi_bolt_backend.order;

import java.time.Clock;
import tools.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.cart.CartData;
import com.example.mi_bolt_backend.cart.CartService;
import com.example.mi_bolt_backend.checkout.CheckoutData;
import com.example.mi_bolt_backend.checkout.CheckoutService;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;

@Service
@Transactional(noRollbackFor = DomainException.class)
public class PaymentIntentService {

	private static final String REQUIRES_ACTION = "requires_action";
	private static final String SUCCEEDED = "succeeded";
	private static final String DECLINED = "declined";
	private static final String PENDING = "pending";
	private static final String CARD = "card";

	private static final Set<String> ALLOWED_OUTCOMES = Set.of(SUCCEEDED, DECLINED, PENDING);

	private final PaymentIntentRepository intents;
	private final ObjectMapper objectMapper;
	private final CartService cartService;
	private final CheckoutService checkoutService;
	private final Clock clock;
	private final Duration lifetime;
	private final String redirectPrefix;
	private final String returnPrefix;

	public PaymentIntentService(PaymentIntentRepository intents,
			CartService cartService,
			CheckoutService checkoutService,
			Clock clock,
			@Value("${mibolt.payment.intent-lifetime}") Duration lifetime,
			@Value("${mibolt.payment.redirect-url-prefix}") String redirectPrefix,
			@Value("${mibolt.payment.return-url-prefix}") String returnPrefix, ObjectMapper objectMapper) {
		this.intents = intents;
		this.objectMapper = objectMapper;
		this.cartService = cartService;
		this.checkoutService = checkoutService;
		this.clock = clock;
		this.lifetime = lifetime;
		this.redirectPrefix = redirectPrefix;
		this.returnPrefix = returnPrefix;
	}

	public OrderData.IntentView create(ShopSession current, String ifMatch) {
		CartData.CartView cart = cartService.getCart(current);
		if (!cart.notices().isEmpty() || cartService.priceChanged(current)) {
			List<String> codes = cart.notices().stream().map(CartData.Notice::code).collect(Collectors.toList());
			throw new DomainException(ErrorCode.PRICE_CHANGED,
					"Cart prices were updated; the shopper must review the new total",
					Map.of("notices", codes));
		}
		cartService.expectVersion(current, ifMatch);
		CheckoutData.Session checkout = checkoutService.getCheckout(current);
		if (!checkout.complete()) {
			List<FieldError> fieldErrors = sectionMissing(checkout, cart);
			throw new DomainException(ErrorCode.CHECKOUT_INCOMPLETE,
					"Contact, billing, delivery or payment is missing", null, fieldErrors, null);
		}
		if (!CARD.equals(checkout.payment().method())) {
			throw new DomainException(ErrorCode.CHECKOUT_INCOMPLETE,
					"Payment intents exist for card payment only",
					null, List.of(new FieldError("/payment/method", "CARD_REQUIRED")), null);
		}
		OffsetDateTime now = now();
		String id = UUID.randomUUID().toString();
		PaymentIntent intent = new PaymentIntent(id, current, REQUIRES_ACTION, checkout.summary().total(),
				redirectPrefix + id, returnPrefix + id, now, now.plus(lifetime));
		intent.setSnapshotJson(objectMapper.writeValueAsString(new PaymentSnapshotData(cart, checkout,
				cartService.basketRevision(current), checkoutService.draftUpdatedAt(current), checkoutService.draftRevision(current))));
		intent.setBasketRevision(cart.basketRevision());
		intents.save(intent);
		return view(intent);
	}

	public PaymentSnapshotData snapshot(ShopSession current, String intentId) {
		return intents.findByIdAndSessionId(intentId, current.getId())
				.filter(intent -> intent.getSnapshotJson() != null)
				.map(intent -> objectMapper.readValue(intent.getSnapshotJson(), PaymentSnapshotData.class)).orElse(null);
	}

	public OrderData.IntentView get(ShopSession current, String intentId) {
		PaymentIntent intent = loadIntent(current, intentId);
		applyLazyExpiry(intent);
		return view(intent);
	}

	public OrderData.IntentView resolve(ShopSession current, String intentId, String outcome) {
		if (!ALLOWED_OUTCOMES.contains(outcome)) {
			throw new DomainException(ErrorCode.INVALID_REQUEST,
					"outcome must be one of succeeded, declined, or pending",
					Map.of("received", outcome));
		}
		PaymentIntent intent = loadIntent(current, intentId);
		applyLazyExpiry(intent);
		if (!REQUIRES_ACTION.equals(intent.getStatus())) {
			throw new DomainException(ErrorCode.PAYMENT_ALREADY_RESOLVED,
					"The intent reached a terminal status and cannot be changed",
					Map.of("status", intent.getStatus()));
		}
		intent.setStatus(outcome, now());
		return view(intent);
	}

	private PaymentIntent loadIntent(ShopSession current, String intentId) {
		Optional<PaymentIntent> existing = intents.findByIdAndSessionId(intentId, current.getId());
		if (existing.isEmpty()) {
			throw new DomainException(ErrorCode.NOT_FOUND, "payment intent not found",
					Map.of("paymentIntentId", intentId));
		}
		return existing.get();
	}

	private void applyLazyExpiry(PaymentIntent intent) {
		String status = intent.getStatus();
		if (REQUIRES_ACTION.equals(status) || PENDING.equals(status)) {
			OffsetDateTime at = now();
			if (!at.isBefore(intent.getExpiresAt())) {
				intent.setStatus(DECLINED, at);
			}
		}
	}

	private static List<FieldError> sectionMissing(CheckoutData.Session checkout, CartData.CartView cart) {
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
		if (errors.isEmpty() && cart.lineCount() == 0) {
			errors.add(new FieldError("/cart", "CART_EMPTY"));
		}
		return errors;
	}

	private OrderData.IntentView view(PaymentIntent intent) {
		return new OrderData.IntentView(intent.getId(), intent.getStatus(), intent.getAmountHuf(),
				intent.getRedirectUrl(), intent.getReturnUrl(), intent.getCreatedAt(), intent.getExpiresAt(), intent.getBasketRevision());
	}

	private OffsetDateTime now() {
		return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
	}
}
