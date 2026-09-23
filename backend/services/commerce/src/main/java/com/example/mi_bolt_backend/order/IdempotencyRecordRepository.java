package com.example.mi_bolt_backend.order;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface IdempotencyRecordRepository extends JpaRepository<IdempotencyRecord, Long> {

	Optional<IdempotencyRecord> findBySessionIdAndMethodAndPathAndIdempotencyKey(
			Long sessionId, String method, String path, String idempotencyKey);
}
