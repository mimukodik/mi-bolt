package com.example.mi_bolt_backend.order;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.ShopSession;

@Service
@Transactional(noRollbackFor = DomainException.class)
public class IdempotencyService {

	private static final String HASH_ALGORITHM = "SHA-256";
	private static final HexFormat HEX_FORMAT = HexFormat.of();

	private final IdempotencyRecordRepository records;
	private final Clock clock;
	private final Duration retention;

	public IdempotencyService(IdempotencyRecordRepository records, Clock clock,
			@Value("${mibolt.idempotency.retention}") Duration retention) {
		this.records = records;
		this.clock = clock;
		this.retention = retention;
	}

	/** Hex SHA-256 of the normalised body; the empty string for a body-less request. */
	public String fingerprint(String normalisedBody) {
		try {
			MessageDigest digest = MessageDigest.getInstance(HASH_ALGORITHM);
			byte[] hash = digest.digest(normalisedBody.getBytes(StandardCharsets.UTF_8));
			return HEX_FORMAT.formatHex(hash);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(HASH_ALGORITHM + " is not available", e);
		}
	}

	public Optional<OrderData.StoredResponse> replay(ShopSession session, String method, String path,
			String key, String fingerprint) {
		Optional<IdempotencyRecord> existing = records.findBySessionIdAndMethodAndPathAndIdempotencyKey(
				session.getId(), method, path, key);
		if (existing.isEmpty()) {
			return Optional.empty();
		}
		IdempotencyRecord record = existing.get();
		OffsetDateTime createdAt = record.getCreatedAt();
		OffsetDateTime now = now();
		if (createdAt.isBefore(now.minus(retention))) {
			return Optional.empty();
		}
		if (!record.getRequestHash().equals(fingerprint)) {
			throw new DomainException(ErrorCode.IDEMPOTENCY_CONFLICT,
					"The idempotency key was already used with a different request",
					Map.of("key", key));
		}
		return Optional.of(new OrderData.StoredResponse(record.getResponseStatus(),
				record.getResponseLocation(), record.getResponseBody()));
	}

	public void store(ShopSession session, String method, String path, String key, String fingerprint,
			OrderData.StoredResponse response) {
		OffsetDateTime at = now();
		OffsetDateTime expiryThreshold = at.minus(retention);
		// A stale row still occupies the unique scope, so the next INSERT would trip
		// uq_idempotency_record_scope. Purge it here; replay() has already told the
		// caller there is no response to replay.
		records.findBySessionIdAndMethodAndPathAndIdempotencyKey(session.getId(), method, path, key)
				.filter(record -> record.getCreatedAt().isBefore(expiryThreshold))
				.ifPresent(record -> {
					records.delete(record);
					records.flush();
				});
		records.save(new IdempotencyRecord(session, method, path, key, fingerprint, response.status(),
				response.location(), response.body(), at));
	}

	private OffsetDateTime now() {
		return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
	}
}
