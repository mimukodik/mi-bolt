package com.example.mi_bolt_backend.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
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
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartData;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.cart.CartService;
import com.example.mi_bolt_backend.catalog.CatalogData;
import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.checkout.CheckoutData;
import com.example.mi_bolt_backend.checkout.CheckoutDraft;
import com.example.mi_bolt_backend.checkout.CheckoutDraftRepository;
import com.example.mi_bolt_backend.checkout.CheckoutService;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.session.SessionService;

class OrderServiceTest {

	private static final long SESSION_ID = 1L;
	private static final long CART_ID = 10L;
	private static final long SAVED_ORDER_ID = 77L;
	private static final String TERMS_VERSION = "2026-09";
	private static final String NOTICE = "Ez egy demó rendelés: nem történt valódi fizetés, kiszállítás vagy e-mail-küldés.";
	private static final Instant FIXED_INSTANT = Instant.parse("2026-09-20T10:00:00Z");
	private static final Pattern ORDER_NUMBER_PATTERN = Pattern.compile("^DEMO-[0-9]{6}$");

	private OrderService service;
	private ShopOrderRepository orders;
	private CartService cartService;
	private CartRepository carts;
	private CheckoutService checkoutService;
	private CheckoutDraftRepository drafts;
	private PaymentIntentService intentService;
	private ProductVariantRepository variants;

	private ShopSession session;
	private Cart cart;
	private CheckoutDraft draft;
	private OffsetDateTime now;

	@BeforeEach
	void setUp() {
		orders = mock(ShopOrderRepository.class);
		cartService = mock(CartService.class);
		carts = mock(CartRepository.class);
		checkoutService = mock(CheckoutService.class);
		drafts = mock(CheckoutDraftRepository.class);
		intentService = mock(PaymentIntentService.class);
		variants = mock(ProductVariantRepository.class);
		ShopSessionRepository sessions = mock(ShopSessionRepository.class);
		SessionService sessionService = mock(SessionService.class);
		Clock clock = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);

		now = OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);
		session = new ShopSession("h", now, now.plusDays(30));
		ReflectionTestUtils.setField(session, "id", SESSION_ID);
		session.bumpStateVersion();
		session.bumpStateVersion();
		session.bumpStateVersion();
		assertThat(session.getStateVersion()).isEqualTo(4L);

		cart = new Cart(session, now, now.plusDays(30));
		ReflectionTestUtils.setField(cart, "id", CART_ID);
		draft = new CheckoutDraft(cart, now);

		when(sessionService.lifetime()).thenReturn(Duration.ofDays(30));
		when(sessions.findById(SESSION_ID)).thenReturn(Optional.of(session));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		when(drafts.findByCartId(CART_ID)).thenReturn(Optional.of(draft));
		when(carts.save(any(Cart.class))).thenAnswer(inv -> inv.getArgument(0));
		doNothing().when(cartService).expectVersion(session, "\"4\"");
		when(cartService.getCart(session)).thenReturn(cartViewSingleLine());
		when(checkoutService.getCheckout(session)).thenReturn(completeCardCheckout(299990L));
		when(checkoutService.getOptions(session)).thenReturn(optionsCardAvailable());
		when(intentService.get(session, "pi-1")).thenReturn(intentView("succeeded", 299990L));
		when(intentService.get(eq(session), anyString())).thenAnswer(inv -> intentView("succeeded", 299990L));
		when(variants.decrementStock(anyString(), anyInt())).thenReturn(1);
		when(orders.save(any(ShopOrder.class))).thenAnswer(inv -> {
			ShopOrder o = inv.getArgument(0);
			ReflectionTestUtils.setField(o, "id", SAVED_ORDER_ID);
			return o;
		});
		when(orders.existsByOrderNumber(anyString())).thenReturn(false);

		service = new OrderService(orders, cartService, carts, checkoutService, drafts,
				intentService, variants, sessions, sessionService, clock, TERMS_VERSION);
		ReflectionTestUtils.setField(service, "random", new Random(7));
	}

	// -- rule 1: cart and price/stock changes -----------------------------------

	@Test
	void priceChangeNoticeIs409PriceChanged() {
		CartData.CartView cartWithNotice = new CartData.CartView(
				10L, 4L, List.of(), 1, 1, 299990L, now.plusDays(30),
				List.of(new CartData.Notice("PRICE_CHANGED", "samsung-galaxy-s25--navy--128", Map.of("from", 1, "to", 2))));
		when(cartService.getCart(session)).thenReturn(cartWithNotice);

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
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
		verify(intentService, never()).get(any(), any());
	}

	@Test
	void stockNoticeIs409OutOfStock() {
		CartData.CartView cartWithNotice = new CartData.CartView(
				10L, 4L, List.of(), 1, 1, 299990L, now.plusDays(30),
				List.of(new CartData.Notice("QUANTITY_REDUCED", "samsung-galaxy-s25--navy--128",
						Map.of("from", 2, "to", 1)),
						new CartData.Notice("ITEM_REMOVED", "samsung-galaxy-s25--navy--256",
								Map.of("quantity", 1))));
		when(cartService.getCart(session)).thenReturn(cartWithNotice);

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.OUT_OF_STOCK) {
						return false;
					}
					Object notices = de.params().get("notices");
					return notices instanceof List<?> list
							&& list.size() == 2
							&& "QUANTITY_REDUCED".equals(list.get(0))
							&& "ITEM_REMOVED".equals(list.get(1));
				});
		verify(intentService, never()).get(any(), any());
	}

	// -- rule 2: If-Match --------------------------------------------------------

	@Test
	void staleIfMatchIs412() {
		doThrow(new DomainException(ErrorCode.CART_VERSION_CONFLICT, "version conflict",
				Map.of("expected", 4L, "received", 3L)))
				.when(cartService).expectVersion(session, "\"3\"");

		assertThatThrownBy(() -> service.place(session, "\"3\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.CART_VERSION_CONFLICT
							&& de.params() != null
							&& de.params().containsKey("expected")
							&& de.params().containsKey("received");
				});
		verify(intentService, never()).get(any(), any());
	}

	// -- rule 3: consent ---------------------------------------------------------

	@Test
	void termsNotAcceptedIs422() {
		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, false))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					List<FieldError> fe = de.fieldErrors();
					assertThat(fe).hasSize(1);
					assertThat(fe.get(0).getPath()).isEqualTo("/acceptedTerms");
					assertThat(fe.get(0).getCode()).isEqualTo("TERMS_NOT_ACCEPTED");
					return true;
				});
		verify(intentService, never()).get(any(), any());
	}

	@Test
	void outdatedTermsVersionIs422() {
		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", "2026-08", true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.VALIDATION_FAILED) {
						return false;
					}
					if (!TERMS_VERSION.equals(de.params().get("current"))) {
						return false;
					}
					List<FieldError> fe = de.fieldErrors();
					assertThat(fe).hasSize(1);
					assertThat(fe.get(0).getPath()).isEqualTo("/termsVersion");
					assertThat(fe.get(0).getCode()).isEqualTo("TERMS_VERSION_OUTDATED");
					return true;
				});
		verify(intentService, never()).get(any(), any());
	}

	// -- rule 4: draft completeness ----------------------------------------------

	@Test
	void incompleteDraftIs422() {
		CheckoutData.Session draftMissing = new CheckoutData.Session(
				4L,
				new CheckoutData.Contact("Jane", "jane@example.com", "+36123456789"),
				null,
				new CheckoutData.Delivery("home_delivery",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				null,
				new CheckoutData.Summary(299990L, 1490L, 0L, 301480L),
				false);
		when(checkoutService.getCheckout(session)).thenReturn(draftMissing);

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.CHECKOUT_INCOMPLETE) {
						return false;
					}
					List<FieldError> fe = de.fieldErrors();
					assertThat(fe).hasSize(2);
					assertThat(fe.get(0).getPath()).isEqualTo("/billing");
					assertThat(fe.get(0).getCode()).isEqualTo("SECTION_MISSING");
					assertThat(fe.get(1).getPath()).isEqualTo("/payment");
					assertThat(fe.get(1).getCode()).isEqualTo("SECTION_MISSING");
					return true;
				});
		verify(intentService, never()).get(any(), any());
	}

	@Test
	void unavailableStoredSelectionIs422() {
		CheckoutData.Session draftCodOverLimit = new CheckoutData.Session(
				4L,
				new CheckoutData.Contact("Jane", "jane@example.com", "+36123456789"),
				new CheckoutData.Billing("Jane",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Delivery("home_delivery",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Payment("cash_on_delivery"),
				new CheckoutData.Summary(300001L, 1490L, 490L, 301981L),
				false);
		CheckoutData.Options optionsCodUnavailable = new CheckoutData.Options(
				List.of(
						new CheckoutData.DeliveryOption("home_delivery", "Házhoz szállítás",
								"Futárral, 1–2 munkanapon belül.", 1490L, true, 2, true, null),
						new CheckoutData.DeliveryOption("pickup_point", "Átvételi pont",
								"Csomagponton, 2–3 munkanapon belül.", 990L, false, 3, true, null)),
				List.of(
						new CheckoutData.PaymentOption("card", "Bankkártya",
								"Online kártyás fizetés.", 0L, true, null),
						new CheckoutData.PaymentOption("cash_on_delivery", "Utánvét",
								"Készpénzzel vagy kártyával a futárnál.", 490L, false, "CART_VALUE_TOO_HIGH")),
				TERMS_VERSION);
		CartData.CartView overLimitCart = new CartData.CartView(
				10L, 4L, List.of(), 1, 1, 300001L, now.plusDays(30), List.of());
		when(cartService.getCart(session)).thenReturn(overLimitCart);
		when(checkoutService.getCheckout(session)).thenReturn(draftCodOverLimit);
		when(checkoutService.getOptions(session)).thenReturn(optionsCodUnavailable);

		assertThatThrownBy(() -> service.place(session, "\"4\"", "cash_on_delivery", null, TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.CHECKOUT_INCOMPLETE) {
						return false;
					}
					List<FieldError> fe = de.fieldErrors();
					assertThat(fe).hasSize(1);
					assertThat(fe.get(0).getPath()).isEqualTo("/payment/method");
					assertThat(fe.get(0).getCode()).isEqualTo("PAYMENT_METHOD_UNAVAILABLE");
					return true;
				});
		verify(intentService, never()).get(any(), any());
	}

	@Test
	void paymentMethodMismatchIs422() {
		assertThatThrownBy(() -> service.place(session, "\"4\"", "cash_on_delivery", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.CHECKOUT_INCOMPLETE) {
						return false;
					}
					List<FieldError> fe = de.fieldErrors();
					assertThat(fe).hasSize(1);
					assertThat(fe.get(0).getPath()).isEqualTo("/paymentMethod");
					assertThat(fe.get(0).getCode()).isEqualTo("PAYMENT_METHOD_MISMATCH");
					return true;
				});
		verify(intentService, never()).get(any(), any());
	}

	// -- rule 5: payment state ---------------------------------------------------

	@Test
	void requiresActionIs422PaymentRequired() {
		when(intentService.get(session, "pi-1")).thenReturn(intentView("requires_action", 299990L));

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.PAYMENT_REQUIRED) {
						return false;
					}
					return "pi-1".equals(de.params().get("paymentIntentId"))
							&& "requires_action".equals(de.params().get("status"));
				});
		verify(orders, never()).save(any(ShopOrder.class));
	}

	@Test
	void aSucceededIntentThatAlreadyBacksAnOrderIs422PaymentRequired() {
		when(orders.existsByPaymentIntentId("pi-1")).thenReturn(true);

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.PAYMENT_REQUIRED) {
						return false;
					}
					return "pi-1".equals(de.params().get("paymentIntentId"))
							&& "succeeded".equals(de.params().get("status"));
				});
		verify(orders, never()).save(any(ShopOrder.class));
		verify(variants, never()).decrementStock(anyString(), anyInt());
	}

	@Test
	void pendingIs422PaymentPending() {
		when(intentService.get(session, "pi-1")).thenReturn(intentView("pending", 299990L));

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.PAYMENT_PENDING) {
						return false;
					}
					return "pi-1".equals(de.params().get("paymentIntentId"))
							&& "pending".equals(de.params().get("status"));
				});
		verify(orders, never()).save(any(ShopOrder.class));
	}

	@Test
	void declinedIs422PaymentDeclined() {
		when(intentService.get(session, "pi-1")).thenReturn(intentView("declined", 299990L));

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.PAYMENT_DECLINED) {
						return false;
					}
					return "pi-1".equals(de.params().get("paymentIntentId"))
							&& "declined".equals(de.params().get("status"));
				});
		verify(orders, never()).save(any(ShopOrder.class));
	}

	@Test
	void succeededIntentWithADifferentAmountIs409PriceChanged() {
		when(intentService.get(session, "pi-1")).thenReturn(intentView("succeeded", 300480L));

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					if (de.code() != ErrorCode.PRICE_CHANGED) {
						return false;
					}
					return de.params() != null
							&& Long.valueOf(300480L).equals(((Number) de.params().get("intentAmount")).longValue())
							&& Long.valueOf(299990L).equals(((Number) de.params().get("total")).longValue());
				});
		verify(orders, never()).save(any(ShopOrder.class));
	}

	@Test
	void cashOnDeliveryNeedsNoIntent() {
		CheckoutData.Session codDraft = new CheckoutData.Session(
				4L,
				new CheckoutData.Contact("Jane", "jane@example.com", "+36123456789"),
				new CheckoutData.Billing("Jane",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Delivery("home_delivery",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Payment("cash_on_delivery"),
				new CheckoutData.Summary(299990L, 0L, 0L, 299990L),
				true);
		when(checkoutService.getCheckout(session)).thenReturn(codDraft);
		ArgumentCaptor<ShopOrder> captor = ArgumentCaptor.forClass(ShopOrder.class);

		service.place(session, "\"4\"", "cash_on_delivery", null, TERMS_VERSION, true);

		verify(intentService, never()).get(any(), any());
		verify(orders).save(captor.capture());
		assertThat(captor.getValue().getPaymentIntentId()).isNull();
	}

	// -- rule 6: stock -----------------------------------------------------------

	@Test
	void insufficientStockIs409AndNothingElseIsWritten() {
		when(variants.decrementStock("samsung-galaxy-s25--navy--128", 1))
				.thenReturn(0);

		assertThatThrownBy(() -> service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.OUT_OF_STOCK
							&& "samsung-galaxy-s25--navy--128".equals(de.params().get("variantId"));
				});
		verify(orders, never()).save(any(ShopOrder.class));
		verify(carts, never()).delete(any(Cart.class));
	}

	// -- rule 7: order number ---------------------------------------------------

	@Test
	void orderNumberIsDemoPlusSixDigitsAndSkipsACollision() {
		Random probe = new Random(7);
		String first = String.format("%06d", probe.nextInt(1_000_000));
		String second = String.format("%06d", probe.nextInt(1_000_000));
		assertThat(first).matches("[0-9]{6}");
		assertThat(second).matches("[0-9]{6}");
		assertThat(first).isNotEqualTo(second);
		when(orders.existsByOrderNumber("DEMO-" + first)).thenReturn(true);
		when(orders.existsByOrderNumber("DEMO-" + second)).thenReturn(false);

		ArgumentCaptor<ShopOrder> captor = ArgumentCaptor.forClass(ShopOrder.class);
		service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true);

		verify(orders).save(captor.capture());
		assertThat(captor.getValue().getOrderNumber()).isEqualTo("DEMO-" + second);
		assertThat(captor.getValue().getOrderNumber()).matches(ORDER_NUMBER_PATTERN);
	}

	// -- rule 8: persist ---------------------------------------------------------

	@Test
	void placeStoresTheOrderFromTheDraftAndClosesTheCart() {
		CartData.CartView twoLinesCart = new CartData.CartView(
				10L, 4L,
				List.of(
						cartLine("samsung-galaxy-s25--navy--128", 299990L, 299990L),
						cartLine("samsung-galaxy-s25--navy--256", 349990L, 349990L)),
				2, 2, 649980L, now.plusDays(30), List.of());
		CheckoutData.Session twoLinesCheckout = new CheckoutData.Session(
				4L,
				new CheckoutData.Contact("Jane Doe", "jane@example.com", "+36123456789"),
				new CheckoutData.Billing("Jane Doe",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Delivery("home_delivery",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Payment("card"),
				new CheckoutData.Summary(649980L, 0L, 0L, 649980L),
				true);
		when(cartService.getCart(session)).thenReturn(twoLinesCart);
		when(checkoutService.getCheckout(session)).thenReturn(twoLinesCheckout);
		when(intentService.get(session, "pi-1")).thenReturn(intentView("succeeded", 649980L));

		ArgumentCaptor<ShopOrder> captor = ArgumentCaptor.forClass(ShopOrder.class);
		OrderData.Receipt receipt = service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true);

		verify(orders).save(captor.capture());
		ShopOrder saved = captor.getValue();
		assertThat(saved.getOrderNumber()).matches(ORDER_NUMBER_PATTERN);
		assertThat(saved.getStatus()).isEqualTo("confirmed");
		assertThat(saved.getPaymentMethod()).isEqualTo("card");
		assertThat(saved.getPaymentIntentId()).isEqualTo("pi-1");
		assertThat(saved.getSubtotalHuf()).isEqualTo(649980L);
		assertThat(saved.getShippingFeeHuf()).isEqualTo(0L);
		assertThat(saved.getPaymentFeeHuf()).isEqualTo(0L);
		assertThat(saved.getTotalHuf()).isEqualTo(649980L);
		assertThat(saved.getDeliveryOption()).isEqualTo("home_delivery");
		assertThat(saved.getDeliveryCountryCode()).isEqualTo("HU");
		assertThat(saved.getDeliveryPostalCode()).isEqualTo("1111");
		assertThat(saved.getDeliveryCity()).isEqualTo("Budapest");
		assertThat(saved.getDeliveryLine1()).isEqualTo("Fo utca 1.");
		assertThat(saved.getDeliveryLine2()).isNull();
		assertThat(saved.getBillingName()).isEqualTo("Jane Doe");
		assertThat(saved.getBillingCountryCode()).isEqualTo("HU");
		assertThat(saved.getContactFullName()).isEqualTo("Jane Doe");
		assertThat(saved.getContactEmail()).isEqualTo("jane@example.com");
		assertThat(saved.getContactPhone()).isEqualTo("+36123456789");
		assertThat(saved.getTermsVersion()).isEqualTo(TERMS_VERSION);
		assertThat(saved.getNotice()).isEqualTo(NOTICE);
		assertThat(saved.getCreatedAt()).isEqualTo(now);
		assertThat(saved.getLines()).hasSize(2);
		OrderLine first = saved.getLines().get(0);
		assertThat(first.getPosition()).isEqualTo(0);
		assertThat(first.getVariantId()).isEqualTo("samsung-galaxy-s25--navy--128");
		assertThat(first.getUnitPriceHuf()).isEqualTo(299990L);
		assertThat(first.getLineTotalHuf()).isEqualTo(299990L);
		OrderLine second = saved.getLines().get(1);
		assertThat(second.getPosition()).isEqualTo(1);
		assertThat(second.getVariantId()).isEqualTo("samsung-galaxy-s25--navy--256");
		assertThat(second.getUnitPriceHuf()).isEqualTo(349990L);

		verify(drafts, times(1)).delete(draft);
		verify(carts, times(1)).delete(cart);
		ArgumentCaptor<Cart> newCartCaptor = ArgumentCaptor.forClass(Cart.class);
		verify(carts, times(1)).save(newCartCaptor.capture());
		assertThat(newCartCaptor.getValue().getSession()).isSameAs(session);
		assertThat(newCartCaptor.getValue().getCreatedAt()).isEqualTo(now);
		assertThat(newCartCaptor.getValue().getExpiresAt()).isEqualTo(now.plusDays(30));

		assertThat(session.getStateVersion()).isEqualTo(5L);
		assertThat(session.getLastSeenAt()).isEqualTo(now);
		assertThat(session.getExpiresAt()).isEqualTo(now.plusDays(30));

		assertThat(receipt.id()).isEqualTo("77");
		assertThat(receipt.orderNumber()).isEqualTo(saved.getOrderNumber());
		assertThat(receipt.subtotal()).isEqualTo(649980L);
		assertThat(receipt.shippingFee()).isEqualTo(0L);
		assertThat(receipt.paymentFee()).isEqualTo(0L);
		assertThat(receipt.total()).isEqualTo(649980L);
		assertThat(receipt.paymentMethod()).isEqualTo("card");
		assertThat(receipt.items()).hasSize(2);
	}

	@Test
	void placeIgnoresRequestDataForPricesAndAddresses() {
		ArgumentCaptor<ShopOrder> captor = ArgumentCaptor.forClass(ShopOrder.class);
		service.place(session, "\"4\"", "card", "pi-1", TERMS_VERSION, true);

		verify(orders).save(captor.capture());
		ShopOrder saved = captor.getValue();
		assertThat(saved.getSubtotalHuf()).isEqualTo(299990L);
		assertThat(saved.getShippingFeeHuf()).isEqualTo(0L);
		assertThat(saved.getPaymentFeeHuf()).isEqualTo(0L);
		assertThat(saved.getTotalHuf()).isEqualTo(299990L);
		assertThat(saved.getDeliveryLine1()).isEqualTo("Fo utca 1.");
		assertThat(saved.getContactEmail()).isEqualTo("jane@example.com");
	}

	// -- rule 9: get -------------------------------------------------------------

	@Test
	void getReturnsTheOwnOrder() {
		ShopOrder existing = new ShopOrder("DEMO-000001", session, "confirmed", "card", "pi-1",
				299990L, 0L, 0L, 299990L, "home_delivery", "HU", "1111", "Budapest",
				"Fo utca 1.", null, "Jane", "HU", "1111", "Budapest", "Fo utca 1.", null,
				"Jane", "jane@example.com", "+36123456789", TERMS_VERSION, NOTICE, now);
		ReflectionTestUtils.setField(existing, "id", 77L);
		existing.addLine(new OrderLine(existing, 0, "samsung-galaxy-s25--navy--128",
				"Galaxy S25", "Sotetkek", 128, 1, 299990L, 299990L));
		when(orders.findByIdAndSessionIdWithLines(77L, SESSION_ID)).thenReturn(Optional.of(existing));

		OrderData.Receipt receipt = service.get(session, "77");

		assertThat(receipt.id()).isEqualTo("77");
		assertThat(receipt.orderNumber()).isEqualTo("DEMO-000001");
		assertThat(receipt.subtotal()).isEqualTo(299990L);
		assertThat(receipt.items()).hasSize(1);
		assertThat(receipt.items().get(0).variantId()).isEqualTo("samsung-galaxy-s25--navy--128");
	}

	@Test
	void getForAnotherSessionIs404() {
		when(orders.findByIdAndSessionIdWithLines(77L, SESSION_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.get(session, "77"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.NOT_FOUND
							&& "77".equals(de.params().get("orderId"));
				});
	}

	@Test
	void getWithANonNumericIdIs404() {
		assertThatThrownBy(() -> service.get(session, "not-a-number"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.NOT_FOUND
							&& "not-a-number".equals(de.params().get("orderId"));
				});
		verify(orders, never()).findByIdAndSessionIdWithLines(any(), any());
	}

	// -- rule 10: receipt -------------------------------------------------------

	@Test
	void receiptCarriesEveryField() {
		ShopOrder order = new ShopOrder("DEMO-000001", session, "confirmed", "card", "pi-1",
				299990L, 0L, 0L, 299990L, "home_delivery",
				"HU", "1111", "Budapest", "Fo utca 1.", null,
				"Jane Doe", "HU", "1111", "Budapest", "Fo utca 1.", "2. em.",
				"Jane Doe", "jane@example.com", "+36123456789", TERMS_VERSION, NOTICE, now);
		ReflectionTestUtils.setField(order, "id", 77L);
		order.addLine(new OrderLine(order, 0, "samsung-galaxy-s25--navy--128",
				"Galaxy S25", "Sotetkek", 128, 1, 299990L, 299990L));
		when(orders.findByIdAndSessionIdWithLines(77L, SESSION_ID)).thenReturn(Optional.of(order));

		OrderData.Receipt receipt = service.get(session, "77");

		assertThat(receipt.id()).isEqualTo("77");
		assertThat(receipt.orderNumber()).isEqualTo("DEMO-000001");
		assertThat(receipt.createdAt()).isEqualTo(now);
		assertThat(receipt.status()).isEqualTo("confirmed");
		assertThat(receipt.items()).hasSize(1);
		assertThat(receipt.items().get(0).productName()).isEqualTo("Galaxy S25");
		assertThat(receipt.items().get(0).storageGb()).isEqualTo(128);
		assertThat(receipt.subtotal()).isEqualTo(299990L);
		assertThat(receipt.shippingFee()).isEqualTo(0L);
		assertThat(receipt.paymentFee()).isEqualTo(0L);
		assertThat(receipt.total()).isEqualTo(299990L);
		assertThat(receipt.paymentMethod()).isEqualTo("card");
		assertThat(receipt.delivery().optionId()).isEqualTo("home_delivery");
		assertThat(receipt.delivery().address()).isNotNull();
		assertThat(receipt.delivery().address().line1()).isEqualTo("Fo utca 1.");
		assertThat(receipt.delivery().address().line2()).isNull();
		assertThat(receipt.billing().name()).isEqualTo("Jane Doe");
		assertThat(receipt.billing().address().line1()).isEqualTo("Fo utca 1.");
		assertThat(receipt.billing().address().line2()).isEqualTo("2. em.");
		assertThat(receipt.contactEmail()).isEqualTo("jane@example.com");
		assertThat(receipt.notice()).isEqualTo(NOTICE);
	}

	// -- helpers ---------------------------------------------------------------

	private CartData.Line cartLine(String variantId, long unitPrice, long lineTotal) {
		return new CartData.Line(variantId, variantId + "-slug", "p-1", "p-1-slug",
				"Galaxy S25", "Sotetkek", 128,
				new CatalogData.ImageData("i-1", "/img.png", "alt", 100, 100),
				1, unitPrice, lineTotal, true, 5);
	}

	private CartData.CartView cartViewSingleLine() {
		return new CartData.CartView(
				10L, 4L, List.of(cartLine("samsung-galaxy-s25--navy--128", 299990L, 299990L)),
				1, 1, 299990L, now.plusDays(30), List.of());
	}

	private CheckoutData.Session completeCardCheckout(long total) {
		return new CheckoutData.Session(
				4L,
				new CheckoutData.Contact("Jane", "jane@example.com", "+36123456789"),
				new CheckoutData.Billing("Jane",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Delivery("home_delivery",
						new CheckoutData.Address("HU", "1111", "Budapest", "Fo utca 1.", null)),
				new CheckoutData.Payment("card"),
				new CheckoutData.Summary(total, 0L, 0L, total),
				true);
	}

	private CheckoutData.Options optionsCardAvailable() {
		return new CheckoutData.Options(
				List.of(
						new CheckoutData.DeliveryOption("home_delivery", "Házhoz szállítás",
								"Futárral, 1–2 munkanapon belül.", 1490L, true, 2, true, null),
						new CheckoutData.DeliveryOption("pickup_point", "Átvételi pont",
								"Csomagponton, 2–3 munkanapon belül.", 990L, false, 3, true, null)),
				List.of(
						new CheckoutData.PaymentOption("card", "Bankkártya",
								"Online kártyás fizetés.", 0L, true, null),
						new CheckoutData.PaymentOption("cash_on_delivery", "Utánvét",
								"Készpénzzel vagy kártyával a futárnál.", 490L, true, null)),
				TERMS_VERSION);
	}

	private OrderData.IntentView intentView(String status, long amount) {
		return new OrderData.IntentView("pi-1", status, amount,
				"/demo-fizetes/pi-1", "/penztar?paymentIntentId=pi-1", now, now.plusMinutes(30));
	}
}
