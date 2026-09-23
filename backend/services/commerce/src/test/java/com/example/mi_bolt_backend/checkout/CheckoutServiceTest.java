package com.example.mi_bolt_backend.checkout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

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
 * Pure unit tests for {@link CheckoutService}. The collaborators are mocked so the
 * suite runs without a Spring context; the {@link Clock} is fixed to 2026-09-20T10:00Z
 * so the draft timestamps stay deterministic.
 */
class CheckoutServiceTest {

	private static final long SESSION_ID = 1L;
	private static final long CART_ID = 10L;
	private static final Instant FIXED_INSTANT = Instant.parse("2026-09-20T10:00:00Z");
	private static final long HOME_FEE = 1490L;
	private static final long PICKUP_FEE = 990L;
	private static final long FREE_SHIPPING_THRESHOLD = 30000L;
	private static final long CARD_FEE = 0L;
	private static final long COD_FEE = 490L;
	private static final long COD_MAX_CART = 300000L;
	private static final String TERMS_VERSION = "2026-09";

	private CheckoutService service;
	private CartService cartService;
	private CheckoutDraftRepository drafts;

	private ShopSession session;
	private Cart cart;
	private OffsetDateTime now;

	@BeforeEach
	void setUp() {
		cartService = mock(CartService.class);
		CartRepository carts = mock(CartRepository.class);
		drafts = mock(CheckoutDraftRepository.class);
		ShopSessionRepository sessions = mock(ShopSessionRepository.class);
		SessionService sessionService = mock(SessionService.class);
		Clock clock = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);

		now = OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);
		session = new ShopSession("h", now, now.plusDays(30));
		ReflectionTestUtils.setField(session, "id", SESSION_ID);
		cart = new Cart(session, now, now.plusDays(30));
		ReflectionTestUtils.setField(cart, "id", CART_ID);

		when(sessions.findById(SESSION_ID)).thenReturn(Optional.of(session));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		when(sessionService.lifetime()).thenReturn(Duration.ofDays(30));
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(new CheckoutDraft(cart, now)));
		when(drafts.save(any(CheckoutDraft.class))).thenAnswer(inv -> inv.getArgument(0));
		when(cartService.getCart(session)).thenAnswer(inv -> cartView(0L, 0));

		service = new CheckoutService(cartService, carts, drafts, sessions, sessionService, clock,
				HOME_FEE, PICKUP_FEE, FREE_SHIPPING_THRESHOLD, CARD_FEE, COD_FEE, COD_MAX_CART,
				TERMS_VERSION);
	}

	// -- rule 1: cart first -----------------------------------------------------

	@Test
	void expiredCartPropagatesFromTheCartService() {
		when(cartService.getCart(session)).thenThrow(new DomainException(ErrorCode.CART_EXPIRED, "cart expired"));

		assertThatThrownBy(() -> service.getCheckout(session))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.CART_EXPIRED);
	}

	// -- rule 2: options depend on the cart value -------------------------------

	@Test
	void optionsBelowThresholdChargeShipping() {
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));

		CheckoutData.Options options = service.getOptions(session);

		assertThat(options.deliveryOptions()).hasSize(2);
		CheckoutData.DeliveryOption home = options.deliveryOptions().get(0);
		CheckoutData.DeliveryOption pickup = options.deliveryOptions().get(1);
		assertThat(home.id()).isEqualTo("home_delivery");
		assertThat(home.fee()).isEqualTo(1490L);
		assertThat(home.available()).isTrue();
		assertThat(home.unavailableReason()).isNull();
		assertThat(pickup.id()).isEqualTo("pickup_point");
		assertThat(pickup.fee()).isEqualTo(990L);
		assertThat(pickup.available()).isTrue();

		assertThat(options.paymentMethods()).hasSize(2);
		CheckoutData.PaymentOption card = options.paymentMethods().get(0);
		CheckoutData.PaymentOption cod = options.paymentMethods().get(1);
		assertThat(card.id()).isEqualTo("card");
		assertThat(card.fee()).isEqualTo(0L);
		assertThat(card.available()).isTrue();
		assertThat(cod.id()).isEqualTo("cash_on_delivery");
		assertThat(cod.fee()).isEqualTo(490L);
		assertThat(cod.available()).isTrue();
	}

	@Test
	void optionsAtThresholdShipFree() {
		when(cartService.getCart(session)).thenReturn(cartView(30000L, 1));

		CheckoutData.Options options = service.getOptions(session);

		assertThat(options.deliveryOptions().get(0).fee()).isZero();
		assertThat(options.deliveryOptions().get(1).fee()).isZero();
		assertThat(options.deliveryOptions().get(0).available()).isTrue();
		assertThat(options.deliveryOptions().get(1).available()).isTrue();
	}

	@Test
	void optionsAboveCodCeilingDisableCod() {
		when(cartService.getCart(session)).thenReturn(cartView(300001L, 1));

		CheckoutData.Options options = service.getOptions(session);

		CheckoutData.PaymentOption card = options.paymentMethods().get(0);
		CheckoutData.PaymentOption cod = options.paymentMethods().get(1);
		assertThat(card.available()).isTrue();
		assertThat(card.unavailableReason()).isNull();
		assertThat(cod.available()).isFalse();
		assertThat(cod.unavailableReason()).isEqualTo("CART_VALUE_TOO_HIGH");
	}

	@Test
	void optionsOnAnEmptyCartAreAllUnavailable() {
		when(cartService.getCart(session)).thenReturn(cartView(0L, 0));

		CheckoutData.Options options = service.getOptions(session);

		for (CheckoutData.DeliveryOption opt : options.deliveryOptions()) {
			assertThat(opt.available()).isFalse();
			assertThat(opt.unavailableReason()).isEqualTo("CART_EMPTY");
		}
		for (CheckoutData.PaymentOption opt : options.paymentMethods()) {
			assertThat(opt.available()).isFalse();
			assertThat(opt.unavailableReason()).isEqualTo("CART_EMPTY");
		}
	}

	@Test
	void optionsCarryTheTermsVersion() {
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));

		CheckoutData.Options options = service.getOptions(session);

		assertThat(options.termsVersion()).isEqualTo("2026-09");
	}

	// -- rule 3: draft created lazily, no version bump on GET -------------------

	@Test
	void getCreatesAnEmptyDraftOnceWithoutBumping() {
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.empty());
		when(cartService.getCart(session)).thenReturn(cartView(0L, 0));

		CheckoutData.Session view = service.getCheckout(session);

		verify(drafts, times(1)).save(any(CheckoutDraft.class));
		assertThat(view.contact()).isNull();
		assertThat(view.billing()).isNull();
		assertThat(view.delivery()).isNull();
		assertThat(view.payment()).isNull();
		assertThat(view.complete()).isFalse();
		assertThat(view.version()).isEqualTo(session.getStateVersion());
	}

	// -- rule 4: summary recomputed on every read -------------------------------

	@Test
	void summaryReflectsCurrentCartAndSelections() {
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		draft.setDelivery("home_delivery", "HU", "1111", "Budapest", "Fo utca 1.", null, now);
		draft.setPayment("cash_on_delivery", now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.summary().subtotal()).isEqualTo(12990L);
		assertThat(view.summary().shippingFee()).isEqualTo(1490L);
		assertThat(view.summary().paymentFee()).isEqualTo(490L);
		assertThat(view.summary().total()).isEqualTo(14970L);
	}

	@Test
	void summaryWithoutSelectionsHasZeroFees() {
		when(cartService.getCart(session)).thenReturn(cartView(5000L, 1));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.summary().subtotal()).isEqualTo(5000L);
		assertThat(view.summary().shippingFee()).isZero();
		assertThat(view.summary().paymentFee()).isZero();
		assertThat(view.summary().total()).isEqualTo(5000L);
	}

	// -- rule 5: complete needs every section and a non-empty cart --------------

	@Test
	void completeIsTrueWhenEverySectionSetAndCartNonEmpty() {
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(seedFullDraft()));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.complete()).isTrue();
	}

	@Test
	void completeIsFalseWhenPaymentMissing() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		draft.setContact("Jane Doe", "jane@example.com", "+36123456789", now);
		draft.setBilling("Jane Doe", "HU", "1111", "Budapest", "Fo utca 1.", null, now);
		draft.setDelivery("home_delivery", "HU", "1111", "Budapest", "Fo utca 1.", null, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.complete()).isFalse();
	}

	@Test
	void completeIsFalseWhenBillingMissing() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		draft.setContact("Jane Doe", "jane@example.com", "+36123456789", now);
		draft.setDelivery("pickup_point", null, null, null, null, null, now);
		draft.setPayment("card", now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.billing()).isNull();
		assertThat(view.complete()).isFalse();
	}

	@Test
	void completeIsFalseWhenCartIsEmpty() {
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(seedFullDraft()));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 0));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.complete()).isFalse();
	}

	@Test
	void selectionAboveTheCodCeilingChargesNoFeeAndIsNotComplete() {
		CheckoutDraft draft = seedFullDraft();
		draft.setPayment("cash_on_delivery", now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(300001L, 1));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.payment().method()).isEqualTo("cash_on_delivery");
		assertThat(view.summary().shippingFee()).isZero();
		assertThat(view.summary().paymentFee()).isZero();
		assertThat(view.summary().total()).isEqualTo(300001L);
		assertThat(view.complete()).isFalse();
	}

	@Test
	void selectionsOnAnEmptiedCartChargeNoFee() {
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(seedFullDraft()));
		when(cartService.getCart(session)).thenReturn(cartView(0L, 0));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.delivery().optionId()).isEqualTo("home_delivery");
		assertThat(view.summary().shippingFee()).isZero();
		assertThat(view.summary().paymentFee()).isZero();
		assertThat(view.summary().total()).isZero();
		assertThat(view.complete()).isFalse();
	}

	// -- rule 6: update merges sections, bumps version ---------------------------

	@Test
	void updateWritesOnlyTheSentSections() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		draft.setContact("Jane Doe", "jane@example.com", "+36123456789", now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));
		long versionBefore = session.getStateVersion();

		CheckoutData.Update update = new CheckoutData.Update(null,
				new CheckoutData.Billing("Jane Doe",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				null, null);
		CheckoutData.Session view = service.update(session, update);

		assertThat(draft.getContactFullName()).isEqualTo("Jane Doe");
		assertThat(draft.getBillingName()).isEqualTo("Jane Doe");
		assertThat(draft.getBillingCity()).isEqualTo("Budapest");
		assertThat(view.version()).isEqualTo(versionBefore + 1L);
	}

	@Test
	void updateAfterAReconciliationNoticeBumpsOnce() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenAnswer(inv -> {
			session.bumpStateVersion();
			return cartView(12990L, 1);
		});
		long before = session.getStateVersion();

		CheckoutData.Session view = service.update(session, new CheckoutData.Update(
				new CheckoutData.Contact("Jane Doe", "jane@example.com", "+36123456789"), null, null, null));

		assertThat(session.getStateVersion()).isEqualTo(before + 1);
		assertThat(view.version()).isEqualTo(before + 1);
	}

	@Test
	void updatePickupClearsTheAddress() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		draft.setDelivery("home_delivery", "HU", "1111", "Budapest", "Fo utca 1.", null, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));

		CheckoutData.Update update = new CheckoutData.Update(null, null,
				new CheckoutData.Delivery("pickup_point", null), null);
		CheckoutData.Session view = service.update(session, update);

		assertThat(draft.getDeliveryOption()).isEqualTo("pickup_point");
		assertThat(draft.getDeliveryCountryCode()).isNull();
		assertThat(draft.getDeliveryPostalCode()).isNull();
		assertThat(draft.getDeliveryCity()).isNull();
		assertThat(draft.getDeliveryLine1()).isNull();
		assertThat(draft.getDeliveryLine2()).isNull();
		assertThat(view.delivery().optionId()).isEqualTo("pickup_point");
		assertThat(view.delivery().address()).isNull();
	}

	@Test
	void emptyUpdateIs422() {
		long versionBefore = session.getStateVersion();
		CheckoutData.Update empty = new CheckoutData.Update(null, null, null, null);

		assertThatThrownBy(() -> service.update(session, empty))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					List<FieldError> fieldErrors = de.fieldErrors();
					assertThat(fieldErrors).hasSize(1);
					FieldError fe = fieldErrors.get(0);
					return "/".equals(fe.getPath()) && "MIN_PROPERTIES".equals(fe.getCode());
				});

		assertThat(session.getStateVersion()).isEqualTo(versionBefore);
	}

	// -- rule 7: a selection must be available ----------------------------------

	@Test
	void codAboveCeilingIsRejected() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(300001L, 1));
		long versionBefore = session.getStateVersion();

		CheckoutData.Update update = new CheckoutData.Update(null, null, null, new CheckoutData.Payment("cash_on_delivery"));

		assertThatThrownBy(() -> service.update(session, update))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					List<FieldError> fieldErrors = de.fieldErrors();
					assertThat(fieldErrors).hasSize(1);
					FieldError fe = fieldErrors.get(0);
					if (!"/payment/method".equals(fe.getPath()) || !"PAYMENT_METHOD_UNAVAILABLE".equals(fe.getCode())) {
						return false;
					}
					Object reason = de.params().get("reason");
					return "CART_VALUE_TOO_HIGH".equals(reason);
				});

		assertThat(draft.getPaymentMethod()).isNull();
		assertThat(session.getStateVersion()).isEqualTo(versionBefore);
		verify(drafts, never()).save(any(CheckoutDraft.class));
	}

	@Test
	void homeDeliveryWithoutAddressIsRejected() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));
		long versionBefore = session.getStateVersion();

		CheckoutData.Update update = new CheckoutData.Update(null, null,
				new CheckoutData.Delivery("home_delivery", null), null);

		assertThatThrownBy(() -> service.update(session, update))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					List<FieldError> fieldErrors = de.fieldErrors();
					assertThat(fieldErrors).hasSize(1);
					FieldError fe = fieldErrors.get(0);
					return "/delivery/address".equals(fe.getPath()) && "REQUIRED".equals(fe.getCode());
				});

		assertThat(session.getStateVersion()).isEqualTo(versionBefore);
		verify(drafts, never()).save(any(CheckoutDraft.class));
	}

	@Test
	void selectionOnAnEmptyCartIsRejected() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(0L, 0));
		long versionBefore = session.getStateVersion();

		CheckoutData.Update update = new CheckoutData.Update(null, null,
				new CheckoutData.Delivery("pickup_point", null), null);

		assertThatThrownBy(() -> service.update(session, update))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					List<FieldError> fieldErrors = de.fieldErrors();
					assertThat(fieldErrors).hasSize(1);
					FieldError fe = fieldErrors.get(0);
					if (!"/delivery/optionId".equals(fe.getPath()) || !"DELIVERY_OPTION_UNAVAILABLE".equals(fe.getCode())) {
						return false;
					}
					return "CART_EMPTY".equals(de.params().get("reason"));
				});

		assertThat(session.getStateVersion()).isEqualTo(versionBefore);
		verify(drafts, never()).save(any(CheckoutDraft.class));
	}

	@Test
	void unknownDeliveryOptionIdIsRejectedWithOptionUnknown() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));
		long versionBefore = session.getStateVersion();

		CheckoutData.Update update = new CheckoutData.Update(null, null,
				new CheckoutData.Delivery("drone", null), null);

		assertThatThrownBy(() -> service.update(session, update))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					List<FieldError> fieldErrors = de.fieldErrors();
					assertThat(fieldErrors).hasSize(1);
					FieldError fe = fieldErrors.get(0);
					if (!"/delivery/optionId".equals(fe.getPath()) || !"DELIVERY_OPTION_UNAVAILABLE".equals(fe.getCode())) {
						return false;
					}
					return "OPTION_UNKNOWN".equals(de.params().get("reason"));
				});

		assertThat(session.getStateVersion()).isEqualTo(versionBefore);
		verify(drafts, never()).save(any(CheckoutDraft.class));
	}

	@Test
	void unknownPaymentMethodIdIsRejectedWithOptionUnknown() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));
		long versionBefore = session.getStateVersion();

		CheckoutData.Update update = new CheckoutData.Update(null, null, null, new CheckoutData.Payment("bitcoin"));

		assertThatThrownBy(() -> service.update(session, update))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					List<FieldError> fieldErrors = de.fieldErrors();
					assertThat(fieldErrors).hasSize(1);
					FieldError fe = fieldErrors.get(0);
					if (!"/payment/method".equals(fe.getPath()) || !"PAYMENT_METHOD_UNAVAILABLE".equals(fe.getCode())) {
						return false;
					}
					return "OPTION_UNKNOWN".equals(de.params().get("reason"));
				});

		assertThat(session.getStateVersion()).isEqualTo(versionBefore);
		verify(drafts, never()).save(any(CheckoutDraft.class));
	}

	// -- rule 8: view mapping ---------------------------------------------------

	@Test
	void viewCarriesEverySectionField() {
		CheckoutDraft draft = seedFullDraft();
		draft.setBilling("Jane Doe", "HU", "1111", "Budapest", "Fo utca 1.", "2. em.", now);
		draft.setDelivery("home_delivery", "HU", "1111", "Budapest", "Fo utca 1.", null, now);
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(cartService.getCart(session)).thenReturn(cartView(12990L, 1));

		CheckoutData.Session view = service.getCheckout(session);

		assertThat(view.version()).isEqualTo(session.getStateVersion());
		assertThat(view.contact()).isEqualTo(new CheckoutData.Contact("Jane Doe", "jane@example.com", "+36123456789"));
		assertThat(view.billing().name()).isEqualTo("Jane Doe");
		assertThat(view.billing().address().countryCode()).isEqualTo("HU");
		assertThat(view.billing().address().postalCode()).isEqualTo("1111");
		assertThat(view.billing().address().city()).isEqualTo("Budapest");
		assertThat(view.billing().address().line1()).isEqualTo("Fo utca 1.");
		assertThat(view.billing().address().line2()).isEqualTo("2. em.");
		assertThat(view.delivery().optionId()).isEqualTo("home_delivery");
		assertThat(view.delivery().address()).isNotNull();
		assertThat(view.delivery().address().line2()).isNull();
		assertThat(view.payment().method()).isEqualTo("card");
		assertThat(view.summary().subtotal()).isEqualTo(12990L);
		assertThat(view.summary().shippingFee()).isEqualTo(1490L);
		assertThat(view.summary().paymentFee()).isZero();
		assertThat(view.summary().total()).isEqualTo(14480L);
		assertThat(view.complete()).isTrue();
	}

	// -- helpers ---------------------------------------------------------------

	private CheckoutDraft seedFullDraft() {
		CheckoutDraft draft = new CheckoutDraft(cart, now);
		draft.setContact("Jane Doe", "jane@example.com", "+36123456789", now);
		draft.setBilling("Jane Doe", "HU", "1111", "Budapest", "Fo utca 1.", null, now);
		draft.setDelivery("home_delivery", "HU", "1111", "Budapest", "Fo utca 1.", null, now);
		draft.setPayment("card", now);
		return draft;
	}

	private CartData.CartView cartView(long subtotal, int lineCount) {
		return new CartData.CartView(
				CART_ID,
				session.getStateVersion(),
				List.of(),
				lineCount,
				0,
				subtotal,
				now.plusDays(30),
				List.of());
	}
}
