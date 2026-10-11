package com.example.mi_bolt_backend.catalog;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, String> {

	@Query("select v from ProductVariant v"
			+ " join fetch v.product"
			+ " join fetch v.color c"
			+ " join fetch c.image"
			+ " where v.id = :id")
	Optional<ProductVariant> findByIdWithDetails(@Param("id") String id);

	@Modifying(flushAutomatically = true)
	@Query(value = "update product_variant set promotion_reference_price_huf = price_huf"
			+ " where id = :id and promotion_reference_price_huf is null", nativeQuery = true)
	int capturePromotionReference(@Param("id") String id);

	@Query(value = "select promotion_reference_price_huf from product_variant where id = :id", nativeQuery = true)
	Long findPromotionReference(@Param("id") String id);

	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update ProductVariant v set v.stock = v.stock - :quantity where v.id = :id and v.stock >= :quantity")
	int decrementStock(@Param("id") String id, @Param("quantity") int quantity);

	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update ProductVariant v set v.stock = v.stock + :quantity where v.id = :id"
			+ " and v.product.slug = 'mi-bolt-smoke-canary'")
	int incrementStock(@Param("id") String id, @Param("quantity") int quantity);
}
