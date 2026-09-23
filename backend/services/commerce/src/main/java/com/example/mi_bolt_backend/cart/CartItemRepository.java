package com.example.mi_bolt_backend.cart;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Cart lines as the catalogue sees them: which variants carts hold (docs/decisions/0020, "Replace"). */
public interface CartItemRepository extends JpaRepository<CartItem, Long> {

	/** The ids among {@code variantIds} that a line of a live cart ({@code expiresAt >= now}) holds. */
	@Query("select distinct i.variant.id from CartItem i where i.variant.id in :variantIds and i.cart.expiresAt >= :now")
	List<String> findVariantIdsInLiveCarts(@Param("variantIds") Collection<String> variantIds,
			@Param("now") OffsetDateTime now);

	/**
	 * Deletes the lines of expired carts ({@code expiresAt < now}) that hold any of {@code variantIds}.
	 * The cart rows stay, so their shoppers still get the one-time 410 CART_EXPIRED (ADR 0011).
	 */
	@Modifying(flushAutomatically = true)
	@Query("delete from CartItem i where i.variant.id in :variantIds"
			+ " and i.cart.id in (select c.id from Cart c where c.expiresAt < :now)")
	int deleteLinesInExpiredCarts(@Param("variantIds") Collection<String> variantIds,
			@Param("now") OffsetDateTime now);
}
