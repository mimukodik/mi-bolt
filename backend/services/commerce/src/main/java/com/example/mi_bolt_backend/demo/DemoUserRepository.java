package com.example.mi_bolt_backend.demo;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The {@code demo_user} rows (MIM-423). The demo has exactly one user, so the
 * inherited operations are the whole interface: the gate reads every row rather
 * than looking one up by name, so a renamed user never locks the demo out.
 */
public interface DemoUserRepository extends JpaRepository<DemoUser, UUID> {
}
