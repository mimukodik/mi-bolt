package com.example.mi_bolt_backend.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.cart.CartData;
import com.example.mi_bolt_backend.cart.CartService;
import com.example.mi_bolt_backend.checkout.CheckoutData;
import com.example.mi_bolt_backend.checkout.CheckoutService;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;

class PaymentIntentServiceTest {

	private static final long SESSION_ID = 1L;
	private static final Instant FIXED_INSTANT = Instant.parse("2026-09-20T10:00:00Z");
	private static final Duration LIFETIME = Duration.ofMinutes(30);
	private static final String REDIRECT_PREFIX = "http://localhost:4210/demo-fizetes/";
	private static final String RETURN_PREFIX = "http://localhost:4200/penztar?paymentIntentId=";

	private PaymentIntentService service;
	private PaymentIntentRepository intents;
	private CartService cartService;
	private CheckoutService checkoutService;
	private ShopSession session;

	@BeforeEach
	void setUp() {
		intents = mock(PaymentIntentRepository.class);
		cartService = mock(CartService.class);
		checkoutService = mock(CheckoutService.class);
		Clock clock = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
		OffsetDateTime now = OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);
		session = new ShopSession("h", now, now.plusDays(30));
		ReflectionTestUtils.setField(session, "id", SESSION_ID);
		session.bumpStateVersion();
		session.bumpStateVersion();
		session.bumpStateVersion();
		assertThat(session.getStateVersion()).isEqualTo(4L);

		when(intents.save(any(PaymentIntent.class))).thenAnswer(inv -> inv.getArgument(0));
		when(cartService.getCart(session)).thenReturn(cartView(300000L, 1, List.of()));
		doNothing().when(cartService).expectVersion(session, "\"4\"");
		when(checkoutService.getCheckout(session)).thenReturn(completeCheckout(300480L));

		service = new PaymentIntentService(intents, cartService, checkoutService, clock,
				LIFETIME, REDIRECT_PREFIX, RETURN_PREFIX);
	}

	// -- rule 1: order of checks in create --------------------------------------

	@Test
	void aCartNoticeIsReportedAsPriceChanged() {
		CartData.CartView cart = cartView(300000L, 1,
				List.of(new CartData.Notice("PRICE_CHANGED", "v-1", "Galaxy S25", new CartData.NoticeParams(null, 1, 2))));
		when(cartService.getCart(session)).thenReturn(cart);

		assertThatThrownBy(() -> service.create(session, "\"4\""))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.PRICE_CHANGED) {
						return false;
					}
					Object notices = de.params().get("notices");
					return notices instanceof List<?> list
							&& list.size() == 1
							&& "PRICE_CHANGED".equals(list.get(0));
				});

		verify(cartService, never()).expectVersion(any(), any());
	}

	@Test
	void staleIfMatchIs412() {
		DomainException conflict = new DomainException(ErrorCode.CART_VERSION_CONFLICT, "version conflict",
				Map.of("expected", 4L, "received", 3L));
		doThrow(conflict).when(cartService).expectVersion(session, "\"3\"");

		assertThatThrownBy(() -> service.create(session, "\"3\""))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.CART_VERSION_CONFLICT);
	}

	@Test
	void incompleteDraftIs422WithOneFieldErrorPerMissingSection() {
		CheckoutData.Session draft = new CheckoutData.Session(
				4L,
				null,
				new CheckoutData.Billing("Jane",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Delivery("pickup_point", null),
				null,
				new CheckoutData.Summary(300000L, 990L, 0L, 300990L),
				false);
		when(checkoutService.getCheckout(session)).thenReturn(draft);

		assertThatThrownBy(() -> service.create(session, "\"4\""))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.CHECKOUT_INCOMPLETE) {
						return false;
					}
					List<FieldError> fe = de.fieldErrors();
					assertThat(fe).hasSize(2);
					assertThat(fe.get(0).getPath()).isEqualTo("/contact");
					assertThat(fe.get(0).getCode()).isEqualTo("SECTION_MISSING");
					assertThat(fe.get(1).getPath()).isEqualTo("/payment");
					assertThat(fe.get(1).getCode()).isEqualTo("SECTION_MISSING");
					return true;
				});
	}

	@Test
	void cashOnDeliveryDraftCannotCreateAnIntent() {
		CheckoutData.Session draft = new CheckoutData.Session(
				4L,
				new CheckoutData.Contact("Jane", "jane@example.com", "+36123456789"),
				new CheckoutData.Billing("Jane",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Delivery("home_delivery",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Payment("cash_on_delivery"),
				new CheckoutData.Summary(300000L, 1490L, 490L, 301980L),
				true);
		when(checkoutService.getCheckout(session)).thenReturn(draft);

		assertThatThrownBy(() -> service.create(session, "\"4\""))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.CHECKOUT_INCOMPLETE) {
						return false;
					}
					List<FieldError> fe = de.fieldErrors();
					assertThat(fe).hasSize(1);
					assertThat(fe.get(0).getPath()).isEqualTo("/payment/method");
					assertThat(fe.get(0).getCode()).isEqualTo("CARD_REQUIRED");
					return true;
				});
	}

	// -- rule 2: creation -------------------------------------------------------

	@Test
	void createStoresARequiresActionIntentWithTheCheckoutTotal() {
		ArgumentCaptor<PaymentIntent> captor = ArgumentCaptor.forClass(PaymentIntent.class);
		long versionBefore = session.getStateVersion();

		OrderData.IntentView view = service.create(session, "\"4\"");

		verify(intents).save(captor.capture());
		PaymentIntent saved = captor.getValue();
		assertThat(saved.getId()).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
		assertThat(saved.getStatus()).isEqualTo("requires_action");
		assertThat(saved.getAmountHuf()).isEqualTo(300480L);
		assertThat(saved.getRedirectUrl()).isEqualTo(REDIRECT_PREFIX + saved.getId());
		assertThat(saved.getReturnUrl()).isEqualTo(RETURN_PREFIX + saved.getId());
		assertThat(saved.getCreatedAt()).isEqualTo(now());
		assertThat(saved.getExpiresAt()).isEqualTo(now().plusMinutes(30));
		assertThat(view.id()).isEqualTo(saved.getId());
		assertThat(view.amount()).isEqualTo(300480L);
		assertThat(view.status()).isEqualTo("requires_action");
		assertThat(session.getStateVersion()).isEqualTo(versionBefore);
	}

	// -- rule 3: get ------------------------------------------------------------

	@Test
	void unknownOrForeignIntentIs404() {
		when(intents.findByIdAndSessionId("pi-missing", SESSION_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.get(session, "pi-missing"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.NOT_FOUND
							&& "pi-missing".equals(de.params().get("paymentIntentId"));
				});
	}

	@Test
	void expiredPendingIntentReadsAsDeclined() {
		PaymentIntent intent = new PaymentIntent("pi-1", session, "pending", 100L, "/r", "/x",
				now().minusMinutes(31), now().minusSeconds(1));
		when(intents.findByIdAndSessionId("pi-1", SESSION_ID)).thenReturn(Optional.of(intent));

		OrderData.IntentView view = service.get(session, "pi-1");

		assertThat(view.status()).isEqualTo("declined");
		assertThat(intent.getStatus()).isEqualTo("declined");
	}

	@Test
	void succeededIntentIsNotTouchedByExpiry() {
		PaymentIntent intent = new PaymentIntent("pi-1", session, "succeeded", 100L, "/r", "/x",
				now().minusMinutes(31), now().minusSeconds(1));
		when(intents.findByIdAndSessionId("pi-1", SESSION_ID)).thenReturn(Optional.of(intent));

		OrderData.IntentView view = service.get(session, "pi-1");

		assertThat(view.status()).isEqualTo("succeeded");
		assertThat(intent.getStatus()).isEqualTo("succeeded");
	}

	// -- rule 4: resolve --------------------------------------------------------

	@Test
	void resolveSetsTheOutcomeOnce() {
		PaymentIntent intent = new PaymentIntent("pi-1", session, "requires_action", 100L, "/r", "/x",
				now(), now().plusMinutes(30));
		when(intents.findByIdAndSessionId("pi-1", SESSION_ID)).thenReturn(Optional.of(intent));

		OrderData.IntentView view = service.resolve(session, "pi-1", "succeeded");

		assertThat(view.status()).isEqualTo("succeeded");
		assertThat(intent.getStatus()).isEqualTo("succeeded");
	}

	@Test
	void resolveOnAResolvedIntentIs409() {
		PaymentIntent intent = new PaymentIntent("pi-1", session, "succeeded", 100L, "/r", "/x",
				now(), now().plusMinutes(30));
		when(intents.findByIdAndSessionId("pi-1", SESSION_ID)).thenReturn(Optional.of(intent));

		assertThatThrownBy(() -> service.resolve(session, "pi-1", "succeeded"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.PAYMENT_ALREADY_RESOLVED
							&& "succeeded".equals(de.params().get("status"));
				});
	}

	@Test
	void resolveOnAPendingIntentIs409() {
		PaymentIntent intent = new PaymentIntent("pi-1", session, "pending", 100L, "/r", "/x",
				now(), now().plusMinutes(30));
		when(intents.findByIdAndSessionId("pi-1", SESSION_ID)).thenReturn(Optional.of(intent));

		assertThatThrownBy(() -> service.resolve(session, "pi-1", "succeeded"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.PAYMENT_ALREADY_RESOLVED
							&& "pending".equals(de.params().get("status"));
				});
	}

	@Test
	void resolveOnAnExpiredIntentIs409() {
		PaymentIntent intent = new PaymentIntent("pi-1", session, "requires_action", 100L, "/r", "/x",
				now().minusMinutes(31), now().minusSeconds(1));
		when(intents.findByIdAndSessionId("pi-1", SESSION_ID)).thenReturn(Optional.of(intent));

		assertThatThrownBy(() -> service.resolve(session, "pi-1", "succeeded"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.PAYMENT_ALREADY_RESOLVED
							&& "declined".equals(de.params().get("status"));
				});
	}

	@Test
	void resolveRejectsAnUnknownOutcome() {
		assertThatThrownBy(() -> service.resolve(session, "pi-1", "FOO"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.INVALID_REQUEST
							&& "FOO".equals(de.params().get("received"));
				});
		verify(intents, never()).findByIdAndSessionId(any(), any());
	}

	// -- rule 5: view mapping ---------------------------------------------------

	@Test
	void viewCarriesEveryField() {
		OffsetDateTime createdAt = now();
		OffsetDateTime expiresAt = now().plusMinutes(30);
		PaymentIntent intent = new PaymentIntent("pi-1", session, "requires_action", 300480L,
				"/demo-fizetes/pi-1", "/penztar?paymentIntentId=pi-1", createdAt, expiresAt);
		when(intents.findByIdAndSessionId("pi-1", SESSION_ID)).thenReturn(Optional.of(intent));

		OrderData.IntentView view = service.get(session, "pi-1");

		assertThat(view.id()).isEqualTo("pi-1");
		assertThat(view.status()).isEqualTo("requires_action");
		assertThat(view.amount()).isEqualTo(300480L);
		assertThat(view.redirectUrl()).isEqualTo("/demo-fizetes/pi-1");
		assertThat(view.returnUrl()).isEqualTo("/penztar?paymentIntentId=pi-1");
		assertThat(view.createdAt()).isEqualTo(createdAt);
		assertThat(view.expiresAt()).isEqualTo(expiresAt);
	}

	// -- order data shapes: smoke coverage for Line and Receipt -----------------

	@Test
	void orderDataLineAndReceiptCarryEveryField() {
		OrderData.Line line = new OrderData.Line("Galaxy S25", "samsung-galaxy-s25--navy--128",
				"Sotetkek", 128, 2, 299990L, 599980L);
		CheckoutData.Delivery delivery = new CheckoutData.Delivery("home_delivery",
				new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null));
		CheckoutData.Billing billing = new CheckoutData.Billing("Jane",
				new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null));
		OrderData.Receipt receipt = new OrderData.Receipt("o-1", "DEMO-000001", now(), "confirmed",
				List.of(line), 599980L, 1490L, 0L, 601470L, "card", delivery, billing,
				"jane@example.com", "demo");

		assertThat(line.productName()).isEqualTo("Galaxy S25");
		assertThat(line.lineTotal()).isEqualTo(599980L);
		assertThat(receipt.items()).containsExactly(line);
		assertThat(receipt.total()).isEqualTo(601470L);
		assertThat(receipt.delivery()).isSameAs(delivery);
	}

	// -- helpers ---------------------------------------------------------------

	private OffsetDateTime now() {
		return OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);
	}

	private CartData.CartView cartView(long subtotal, int lineCount, List<CartData.Notice> notices) {
		return new CartData.CartView(
				10L,
				session.getStateVersion(),
				List.of(),
				lineCount,
				0,
				subtotal,
				now().plusDays(30),
				notices);
	}

	private CheckoutData.Session completeCheckout(long total) {
		return new CheckoutData.Session(
				4L,
				new CheckoutData.Contact("Jane", "jane@example.com", "+36123456789"),
				new CheckoutData.Billing("Jane",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Delivery("home_delivery",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Payment("card"),
				new CheckoutData.Summary(300000L, 490L, -10L, total),
				true);
	}
}
