package com.example.mi_bolt_backend.cart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.catalog.ProductVariant;
import com.example.mi_bolt_backend.catalog.ProductVariantRepository;
import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

@IntegrationTest
@Transactional
class CartRepositoryTest {

	private static final String NAVY_128 = "samsung-galaxy-s25--navy--128";

	@Autowired
	private CartRepository carts;

	@Autowired
	private ShopSessionRepository sessions;

	@Autowired
	private ProductVariantRepository variants;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private EntityManagerFactory entityManagerFactory;

	@Test
	void savesOneLinePerVariantAndLoadsItWithTheVariantInOneQuery() {
		OffsetDateTime now = OffsetDateTime.now();
		ShopSession session = sessions.save(new ShopSession("hash-cart-repo-test", now, now.plusDays(30)));
		ProductVariant navy = variants.findByIdWithDetails(NAVY_128).orElseThrow();
		Cart cart = new Cart(session, now, now.plusDays(30));
		cart.getItems().add(new CartItem(cart, navy, 2, navy.getPriceHuf(), now));
		carts.save(cart);
		entityManager.flush();
		entityManager.clear();

		Statistics stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
		stats.clear();
		Cart loaded = carts.findBySessionIdWithItems(session.getId()).orElseThrow();
		assertThat(loaded.getItems()).hasSize(1);
		CartItem line = loaded.getItems().get(0);
		assertThat(line.getVariant().getId()).isEqualTo(NAVY_128);
		assertThat(line.getVariant().getProduct().getSlug()).isEqualTo("samsung-galaxy-s25");
		assertThat(line.getVariant().getColor().getName()).isNotNull();
		assertThat(line.getVariant().getColor().getImage().getId()).hasSize(64);
		assertThat(line.getQuantity()).isEqualTo(2);
		assertThat(line.getUnitPriceHuf()).isEqualTo(299990L);
		assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
		assertThat(loaded.getId()).isEqualTo(cart.getId());
		assertThat(loaded.getSession().getId()).isEqualTo(session.getId());
		assertThat(loaded.getCreatedAt()).isNotNull();
		assertThat(loaded.getUpdatedAt()).isEqualTo(loaded.getCreatedAt());
		assertThat(loaded.getExpiresAt()).isAfter(loaded.getCreatedAt());
		assertThat(line.getId()).isNotNull();
		assertThat(line.getCart().getId()).isEqualTo(loaded.getId());
		assertThat(line.getCreatedAt()).isNotNull();
		assertThat(line.getUpdatedAt()).isEqualTo(line.getCreatedAt());
		OffsetDateTime later = now.plusHours(1);
		line.setQuantity(3, later);
		line.setUnitPriceHuf(1L, later);
		loaded.touch(later, later.plusDays(30));
		assertThat(line.getQuantity()).isEqualTo(3);
		assertThat(line.getUnitPriceHuf()).isEqualTo(1L);
		assertThat(line.getUpdatedAt()).isEqualTo(later);
		assertThat(loaded.getUpdatedAt()).isEqualTo(later);
		assertThat(loaded.getExpiresAt()).isEqualTo(later.plusDays(30));
	}

	@Test
	void sessionVersionBumpsByOne() {
		OffsetDateTime now = OffsetDateTime.now();
		ShopSession session = sessions.save(new ShopSession("hash-cart-repo-test-2", now, now.plusDays(30)));
		session.bumpStateVersion();
		OffsetDateTime later = now.plusHours(2);
		session.extend(later, later.plusDays(30));
		entityManager.flush();
		entityManager.clear();
		ShopSession reloaded = sessions.findById(session.getId()).orElseThrow();
		assertThat(reloaded.getStateVersion()).isEqualTo(2L);
		assertThat(reloaded.getLastSeenAt()).isCloseTo(later, within(1, ChronoUnit.SECONDS));
		assertThat(reloaded.getExpiresAt()).isCloseTo(later.plusDays(30), within(1, ChronoUnit.SECONDS));
	}

	@Test
	void unknownVariantIsEmpty() {
		assertThat(variants.findByIdWithDetails("nope")).isEmpty();
	}
}