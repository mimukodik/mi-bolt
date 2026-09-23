package com.example.mi_bolt_backend.checkout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.persistence.EntityManager;

@IntegrationTest
@Transactional
class CheckoutDraftRepositoryTest {

	@Autowired
	private CheckoutDraftRepository drafts;

	@Autowired
	private CartRepository carts;

	@Autowired
	private ShopSessionRepository sessions;

	@Autowired
	private EntityManager entityManager;

	@Test
	void savesOneDraftPerCartAndRoundTripsEverySection() {
		OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
		ShopSession session = sessions.save(new ShopSession("hash-draft-test", now, now.plusDays(30)));
		Cart cart = carts.save(new Cart(session, now, now.plusDays(30)));
		CheckoutDraft draft = drafts.save(new CheckoutDraft(cart, now));
		draft.setContact("Anna Kovács", "anna@example.com", "+36301234567", now);
		draft.setBilling("Anna Kovács", "HU", "1111", "Budapest", "Fő utca 1", null, now);
		draft.setDelivery("home_delivery", "HU", "1111", "Budapest", "Fő utca 1", "2. em.", now);
		draft.setPayment("card", now);
		entityManager.flush();
		entityManager.clear();

		CheckoutDraft loaded = drafts.findByCartId(cart.getId()).orElseThrow();
		assertThat(loaded.getContactFullName()).isEqualTo("Anna Kovács");
		assertThat(loaded.getContactEmail()).isEqualTo("anna@example.com");
		assertThat(loaded.getContactPhone()).isEqualTo("+36301234567");
		assertThat(loaded.getBillingName()).isEqualTo("Anna Kovács");
		assertThat(loaded.getBillingCountryCode()).isEqualTo("HU");
		assertThat(loaded.getBillingPostalCode()).isEqualTo("1111");
		assertThat(loaded.getBillingCity()).isEqualTo("Budapest");
		assertThat(loaded.getBillingLine1()).isEqualTo("Fő utca 1");
		assertThat(loaded.getBillingLine2()).isNull();
		assertThat(loaded.getDeliveryOption()).isEqualTo("home_delivery");
		assertThat(loaded.getDeliveryCountryCode()).isEqualTo("HU");
		assertThat(loaded.getDeliveryPostalCode()).isEqualTo("1111");
		assertThat(loaded.getDeliveryCity()).isEqualTo("Budapest");
		assertThat(loaded.getDeliveryLine1()).isEqualTo("Fő utca 1");
		assertThat(loaded.getDeliveryLine2()).isEqualTo("2. em.");
		assertThat(loaded.getPaymentMethod()).isEqualTo("card");
		assertThat(loaded.getCart().getId()).isEqualTo(cart.getId());
		assertThat(loaded.getCreatedAt()).isEqualTo(now);
		assertThat(loaded.getUpdatedAt()).isEqualTo(now);

		OffsetDateTime later = now.plusHours(1);
		loaded.setDelivery("pickup_point", null, null, null, null, null, later);
		entityManager.flush();
		entityManager.clear();

		CheckoutDraft reloaded = drafts.findByCartId(cart.getId()).orElseThrow();
		assertThat(reloaded.getDeliveryOption()).isEqualTo("pickup_point");
		assertThat(reloaded.getDeliveryCountryCode()).isNull();
		assertThat(reloaded.getDeliveryPostalCode()).isNull();
		assertThat(reloaded.getDeliveryCity()).isNull();
		assertThat(reloaded.getDeliveryLine1()).isNull();
		assertThat(reloaded.getDeliveryLine2()).isNull();
		assertThat(reloaded.getCreatedAt()).isEqualTo(now);
		assertThat(reloaded.getUpdatedAt()).isEqualTo(later);
	}

	@Test
	void unknownCartHasNoDraft() {
		assertThat(drafts.findByCartId(-1L)).isEmpty();
	}

	@Test
	void existingCartWithNoDraftReturnsEmpty() {
		OffsetDateTime now = OffsetDateTime.now();
		ShopSession session = sessions.save(new ShopSession("hash-cart-without-draft", now, now.plusDays(30)));
		Cart cart = carts.save(new Cart(session, now, now.plusDays(30)));
		entityManager.flush();
		entityManager.clear();

		assertThat(drafts.findByCartId(cart.getId())).isEmpty();
	}

	@Test
	void deletingTheCartRemovesTheDraft() {
		OffsetDateTime now = OffsetDateTime.now();
		ShopSession session = sessions.save(new ShopSession("hash-cascade-delete", now, now.plusDays(30)));
		Cart cart = carts.save(new Cart(session, now, now.plusDays(30)));
		Long cartId = cart.getId();
		drafts.save(new CheckoutDraft(cart, now));
		entityManager.flush();
		entityManager.clear();

		Cart managed = carts.findById(cartId).orElseThrow();
		carts.delete(managed);
		entityManager.flush();
		entityManager.clear();

		assertThat(drafts.findByCartId(cartId)).isEmpty();
	}

	@Test
	void secondDraftForTheSameCartIsRejected() {
		OffsetDateTime now = OffsetDateTime.now();
		ShopSession session = sessions.save(new ShopSession("hash-unique-cart", now, now.plusDays(30)));
		Cart cart = carts.save(new Cart(session, now, now.plusDays(30)));
		drafts.save(new CheckoutDraft(cart, now));
		entityManager.flush();
		entityManager.clear();

		Cart reloaded = carts.findById(cart.getId()).orElseThrow();
		assertThatExceptionOfType(DataIntegrityViolationException.class)
				.isThrownBy(() -> drafts.save(new CheckoutDraft(reloaded, now)));
	}
}
