package com.example.mi_bolt_backend.catalog;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.api.model.HalloweenAppearance;
import com.example.mi_bolt_backend.api.model.HalloweenAppearanceInput;
import com.example.mi_bolt_backend.api.model.ShopAppearance;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/** Decoration runs on its own clock and persisted schedule, with no catalogue dependency. */
@Service
public class HalloweenAppearanceService {
	private final HalloweenAppearanceRepository repository;
	private final Clock clock;

	public HalloweenAppearanceService(HalloweenAppearanceRepository repository, Clock clock) {
		this.repository = repository;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public HalloweenAppearance read() {
		return model(repository.findById(1L).orElseThrow(() -> new DomainException(ErrorCode.SERVICE_UNAVAILABLE)));
	}

	@Transactional
	public HalloweenAppearance replace(HalloweenAppearanceInput input, String ifMatch) {
		HalloweenAppearanceSettings settings = repository.lockSettings()
				.orElseThrow(() -> new DomainException(ErrorCode.SERVICE_UNAVAILABLE));
		expectVersion(settings.getVersion(), ifMatch);
		validate(input);
		settings.replace(Boolean.TRUE.equals(input.getEnabled()), input.getStartsAt(), input.getEndsAt());
		repository.flush();
		return model(settings);
	}

	@Transactional(readOnly = true)
	public ShopAppearance shop() {
		HalloweenAppearanceSettings settings = repository.findById(1L)
				.orElseThrow(() -> new DomainException(ErrorCode.SERVICE_UNAVAILABLE));
		OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
		boolean valid = settings.isEnabled() && settings.getStartsAt() != null && settings.getEndsAt() != null
				&& settings.getStartsAt().isBefore(settings.getEndsAt());
		boolean active = valid && !now.isBefore(settings.getStartsAt()) && now.isBefore(settings.getEndsAt());
		OffsetDateTime next = null;
		if (valid && now.isBefore(settings.getStartsAt())) {
			next = settings.getStartsAt();
		}
		else if (active) {
			next = settings.getEndsAt();
		}
		return new ShopAppearance(active, now).nextChangeAt(next);
	}

	private static HalloweenAppearance model(HalloweenAppearanceSettings settings) {
		return new HalloweenAppearance(settings.isEnabled(), settings.getVersion())
				.startsAt(settings.getStartsAt()).endsAt(settings.getEndsAt());
	}

	private static void validate(HalloweenAppearanceInput input) {
		List<FieldError> errors = new ArrayList<>();
		if (Boolean.TRUE.equals(input.getEnabled())) {
			if (input.getStartsAt() == null) {
				errors.add(new FieldError("/startsAt", "REQUIRED"));
			}
			if (input.getEndsAt() == null) {
				errors.add(new FieldError("/endsAt", "REQUIRED"));
			}
		}
		if (input.getStartsAt() != null && input.getStartsAt().getNano() % 1_000 != 0) {
			errors.add(new FieldError("/startsAt", "DATETIME_PRECISION"));
		}
		if (input.getEndsAt() != null && input.getEndsAt().getNano() % 1_000 != 0) {
			errors.add(new FieldError("/endsAt", "DATETIME_PRECISION"));
		}
		if (input.getStartsAt() != null && input.getEndsAt() != null
				&& !input.getStartsAt().isBefore(input.getEndsAt())) {
			errors.add(new FieldError("/endsAt", "INVALID_PERIOD"));
		}
		if (!errors.isEmpty()) {
			throw new DomainException(ErrorCode.VALIDATION_FAILED, "Invalid decoration schedule", null, errors, null);
		}
	}

	private static void expectVersion(long expected, String ifMatch) {
		if (ifMatch == null || ifMatch.isBlank()) {
			throw new DomainException(ErrorCode.PRECONDITION_REQUIRED);
		}
		String quoted = "\"" + expected + "\"";
		if (!quoted.equals(ifMatch.trim())) {
			throw new DomainException(ErrorCode.APPEARANCE_VERSION_CONFLICT, "Appearance version conflict",
					Map.of("expected", expected, "received", ifMatch));
		}
	}
}
