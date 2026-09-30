package com.example.mi_bolt_backend.order;

import java.util.Optional;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentIntentRepository extends JpaRepository<PaymentIntent, String> {

	Optional<PaymentIntent> findByIdAndSessionId(String id, Long sessionId);
	List<PaymentIntent> findBySessionIdOrderByCreatedAtDesc(Long sessionId);
}
