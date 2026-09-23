package com.example.mi_bolt_backend.admin.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.example.mi_bolt_backend.catalog.Product;

/**
 * Read-side repository for the admin product API. Mirrors
 * {@code catalog.ProductRepository}'s five fetch queries (Hibernate refuses
 * to fetch-join more than one {@code List} in a single query, so the read is
 * split the same way), but without the {@code archivedAt is null} filter:
 * the admin sees archived products too.
 */
public interface AdminProductRepository extends JpaRepository<Product, Long> {

	@Query("select distinct p from Product p"
			+ " left join fetch p.colors c"
			+ " left join fetch c.image"
			+ " order by p.rank, p.id")
	List<Product> findAllWithColors();

	@Query("select distinct p from Product p"
			+ " left join fetch p.highlights"
			+ " where p in :products"
			+ " order by p.rank, p.id")
	List<Product> fetchHighlights(@Param("products") List<Product> products);

	@Query("select distinct p from Product p"
			+ " left join fetch p.colors c"
			+ " left join fetch c.image"
			+ " where p in :products"
			+ " order by p.rank, p.id")
	List<Product> fetchColors(@Param("products") List<Product> products);

	@Query("select distinct p from Product p"
			+ " left join fetch p.variants v"
			+ " left join fetch v.color"
			+ " where p in :products"
			+ " order by p.rank, p.id")
	List<Product> fetchVariants(@Param("products") List<Product> products);

	@Query("select distinct p from Product p"
			+ " left join fetch p.specGroups"
			+ " where p in :products"
			+ " order by p.rank, p.id")
	List<Product> fetchSpecGroups(@Param("products") List<Product> products);

	@Query("select distinct p.brand from Product p")
	List<String> findDistinctBrands();

	boolean existsBySlug(String productSlug);

	long countByFeaturedTrueAndArchivedAtIsNull();

	/**
	 * Locks the one {@code featured_limit_lock} row (changeset 0009) until the transaction ends.
	 * Every write that can add a featured, active product takes it before counting, so two such
	 * writes run one after the other whatever the product table holds.
	 */
	@Query(value = "select id from featured_limit_lock where id = 1 for update", nativeQuery = true)
	Integer lockFeaturedLimit();
}
