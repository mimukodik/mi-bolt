package com.example.mi_bolt_backend.catalog;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface HalloweenAppearanceRepository extends JpaRepository<HalloweenAppearanceSettings, Long> {
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from HalloweenAppearanceSettings a where a.id = 1")
	Optional<HalloweenAppearanceSettings> lockSettings();
}
