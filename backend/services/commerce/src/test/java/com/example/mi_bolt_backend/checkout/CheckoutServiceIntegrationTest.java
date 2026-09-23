package com.example.mi_bolt_backend.checkout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.cart.Cart;
import com.example.mi_bolt_backend.cart.CartRepository;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.persistence.EntityManager;

/**
 * Runs {@link CheckoutService#update} against the real database: a PATCH that
 * is rejected must not leave an empty draft row behind, so validation has to
 * run before the draft is created.
 */
@IntegrationTest
@Transactional
class CheckoutServiceIntegrationTest {

	@Autowired
	private CheckoutService service;

	@Autowired
	private CheckoutDraftRepository drafts;

	@Autowired
	private CartRepository carts;

	@Autowired
	private ShopSessionRepository sessions;

	@Autowired
	private EntityManager entityManager;

	@Test
	void rejectedFirstPatchLeavesNoDraftRow() {
		OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
		ShopSession session = sessions.save(new ShopSession("hash-checkout-it", now, now.plusDays(30)));
		Cart cart = carts.save(new Cart(session, now, now.plusDays(30)));
		entityManager.flush();

		assertThatThrownBy(() -> service.update(session, new CheckoutData.Update(null, null, null, null)))
				.isInstanceOf(DomainException.class);
		entityManager.flush();

		assertThat(drafts.findByCartId(cart.getId())).isEmpty();
	}
}
