package com.example.mi_bolt_backend.catalog;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Read-side repository for the catalogue API.
 *
 * <p>Hibernate refuses to fetch-join more than one {@code List} in a single
 * query ({@code MultipleBagFetchException}), so the read is split across five
 * queries executed inside the same read-only transaction. Query 1 returns the
 * products with their colours (the only bag it joins) and each colour's
 * image (a to-one, safe to join). Queries 2–5 initialise the other collections
 * on the same managed entities via {@code p in :products}, so the service
 * treats the result of query 1 as the canonical list and discards the lists
 * returned by 2–5. {@code @OrderBy} on the entity fields keeps the in-memory
 * order stable across all five calls.
 *
 * <p>{@code findBySlugAndArchivedAtIsNull} plus the five fetchers is six
 * queries for the detail endpoint; the list endpoint issues five. Archived
 * products (those with a non-null {@code archived_at}) are excluded by
 * both queries, so the shop never sees them. The exact query count is
 * recorded in docs/decisions/0008.
 */
public interface ProductRepository extends JpaRepository<Product, Long> {

	@Query("select distinct p from Product p"
			+ " left join fetch p.colors c"
			+ " left join fetch c.image"
			+ " where p.archivedAt is null"
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

	Optional<Product> findBySlugAndArchivedAtIsNull(String slug);
}
