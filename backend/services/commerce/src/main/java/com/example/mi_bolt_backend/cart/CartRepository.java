package com.example.mi_bolt_backend.cart;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CartRepository extends JpaRepository<Cart, Long> {

	@Query("select distinct c from Cart c"
			+ " left join fetch c.items i"
			+ " left join fetch i.variant v"
			+ " left join fetch v.product"
			+ " left join fetch v.color col"
			+ " left join fetch col.image"
			+ " where c.session.id = :sessionId")
	Optional<Cart> findBySessionIdWithItems(@Param("sessionId") Long sessionId);
}