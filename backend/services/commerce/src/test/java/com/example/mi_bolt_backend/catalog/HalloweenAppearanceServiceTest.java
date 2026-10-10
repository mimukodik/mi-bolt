package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.example.mi_bolt_backend.api.model.HalloweenAppearanceInput;
import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.api.model.ShopAppearance;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

class HalloweenAppearanceServiceTest {
	private static final OffsetDateTime START = OffsetDateTime.parse("2026-10-25T18:00:00Z");
	private static final OffsetDateTime END = OffsetDateTime.parse("2026-11-02T08:00:00Z");
	private HalloweenAppearanceRepository repository;
	private HalloweenAppearanceSettings settings;

	@BeforeEach
	void setUp() {
		repository = mock(HalloweenAppearanceRepository.class);
		settings = new HalloweenAppearanceSettings();
		when(repository.findById(1L)).thenReturn(Optional.of(settings));
		when(repository.lockSettings()).thenReturn(Optional.of(settings));
	}

	private HalloweenAppearanceService at(Instant instant) {
		return new HalloweenAppearanceService(repository, Clock.fixed(instant, ZoneOffset.UTC));
	}

	@Test
	void ownScheduleIsActiveExactlyFromStartUntilEnd() {
		settings.replace(true, START, END);
		ShopAppearance before = at(START.toInstant().minusNanos(1)).shop();
		assertThat(before.getHalloweenActive()).isFalse();
		assertThat(before.getNextChangeAt()).isEqualTo(START);
		ShopAppearance start = at(START.toInstant()).shop();
		assertThat(start.getHalloweenActive()).isTrue();
		assertThat(start.getServerTime()).isEqualTo(START);
		assertThat(start.getNextChangeAt()).isEqualTo(END);
		assertThat(at(END.toInstant().minusNanos(1)).shop().getHalloweenActive()).isTrue();
		ShopAppearance end = at(END.toInstant()).shop();
		assertThat(end.getHalloweenActive()).isFalse();
		assertThat(end.getNextChangeAt()).isNull();
		assertThat(at(END.toInstant().plusSeconds(1)).shop().getHalloweenActive()).isFalse();
	}

	@Test
	void disabledOrInvalidPersistedScheduleNeverActivatesOrAdvertisesABoundary() {
		settings.replace(false, START, END);
		assertThat(at(START.toInstant()).shop().getHalloweenActive()).isFalse();
		assertThat(at(START.toInstant()).shop().getNextChangeAt()).isNull();
		settings.replace(true, null, END);
		assertThat(at(START.toInstant()).shop().getHalloweenActive()).isFalse();
		settings.replace(true, START, null);
		assertThat(at(START.toInstant()).shop().getHalloweenActive()).isFalse();
		settings.replace(true, END, START);
		assertThat(at(START.toInstant()).shop().getNextChangeAt()).isNull();
	}

	@Test
	void enabledRequiresDatesAndStrictlyIncreasingRangeWithoutChangingSavedData() {
		HalloweenAppearanceService service = at(START.toInstant());
		assertThatThrownBy(() -> service.replace(new HalloweenAppearanceInput(true), "\"0\""))
				.isInstanceOfSatisfying(DomainException.class, error -> {
					assertThat(error.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
					assertThat(error.fieldErrors()).extracting(FieldError::getPath).containsExactly("/startsAt", "/endsAt");
				});
		for (OffsetDateTime endsAt : new OffsetDateTime[] {START, START.minusSeconds(1)}) {
			assertThatThrownBy(() -> service.replace(new HalloweenAppearanceInput(true).startsAt(START).endsAt(endsAt), "\"0\""))
					.isInstanceOfSatisfying(DomainException.class, error ->
							assertThat(error.fieldErrors()).extracting(FieldError::getPath).containsExactly("/endsAt"));
		}
		assertThat(settings.isEnabled()).isFalse();
		assertThat(settings.getStartsAt()).isNull();
		verify(repository, never()).flush();
	}

	@Test
	void disabledAllowsNoDatesAndValidReplacementReturnsSavedSettings() {
		HalloweenAppearanceService service = at(START.toInstant());
		assertThat(service.replace(new HalloweenAppearanceInput(false), "\"0\"").getEnabled()).isFalse();
		assertThat(service.read().getStartsAt()).isNull();
		assertThat(service.replace(new HalloweenAppearanceInput(true).startsAt(START).endsAt(END), "\"0\"").getStartsAt())
				.isEqualTo(START);
		assertThat(service.read().getVersion()).isZero();
		assertThat(service.read().getEndsAt()).isEqualTo(END);
	}

	@Test
	void missingAndMalformedAndStaleVersionsPreserveSettings() {
		HalloweenAppearanceService service = at(START.toInstant());
		for (String header : new String[] {null, "", " "}) {
			assertThatThrownBy(() -> service.replace(new HalloweenAppearanceInput(false), header))
					.isInstanceOfSatisfying(DomainException.class, error -> assertThat(error.code()).isEqualTo(ErrorCode.PRECONDITION_REQUIRED));
		}
		for (String header : new String[] {"bad", "0", "\"1\"", "*", "W/\"0\""}) {
			assertThatThrownBy(() -> service.replace(new HalloweenAppearanceInput(false), header))
					.isInstanceOfSatisfying(DomainException.class, error -> assertThat(error.code()).isEqualTo(ErrorCode.APPEARANCE_VERSION_CONFLICT));
		}
		verify(repository, never()).flush();
	}

	@Test
	void missingSingletonIsAServiceFailure() {
		when(repository.findById(1L)).thenReturn(Optional.empty());
		when(repository.lockSettings()).thenReturn(Optional.empty());
		HalloweenAppearanceService service = at(START.toInstant());
		assertThatThrownBy(service::read).isInstanceOf(DomainException.class);
		assertThatThrownBy(service::shop).isInstanceOf(DomainException.class);
		assertThatThrownBy(() -> service.replace(new HalloweenAppearanceInput(false), "\"0\""))
				.isInstanceOf(DomainException.class);
	}
}
