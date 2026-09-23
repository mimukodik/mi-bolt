package com.example.mi_bolt_backend.session;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ShopSessionRepository extends JpaRepository<ShopSession, Long> {

	Optional<ShopSession> findByTokenHash(String tokenHash);
}
