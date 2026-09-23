package com.example.mi_bolt_backend.admin.user;

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
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.slf4j.LoggerFactory;

class AdminBootstrapTest {

	private static final Pattern GENERATED_WARN = Pattern.compile(
			"^initial admin created: username=admin password=([A-Za-z0-9_-]{24}) \\(shown once; change it after the first sign-in\\)$");

	private final Logger logger = (Logger) LoggerFactory.getLogger(AdminBootstrap.class);

	private final Level previousLevel = logger.getLevel();

	private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

	private AdminUserRepository repository;

	private PasswordEncoder encoder;

	private PasswordGenerator passwordGenerator;

	private Clock clock;

	private List<ILoggingEvent> events;

	@BeforeEach
	void attachAppender() {
		appender.start();
		logger.setLevel(Level.INFO);
		logger.addAppender(appender);
		events = appender.list;
		repository = mock(AdminUserRepository.class);
		encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
		passwordGenerator = new PasswordGenerator();
		clock = Clock.fixed(Instant.parse("2026-09-23T00:00:00Z"), ZoneOffset.UTC);
	}

	@AfterEach
	void detachAppender() {
		logger.detachAppender(appender);
		logger.setLevel(previousLevel);
	}

	@Test
	void emptyTableAndBlankPropertyCreatesAdminWithAGeneratedPasswordLoggedOnce() {
		when(repository.count()).thenReturn(0L);

		new AdminBootstrap(repository, encoder, passwordGenerator, clock, "").run(null);

		ArgumentCaptor<AdminUser> captor = ArgumentCaptor.forClass(AdminUser.class);
		verify(repository).save(captor.capture());
		AdminUser saved = captor.getValue();
		assertThat(saved.username()).isEqualTo("admin");
		assertThat(saved.createdAt()).isEqualTo(OffsetDateTime.parse("2026-09-23T00:00:00Z"));

		List<ILoggingEvent> warns = events.stream()
				.filter(e -> e.getLevel() == Level.WARN)
				.toList();
		assertThat(warns).hasSize(1);
		String message = warns.get(0).getFormattedMessage();
		Matcher matcher = GENERATED_WARN.matcher(message);
		assertThat(matcher.matches()).as("WARN message shape: %s", message).isTrue();
		String loggedPassword = matcher.group(1);
		assertThat(encoder.matches(loggedPassword, saved.passwordHash())).isTrue();
	}

	@Test
	void configuredPasswordIsUsedAndNotLogged() {
		when(repository.count()).thenReturn(0L);
		String configured = "integration-admin-password";

		new AdminBootstrap(repository, encoder, passwordGenerator, clock, configured).run(null);

		ArgumentCaptor<AdminUser> captor = ArgumentCaptor.forClass(AdminUser.class);
		verify(repository).save(captor.capture());
		AdminUser saved = captor.getValue();
		assertThat(encoder.matches(configured, saved.passwordHash())).isTrue();

		List<ILoggingEvent> warns = events.stream()
				.filter(e -> e.getLevel() == Level.WARN)
				.toList();
		assertThat(warns).hasSize(1);
		assertThat(warns.get(0).getFormattedMessage())
				.isEqualTo("initial admin created: username=admin password=<from MIBOLT_ADMIN_INITIAL_PASSWORD>");
		assertThat(events).noneMatch(e -> e.getFormattedMessage().contains(configured));
	}

	@Test
	void configuredPasswordOutsideThePolicyStopsTheStart() {
		when(repository.count()).thenReturn(0L);

		assertThatThrownBy(() -> new AdminBootstrap(repository, encoder, passwordGenerator, clock, "too-short").run(null))
				.isInstanceOf(IllegalStateException.class)
				.hasMessage("MIBOLT_ADMIN_INITIAL_PASSWORD violates the admin password policy: [SIZE]");
		verify(repository, never()).save(any());
		assertThat(events).noneMatch(e -> e.getLevel() == Level.WARN);
	}

	@Test
	void blankButWhitespacePropertyCountsAsUnset() {
		when(repository.count()).thenReturn(0L);

		new AdminBootstrap(repository, encoder, passwordGenerator, clock, "   ").run(null);

		List<ILoggingEvent> warns = events.stream()
				.filter(e -> e.getLevel() == Level.WARN)
				.toList();
		assertThat(warns).hasSize(1);
		assertThat(GENERATED_WARN.matcher(warns.get(0).getFormattedMessage()).matches())
				.as("WARN message shape: %s", warns.get(0).getFormattedMessage())
				.isTrue();
		ArgumentCaptor<AdminUser> captor = ArgumentCaptor.forClass(AdminUser.class);
		verify(repository).save(captor.capture());
		assertThat(captor.getValue().username()).isEqualTo("admin");
	}

	@Test
	void presentAdminsSkipTheBootstrap() {
		when(repository.count()).thenReturn(1L);

		new AdminBootstrap(repository, encoder, passwordGenerator, clock, "").run(null);

		verify(repository, never()).save(any());
		List<ILoggingEvent> infos = events.stream()
				.filter(e -> e.getLevel() == Level.INFO)
				.toList();
		assertThat(infos).hasSize(1);
		assertThat(infos.get(0).getFormattedMessage()).isEqualTo("admin users present, 1, bootstrap skipped");
		assertThat(events).noneMatch(e -> e.getLevel() == Level.WARN);
	}

	// Fails if the DataIntegrityViolationException catch around the save is removed.
	@Test
	void losingTheInsertRaceSkipsTheBootstrapQuietly() {
		when(repository.count()).thenReturn(0L);
		when(repository.save(any(AdminUser.class)))
				.thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));

		new AdminBootstrap(repository, encoder, passwordGenerator, clock, "").run(null);

		assertThat(events).extracting(ILoggingEvent::getLevel).doesNotContain(Level.WARN);
		assertThat(events).extracting(ILoggingEvent::getFormattedMessage)
				.containsExactly("initial admin already created by another instance, bootstrap skipped");
	}
}
