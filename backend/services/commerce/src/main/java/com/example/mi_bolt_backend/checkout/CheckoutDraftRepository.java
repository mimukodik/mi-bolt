package com.example.mi_bolt_backend.checkout;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CheckoutDraftRepository extends JpaRepository<CheckoutDraft, Long> {

	Optional<CheckoutDraft> findByCartId(Long cartId);
}
