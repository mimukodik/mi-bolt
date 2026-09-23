package com.example.mi_bolt_backend.order;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.session.ShopSession;
import com.example.mi_bolt_backend.session.ShopSessionRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.persistence.EntityManager;

/**
 * Runs {@link IdempotencyService#store} against the real database: the purge of
 * an expired record for the same scope has to reach the database before the
 * replacement row is inserted, or the unique scope constraint rejects it.
 */
@IntegrationTest
@Transactional
class IdempotencyServiceIntegrationTest {

	@Autowired
	private IdempotencyService service;

	@Autowired
	private IdempotencyRecordRepository records;

	@Autowired
	private ShopSessionRepository sessions;

	@Autowired
	private EntityManager entityManager;

	@Test
	void storeReplacesAnExpiredRecordForTheSameScopeInTheDatabase() {
		OffsetDateTime now = OffsetDateTime.now().truncatedTo(ChronoUnit.MICROS);
		ShopSession session = sessions.save(new ShopSession("hash-idempotency-it", now, now.plusDays(30)));
		records.save(new IdempotencyRecord(session, "POST", "/orders", "key-expired-12345",
				"fingerprint-old", 201, "/api/v1/orders/1", "{\"old\":true}", now.minusHours(25)));
		entityManager.flush();

		service.store(session, "POST", "/orders", "key-expired-12345", "fingerprint-new",
				new OrderData.StoredResponse(201, "/api/v1/orders/2", "{\"new\":true}"));
		entityManager.flush();
		entityManager.clear();

		IdempotencyRecord stored = records.findBySessionIdAndMethodAndPathAndIdempotencyKey(
				session.getId(), "POST", "/orders", "key-expired-12345").orElseThrow();
		assertThat(stored.getResponseBody()).isEqualTo("{\"new\":true}");
		assertThat(stored.getResponseLocation()).isEqualTo("/api/v1/orders/2");
		// The unique (session, method, path, key) constraint means the replacement
		// either succeeded and the prior row is gone, or the save threw. Verifying
		// the new row's fingerprint confirms the replacement rather than the original.
		// A global count() is not used because OrdersApiTest is not @Transactional
		// and commits its own idempotency records into the shared H2 instance.
		assertThat(stored.getRequestHash()).isEqualTo("fingerprint-new");
	}
}
