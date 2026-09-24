package com.example.mi_bolt_backend.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The demo user's startup bootstrap (MIM-423): the configured user is created once, the
 * three ways the configuration stops the start, and the lost insert race.
 */
class DemoAccessBootstrapTest {

	private static final String USERNAME = "MiBoltDemoUser";

	private static final String PASSWORD = "1MiBoltDemo1";

	private DemoUserRepository users;

	private PasswordEncoder encoder;

	private Clock clock;

	@BeforeEach
	void setUp() {
		users = mock(DemoUserRepository.class);
		encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
		clock = Clock.fixed(Instant.parse("2026-09-24T00:00:00Z"), ZoneOffset.UTC);
	}

	// Fails if the DemoAccessBootstrap#run save is removed.
	@Test
	void anEmptyTableGetsTheConfiguredUser() {
		when(users.count()).thenReturn(0L);

		new DemoAccessBootstrap(users, encoder, clock, USERNAME, PASSWORD).run(null);

		ArgumentCaptor<DemoUser> captor = ArgumentCaptor.forClass(DemoUser.class);
		verify(users).save(captor.capture());
		DemoUser saved = captor.getValue();
		assertThat(saved.getUsername()).isEqualTo(USERNAME);
		assertThat(encoder.matches(PASSWORD, saved.getPasswordHash())).isTrue();
		assertThat(saved.getCreatedAt()).isEqualTo(OffsetDateTime.parse("2026-09-24T00:00:00Z"));
	}

	@Test
	void aPresentUserIsKept() {
		when(users.count()).thenReturn(1L);

		new DemoAccessBootstrap(users, encoder, clock, USERNAME, PASSWORD).run(null);

		verify(users, never()).save(any());
	}

	// Fails if DemoAccessBootstrap#run's blank-password check is removed: the demo would
	// start with a password the contract's minLength 1 can never send.
	@Test
	void aBlankPasswordStopsTheStart() {
		when(users.count()).thenReturn(0L);

		assertThatThrownBy(() -> new DemoAccessBootstrap(users, encoder, clock, USERNAME, "").run(null))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("MIBOLT_DEMO_PASSWORD");
		verify(users, never()).save(any());
	}

	// Fails if DemoAccessBootstrap#run's max-length check is removed: the contract's
	// DemoSessionRequest.password is maxLength 64, so a longer one could never be sent.
	@Test
	void aPasswordOver64CharactersStopsTheStart() {
		when(users.count()).thenReturn(0L);

		assertThatThrownBy(() -> new DemoAccessBootstrap(users, encoder, clock, USERNAME, "x".repeat(65)).run(null))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("MIBOLT_DEMO_PASSWORD");
		verify(users, never()).save(any());
	}

	@Test
	void aBlankUsernameStopsTheStart() {
		when(users.count()).thenReturn(0L);

		assertThatThrownBy(() -> new DemoAccessBootstrap(users, encoder, clock, " ", PASSWORD).run(null))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("MIBOLT_DEMO_USERNAME");
		verify(users, never()).save(any());
	}

	@Test
	void aUsernameOver80CharactersStopsTheStart() {
		when(users.count()).thenReturn(0L);

		assertThatThrownBy(() -> new DemoAccessBootstrap(users, encoder, clock, "u".repeat(81), PASSWORD).run(null))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("MIBOLT_DEMO_USERNAME");
		verify(users, never()).save(any());
	}

	// Fails if the DataIntegrityViolationException catch around the save is removed.
	@Test
	void aLostInsertRaceIsNotAnError() {
		when(users.count()).thenReturn(0L);
		when(users.save(any(DemoUser.class)))
				.thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));

		new DemoAccessBootstrap(users, encoder, clock, USERNAME, PASSWORD).run(null);

		verify(users).save(any(DemoUser.class));
	}
}
