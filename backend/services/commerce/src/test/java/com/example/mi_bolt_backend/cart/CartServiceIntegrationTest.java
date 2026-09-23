package com.example.mi_bolt_backend.cart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;

@IntegrationTest
class CartServiceIntegrationTest {

	@Autowired
	private CartService service;

	@Autowired
	private CartRepository carts;

	@Autowired
	private ShopSessionRepository sessions;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Test
	void expiredCartIsRemovedFromTheDatabaseEvenWhenServiceThrows() {
		Long cartId = transactionTemplate.execute(status -> {
			ShopSession session = sessions.save(new ShopSession(
					"hash-expired-cart-" + System.nanoTime(),
					OffsetDateTime.now(),
					OffsetDateTime.now().plusDays(30)));
			Cart cart = new Cart(session, OffsetDateTime.now().minusDays(2), OffsetDateTime.now().minusSeconds(1));
			carts.save(cart);
			return cart.getId();
		});

		assertThat(cartId).isNotNull();

		assertThatThrownBy(() -> service.getCart(findSession(cartId)))
				.isInstanceOf(DomainException.class)
				.matches(ex -> ((DomainException) ex).code() == ErrorCode.CART_EXPIRED);

		Long finalCartId = cartId;
		Optional<Cart> reloaded = transactionTemplate.execute(
				(TransactionCallback<Optional<Cart>>) status -> carts.findById(finalCartId));
		assertThat(reloaded)
				.as("expired cart must be removed from the database even when the service throws CART_EXPIRED")
				.isEmpty();
	}

	private ShopSession findSession(Long cartId) {
		return transactionTemplate.execute((TransactionCallback<ShopSession>) status -> {
			Cart cart = carts.findById(cartId).orElseThrow();
			return cart.getSession();
		});
	}
}
