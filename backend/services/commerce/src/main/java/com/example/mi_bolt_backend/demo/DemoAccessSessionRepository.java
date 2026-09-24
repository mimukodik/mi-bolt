package com.example.mi_bolt_backend.demo;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

/** The {@code demo_access_session} rows, looked up by the stored token hash (MIM-423). */
public interface DemoAccessSessionRepository extends JpaRepository<DemoAccessSession, Long> {

	Optional<DemoAccessSession> findByTokenHash(String tokenHash);
}
