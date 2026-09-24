package com.example.mi_bolt_backend.order;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShopOrderRepository extends JpaRepository<ShopOrder, Long> {

	boolean existsByOrderNumber(String orderNumber);

	boolean existsByPaymentIntentId(String paymentIntentId);

	@Query("select distinct o from ShopOrder o left join fetch o.lines where o.id = :id and o.session.id = :sessionId")
	Optional<ShopOrder> findByIdAndSessionIdWithLines(@Param("id") Long id, @Param("sessionId") Long sessionId);
}
