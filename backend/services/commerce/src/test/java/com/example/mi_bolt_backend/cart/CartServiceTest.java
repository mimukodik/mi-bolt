package com.example.mi_bolt_backend.cart;

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
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.example.mi_bolt_backend.catalog.CatalogImage;
import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.catalog.ProductColor;
import com.example.mi_bolt_backend.catalog.ProductVariant;
import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.catalog.PromotionPricing;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.session.SessionService;

/**
 * Pure unit tests for {@link CartService}. Every collaborator is mocked so the
 * tests run without a Spring context. The fixtures reuse the helpers from the
 * catalogue test suite to build products, colours, images and variants.
 */
class CartServiceTest {

	private static final long SESSION_ID = 1L;
	private static final long CART_ID = 10L;
	private static final long PRODUCT_ID = 42L;
	private static final String VARIANT_ID = "samsung-galaxy-s25--navy--128";
	private static final String VARIANT_SLUG = "sotetkek-128gb";
	private static final long PRICE_HUF = 299990L;
	private static final int STOCK = 7;
	private static final Instant FIXED_INSTANT = Instant.parse("2026-09-20T10:00:00Z");

	private CartService service;
	private CartRepository carts;
	private ProductVariantRepository variants;

	private ShopSession session;
	private ProductVariant navy;
	private Product product;

	@BeforeEach
	void setUp() {
		carts = mock(CartRepository.class);
		variants = mock(ProductVariantRepository.class);
		ShopSessionRepository sessions = mock(ShopSessionRepository.class);
		SessionService sessionService = mock(SessionService.class);
		Clock clock = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);

		OffsetDateTime now = OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);

		session = new ShopSession("token-hash", now, now.plusDays(30));
		ReflectionTestUtils.setField(session, "id", SESSION_ID);

		product = buildProduct(PRODUCT_ID, "samsung-galaxy-s25", "Samsung", "Galaxy S25");
		navy = buildVariant(product, VARIANT_ID, VARIANT_SLUG, "navy", "Sötétkék", 128, PRICE_HUF, STOCK);

		when(sessions.findById(SESSION_ID)).thenReturn(Optional.of(session));
		when(variants.findByIdWithDetails(VARIANT_ID)).thenReturn(Optional.of(navy));
		when(sessionService.lifetime()).thenReturn(Duration.ofDays(30));
		when(carts.save(any(Cart.class))).thenAnswer(inv -> {
			Cart cart = inv.getArgument(0);
			ReflectionTestUtils.setField(cart, "id", CART_ID);
			return cart;
		});

		service = new CartService(carts, variants, sessions, sessionService, clock, new PromotionPricing(clock));
	}

	@Test
	void versionComesFromTheReloadedSession() {
		ReflectionTestUtils.setField(session, "stateVersion", 7L);
		Cart cart = newCart(now(), now().plusDays(30));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.getCart(session);

		assertThat(view.version()).isEqualTo(7L);
	}

	@Test
	void getCartCreatesAnEmptyCartOnce() {
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.empty());

		CartData.CartView view = service.getCart(session);

		assertThat(view.items()).isEmpty();
		assertThat(view.lineCount()).isZero();
		assertThat(view.totalQuantity()).isZero();
		assertThat(view.subtotal()).isZero();
		assertThat(view.notices()).isEmpty();
		assertThat(view.version()).isEqualTo(1L);
		verify(carts, times(1)).save(any(Cart.class));
	}

	@Test
	void expiredCartIsDeletedAndReported() {
		OffsetDateTime now = now();
		Cart cart = newCart(now, now.minusSeconds(1));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		assertThatThrownBy(() -> service.getCart(session))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.CART_EXPIRED);

		verify(carts).delete(cart);
	}

	@Test
	void staleIfMatchIsAConflict() {
		ReflectionTestUtils.setField(session, "stateVersion", 3L);

		assertThatThrownBy(() -> service.expectVersion(session, "\"2\""))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.CART_VERSION_CONFLICT
							&& ((Number) de.params().get("expected")).longValue() == 3L
							&& ((Number) de.params().get("received")).longValue() == 2L;
				});

		service.expectVersion(session, "\"3\"");
	}

	@Test
	void expectVersionReadsTheSessionAndNeverTouchesTheCart() {
		ReflectionTestUtils.setField(session, "stateVersion", 3L);

		service.expectVersion(session, "\"3\"");

		verify(carts, never()).findBySessionIdWithItems(SESSION_ID);
		verify(carts, never()).save(any(Cart.class));
	}

	@Test
	void overflowingIfMatchIsAConflictNotAServerError() {
		ReflectionTestUtils.setField(session, "stateVersion", 3L);

		assertThatThrownBy(() -> service.expectVersion(session, "\"99999999999999999999\""))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.CART_VERSION_CONFLICT);
	}

	@Test
	void stockBelowQuantityReducesTheLineAndNotifies() {
		Cart cart = newCartNow();
		navy.setStock(2);
		cart.getItems().add(new CartItem(cart, navy, 4, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.getCart(session);

		assertThat(view.items()).hasSize(1);
		assertThat(view.items().get(0).quantity()).isEqualTo(2);
		assertThat(view.notices()).hasSize(1);
		assertThat(view.notices().get(0).code()).isEqualTo("QUANTITY_REDUCED");
		assertThat(view.notices().get(0).variantId()).isEqualTo(VARIANT_ID);
		assertThat(view.notices().get(0).params()).isEqualTo(new CartData.NoticeParams(null, 4, 2));
		assertThat(view.notices().get(0).productName()).isEqualTo("Galaxy S25");
		assertThat(view.version()).isEqualTo(2L);
	}

	@Test
	void zeroStockRemovesTheLineAndNotifies() {
		Cart cart = newCartNow();
		navy.setStock(0);
		cart.getItems().add(new CartItem(cart, navy, 4, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.getCart(session);

		assertThat(view.items()).isEmpty();
		assertThat(view.lineCount()).isZero();
		assertThat(view.notices()).hasSize(1);
		assertThat(view.notices().get(0).code()).isEqualTo("ITEM_REMOVED");
		assertThat(view.notices().get(0).variantId()).isEqualTo(VARIANT_ID);
		assertThat(view.notices().get(0).params()).isEqualTo(new CartData.NoticeParams(4, null, null));
		assertThat(view.notices().get(0).productName()).isEqualTo("Galaxy S25");
	}

	@Test
	void priceChangeUpdatesTheSnapshotAndNotifies() {
		Cart cart = newCartNow();
		navy.setPriceHuf(120000L);
		cart.getItems().add(new CartItem(cart, navy, 3, 100000L, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.getCart(session);

		assertThat(view.items()).hasSize(1);
		CartData.Line line = view.items().get(0);
		assertThat(line.unitPrice()).isEqualTo(120000L);
		assertThat(line.lineTotal()).isEqualTo(3L * 120000L);
		assertThat(view.notices()).hasSize(1);
		assertThat(view.notices().get(0).code()).isEqualTo("PRICE_CHANGED");
		assertThat(view.notices().get(0).variantId()).isEqualTo(VARIANT_ID);
		assertThat(view.notices().get(0).params()).isEqualTo(new CartData.NoticeParams(null, 100000, 120000));
		assertThat(view.notices().get(0).productName()).isEqualTo("Galaxy S25");
	}

	@Test
	void getWithoutChangesDoesNotBumpTheVersion() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 1, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		OffsetDateTime expiresBefore = cart.getExpiresAt();

		CartData.CartView view = service.getCart(session);

		assertThat(view.version()).isEqualTo(1L);
		assertThat(cart.getExpiresAt()).isEqualTo(expiresBefore);
	}

	@Test
	void clearBumpsTheVersionOnce() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 2, PRICE_HUF, now()));
		ProductVariant silver = buildVariant(product, "samsung-galaxy-s25--silver--128", "ezust-128gb", "silver", "Ezüst", 128, PRICE_HUF, 6);
		cart.getItems().add(new CartItem(cart, silver, 1, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.clear(session);

		assertThat(view.items()).isEmpty();
		assertThat(view.lineCount()).isZero();
		assertThat(view.version()).isEqualTo(2L);
	}

	@Test
	void addCreatesALine() {
		Cart cart = newCartNow();
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.addItem(session, VARIANT_ID, 2);

		assertThat(view.items()).hasSize(1);
		CartData.Line line = view.items().get(0);
		assertThat(line.variantId()).isEqualTo(VARIANT_ID);
		assertThat(line.quantity()).isEqualTo(2);
		assertThat(line.unitPrice()).isEqualTo(PRICE_HUF);
		assertThat(line.lineTotal()).isEqualTo(2L * PRICE_HUF);
		assertThat(line.maxQuantity()).isEqualTo(5);
		assertThat(line.inStock()).isTrue();
		assertThat(view.lineCount()).isEqualTo(1);
		assertThat(view.totalQuantity()).isEqualTo(2);
		assertThat(view.subtotal()).isEqualTo(2L * PRICE_HUF);
		assertThat(view.version()).isEqualTo(2L);
	}

	@Test
	void activePromotionDiscountIsStoredAndTotalledInCart() {
		product.setPromotionStartAt(now().minusMinutes(1));
		product.setPromotionEndAt(now().plusMinutes(1));
		product.setPromotionText("Adventi ajánlat");
		navy.setDiscountPriceHuf(249_990L);
		Cart cart = newCartNow();
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.addItem(session, VARIANT_ID, 2);

		assertThat(view.items().get(0).unitPrice()).isEqualTo(249_990L);
		assertThat(view.subtotal()).isEqualTo(499_980L);
	}

	@Test
	void addMergesIntoTheExistingLine() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 2, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.addItem(session, VARIANT_ID, 3);

		assertThat(view.items()).hasSize(1);
		assertThat(view.items().get(0).quantity()).isEqualTo(5);
	}

	@Test
	void addOverTheLineMaximumIsRejected() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 3, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		assertThatThrownBy(() -> service.addItem(session, VARIANT_ID, 3))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.QUANTITY_LIMIT
							&& ((Number) de.params().get("max")).intValue() == 5
							&& ((Number) de.params().get("requested")).intValue() == 6;
				});

		assertThat(cart.getItems().get(0).getQuantity()).isEqualTo(3);
		assertThat(session.getStateVersion()).isEqualTo(1L);
	}

	@Test
	void addUnknownVariantIs404() {
		Cart cart = newCartNow();
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		when(variants.findByIdWithDetails("nope")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.addItem(session, "nope", 1))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.NOT_FOUND
							&& "nope".equals(de.params().get("variantId"));
				});
	}

	@Test
	void addOutOfStockVariantIs409() {
		Cart cart = newCartNow();
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		navy.setStock(0);

		assertThatThrownBy(() -> service.addItem(session, VARIANT_ID, 1))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.OUT_OF_STOCK
							&& VARIANT_ID.equals(de.params().get("variantId"));
				});
	}

	@Test
	void setQuantityIsAbsolute() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 2, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.setQuantity(session, VARIANT_ID, 4);

		assertThat(view.items()).hasSize(1);
		assertThat(view.items().get(0).quantity()).isEqualTo(4);
		assertThat(view.version()).isEqualTo(2L);
	}

	@Test
	void setQuantityOnAMissingLineIs404() {
		Cart cart = newCartNow();
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		assertThatThrownBy(() -> service.setQuantity(session, VARIANT_ID, 1))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.NOT_FOUND
							&& VARIANT_ID.equals(de.params().get("variantId"));
				});
	}

	@Test
	void setQuantityOverTheMaximumIsRejected() {
		Cart cart = newCartNow();
		navy.setStock(3);
		cart.getItems().add(new CartItem(cart, navy, 1, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		assertThatThrownBy(() -> service.setQuantity(session, VARIANT_ID, 4))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.QUANTITY_LIMIT
							&& ((Number) de.params().get("max")).intValue() == 3
							&& ((Number) de.params().get("requested")).intValue() == 4;
				});
	}

	@Test
	void removeIsIdempotent() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 2, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		ProductVariant silver = buildVariant(product, "samsung-galaxy-s25--silver--128", "ezust-128gb", "silver", "Ezüst", 128, PRICE_HUF, 6);
		when(variants.findByIdWithDetails("samsung-galaxy-s25--silver--128")).thenReturn(Optional.of(silver));

		CartData.CartView view = service.removeItem(session, "samsung-galaxy-s25--silver--128");

		assertThat(view.items()).hasSize(1);
		assertThat(view.version()).isEqualTo(1L);
	}

	@Test
	void removeUnknownVariantIs404() {
		Cart cart = newCartNow();
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		when(variants.findByIdWithDetails("nope")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.removeItem(session, "nope"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.NOT_FOUND);
	}

	@Test
	void removeDropsTheLine() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 2, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.removeItem(session, VARIANT_ID);

		assertThat(view.items()).isEmpty();
		assertThat(view.version()).isEqualTo(2L);
	}

	@Test
	void removeOutOfStockVariantStillRemovesTheLine() {
		Cart cart = newCartNow();
		cart.getItems().add(new CartItem(cart, navy, 2, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));
		navy.setStock(0);

		CartData.CartView view = service.removeItem(session, VARIANT_ID);

		assertThat(view.items()).isEmpty();
		assertThat(view.version()).isEqualTo(2L);
	}

	@Test
	void addZeroQuantityIsRejected() {
		assertThatThrownBy(() -> service.addItem(session, VARIANT_ID, 0))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.INVALID_REQUEST);
	}

	@Test
	void addNegativeQuantityIsRejected() {
		assertThatThrownBy(() -> service.addItem(session, VARIANT_ID, -1))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.INVALID_REQUEST);
	}

	@Test
	void setQuantityZeroIsRejected() {
		assertThatThrownBy(() -> service.setQuantity(session, VARIANT_ID, 0))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.INVALID_REQUEST);
	}

	@Test
	void clearEmptyCartDoesNotBumpVersion() {
		Cart cart = newCartNow();
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.clear(session);

		assertThat(view.items()).isEmpty();
		assertThat(view.version()).isEqualTo(1L);
	}

	@Test
	void viewCarriesEveryLineField() {
		Cart cart = newCartNow();
		navy.setStock(7);
		String imageSha = "0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8";
		ProductColor navyColor = navy.getColor();
		CatalogImage img = new CatalogImage();
		img.setId(imageSha);
		img.setContentType("image/png");
		img.setWidth(800);
		img.setHeight(800);
		img.setBytes(new byte[]{1, 2, 3});
		navyColor.setImage(img);
		navyColor.setName("Sötétkék");
		navyColor.setAlt("alt");
		cart.getItems().add(new CartItem(cart, navy, 2, PRICE_HUF, now()));
		when(carts.findBySessionIdWithItems(SESSION_ID)).thenReturn(Optional.of(cart));

		CartData.CartView view = service.getCart(session);

		assertThat(view.items()).hasSize(1);
		CartData.Line line = view.items().get(0);
		assertThat(line.variantId()).isEqualTo(VARIANT_ID);
		assertThat(line.variantSlug()).isEqualTo(VARIANT_SLUG);
		assertThat(line.productId()).isEqualTo("42");
		assertThat(line.productSlug()).isEqualTo("samsung-galaxy-s25");
		assertThat(line.productName()).isEqualTo("Galaxy S25");
		assertThat(line.colorName()).isEqualTo("Sötétkék");
		assertThat(line.storageGb()).isEqualTo(128);
		assertThat(line.quantity()).isEqualTo(2);
		assertThat(line.unitPrice()).isEqualTo(PRICE_HUF);
		assertThat(line.lineTotal()).isEqualTo(2L * PRICE_HUF);
		assertThat(line.inStock()).isTrue();
		assertThat(line.maxQuantity()).isEqualTo(5);
		assertThat(line.image()).isNotNull();
		assertThat(line.image().src()).isEqualTo("/api/v1/media/" + imageSha);
		assertThat(line.image().alt()).isEqualTo("alt");
		assertThat(line.image().width()).isEqualTo(800);
		assertThat(line.image().height()).isEqualTo(800);
	}

	private OffsetDateTime now() {
		return OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);
	}

	private Cart newCartNow() {
		OffsetDateTime n = now();
		return newCart(n, n.plusDays(30));
	}

	private Cart newCart(OffsetDateTime now, OffsetDateTime expiresAt) {
		Cart cart = new Cart(session, now, expiresAt);
		ReflectionTestUtils.setField(cart, "id", CART_ID);
		return cart;
	}

	private static Product buildProduct(long id, String slug, String brand, String name) {
		Product p = new Product();
		ReflectionTestUtils.setField(p, "id", id);
		p.setSlug(slug);
		p.setBrand(brand);
		p.setName(name);
		return p;
	}

	private static ProductVariant buildVariant(Product product, String id, String slug, String code, String name,
			int storage, long priceHuf, int stock) {
		ProductColor color = new ProductColor();
		color.setCode(code);
		color.setName(name);
		color.setSwatchHex("#1B2A49");
		color.setAlt("alt");
		CatalogImage img = new CatalogImage();
		img.setId("0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8");
		img.setContentType("image/png");
		img.setWidth(800);
		img.setHeight(800);
		img.setBytes(new byte[]{1, 2, 3});
		color.setImage(img);
		color.setPosition(0);
		color.setProduct(product);

		ProductVariant variant = new ProductVariant();
		variant.setId(id);
		variant.setSlug(slug);
		variant.setColor(color);
		variant.setStorageGb(storage);
		variant.setPriceHuf(priceHuf);
		variant.setStock(stock);
		variant.setProduct(product);

		product.getColors().add(color);
		product.getVariants().add(variant);

		return variant;
	}
}
