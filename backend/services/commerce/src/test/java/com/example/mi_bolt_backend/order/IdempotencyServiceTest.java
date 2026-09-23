package com.example.mi_bolt_backend.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;

class IdempotencyServiceTest {

	private static final long SESSION_ID = 1L;
	private static final Instant FIXED_INSTANT = Instant.parse("2026-09-20T10:00:00Z");
	private static final Duration RETENTION = Duration.ofHours(24);

	private IdempotencyService service;
	private IdempotencyRecordRepository records;
	private ShopSession session;

	@BeforeEach
	void setUp() {
		records = mock(IdempotencyRecordRepository.class);
		Clock clock = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
		OffsetDateTime now = OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);
		session = new ShopSession("h", now, now.plusDays(30));
		ReflectionTestUtils.setField(session, "id", SESSION_ID);
		service = new IdempotencyService(records, clock, RETENTION);
	}

	// -- rule 1: fingerprint ----------------------------------------------------

	@Test
	void fingerprintOfEmptyBodyIsTheSha256Constant() {
		assertThat(service.fingerprint(""))
				.isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	}

	@Test
	void fingerprintIsStableForTheSameBody() {
		String first = service.fingerprint("{\"product\":\"abc\"}");
		String second = service.fingerprint("{\"product\":\"abc\"}");
		assertThat(first).isEqualTo(second);
		assertThat(first).matches("[0-9a-f]{64}");
	}

	// -- rule 2: replay ---------------------------------------------------------

	@Test
	void unknownKeyIsEmpty() {
		when(records.findBySessionIdAndMethodAndPathAndIdempotencyKey(SESSION_ID, "POST", "/orders", "k"))
				.thenReturn(Optional.empty());

		assertThat(service.replay(session, "POST", "/orders", "k", "hash")).isEmpty();
	}

	@Test
	void sameKeySameBodyReplaysTheStoredResponse() {
		IdempotencyRecord stored = record(now(), "hash-1", 201, "/orders/DEMO-1", "{\"ok\":true}");
		when(records.findBySessionIdAndMethodAndPathAndIdempotencyKey(SESSION_ID, "POST", "/orders", "k"))
				.thenReturn(Optional.of(stored));

		Optional<OrderData.StoredResponse> result = service.replay(session, "POST", "/orders", "k", "hash-1");

		assertThat(result).contains(new OrderData.StoredResponse(201, "/orders/DEMO-1", "{\"ok\":true}"));
	}

	@Test
	void sameKeyDifferentBodyIsAConflict() {
		IdempotencyRecord stored = record(now(), "hash-1", 201, "/orders/DEMO-1", "{\"ok\":true}");
		when(records.findBySessionIdAndMethodAndPathAndIdempotencyKey(SESSION_ID, "POST", "/orders", "k"))
				.thenReturn(Optional.of(stored));

		assertThatThrownBy(() -> service.replay(session, "POST", "/orders", "k", "hash-2"))
				.isInstanceOf(DomainException.class)
				.matches(ex -> {
					DomainException de = (DomainException) ex;
					return de.code() == ErrorCode.IDEMPOTENCY_CONFLICT
							&& "k".equals(de.params().get("key"));
				});
	}

	@Test
	void expiredRecordIsIgnored() {
		OffsetDateTime expired = now().minus(RETENTION).minusSeconds(1);
		IdempotencyRecord stored = record(expired, "hash-1", 201, "/orders/DEMO-1", "{\"ok\":true}");
		when(records.findBySessionIdAndMethodAndPathAndIdempotencyKey(SESSION_ID, "POST", "/orders", "k"))
				.thenReturn(Optional.of(stored));

		Optional<OrderData.StoredResponse> result = service.replay(session, "POST", "/orders", "k", "hash-1");

		assertThat(result).isEmpty();
	}

	// -- rule 3: store ----------------------------------------------------------

	@Test
	void storeSavesTheRecord() {
		ArgumentCaptor<IdempotencyRecord> captor = ArgumentCaptor.forClass(IdempotencyRecord.class);
		when(records.save(any(IdempotencyRecord.class))).thenAnswer(inv -> inv.getArgument(0));

		service.store(session, "POST", "/orders", "k", "hash-1",
				new OrderData.StoredResponse(201, "/orders/DEMO-1", "{\"ok\":true}"));

		verify(records).save(captor.capture());
		IdempotencyRecord saved = captor.getValue();
		assertThat(saved.getSession()).isSameAs(session);
		assertThat(saved.getMethod()).isEqualTo("POST");
		assertThat(saved.getPath()).isEqualTo("/orders");
		assertThat(saved.getIdempotencyKey()).isEqualTo("k");
		assertThat(saved.getRequestHash()).isEqualTo("hash-1");
		assertThat(saved.getResponseStatus()).isEqualTo(201);
		assertThat(saved.getResponseLocation()).isEqualTo("/orders/DEMO-1");
		assertThat(saved.getResponseBody()).isEqualTo("{\"ok\":true}");
		assertThat(saved.getCreatedAt()).isEqualTo(now());
	}

	@Test
	void storeDoesNotDeleteAFreshRecordForTheSameScope() {
		when(records.save(any(IdempotencyRecord.class))).thenAnswer(inv -> inv.getArgument(0));

		service.store(session, "POST", "/orders", "k", "hash-1",
				new OrderData.StoredResponse(201, "/orders/DEMO-1", "{\"ok\":true}"));

		verify(records, never()).delete(any(IdempotencyRecord.class));
		verify(records).save(any(IdempotencyRecord.class));
	}

	@Test
	void storeReplacesAnExpiredRecordForTheSameScope() {
		OffsetDateTime expired = now().minus(RETENTION).minusSeconds(1);
		IdempotencyRecord stored = record(expired, "hash-old", 201, "/orders/DEMO-1", "{\"old\":true}");
		when(records.findBySessionIdAndMethodAndPathAndIdempotencyKey(SESSION_ID, "POST", "/orders", "k"))
				.thenReturn(Optional.of(stored));
		when(records.save(any(IdempotencyRecord.class))).thenAnswer(inv -> inv.getArgument(0));

		service.store(session, "POST", "/orders", "k", "hash-new",
				new OrderData.StoredResponse(201, "/orders/DEMO-2", "{\"new\":true}"));

		verify(records).delete(stored);
		verify(records).save(any(IdempotencyRecord.class));
	}

	@Test
	void storeKeepsAFreshRecordForTheSameScope() {
		IdempotencyRecord stored = record(now(), "hash-old", 201, "/orders/DEMO-1", "{\"old\":true}");
		when(records.findBySessionIdAndMethodAndPathAndIdempotencyKey(SESSION_ID, "POST", "/orders", "k"))
				.thenReturn(Optional.of(stored));
		when(records.save(any(IdempotencyRecord.class))).thenAnswer(inv -> inv.getArgument(0));

		service.store(session, "POST", "/orders", "k", "hash-new",
				new OrderData.StoredResponse(201, "/orders/DEMO-2", "{\"new\":true}"));

		verify(records, never()).delete(any(IdempotencyRecord.class));
		verify(records).save(any(IdempotencyRecord.class));
	}

	private OffsetDateTime now() {
		return OffsetDateTime.ofInstant(FIXED_INSTANT, ZoneOffset.UTC);
	}

	private IdempotencyRecord record(OffsetDateTime createdAt, String hash, int status, String location,
			String body) {
		return new IdempotencyRecord(session, "POST", "/orders", "k", hash, status, location, body, createdAt);
	}
}
