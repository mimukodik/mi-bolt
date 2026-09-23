package com.example.mi_bolt_backend.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Read-only companion to {@link ProductRepository}. Hibernate's
 * "one bag per query" limit forces the spec rows to be fetched in a separate
 * query after the spec groups themselves have been attached to their products.
 */
public interface SpecGroupRepository extends JpaRepository<SpecGroup, Long> {

	@Query("select distinct g from SpecGroup g"
			+ " left join fetch g.rows"
			+ " where g.product in :products")
	List<SpecGroup> fetchRows(@Param("products") List<Product> products);
}
