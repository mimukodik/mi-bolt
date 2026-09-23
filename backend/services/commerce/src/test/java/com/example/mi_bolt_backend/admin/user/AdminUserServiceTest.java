package com.example.mi_bolt_backend.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

class AdminUserServiceTest {

	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-09-23T00:00:00Z");
	private static final UUID CALLER = UUID.fromString("00000000-0000-4000-8000-000000000001");
	private static final UUID OTHER = UUID.fromString("00000000-0000-4000-8000-000000000002");

	private final AdminUserRepository repository = mock(AdminUserRepository.class);
	private final PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
	private final PasswordGenerator generator = mock(PasswordGenerator.class);
	private final AdminUserService service = new AdminUserService(repository, encoder, generator,
			Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));

	@Test
	// Fails if list does not delegate to findAllByOrderByCreatedAtAscUsernameAsc
	void listReturnsTheRepositoryOrder() {
		AdminUser first = new AdminUser("admin", "{bcrypt}x", NOW);
		AdminUser second = new AdminUser("bea", "{bcrypt}y", NOW.plusMinutes(1));
		when(repository.findAllByOrderByCreatedAtAscUsernameAsc()).thenReturn(List.of(first, second));

		assertThat(service.list()).containsExactly(first, second);
	}

	@Test
	// Fails if create does not hash the generated password before saving
	void createStoresOnlyTheHashAndReturnsThePasswordOnce() {
		when(repository.existsByUsername("bea")).thenReturn(false);
		when(generator.generate()).thenReturn("generated-password-24chr");
		when(repository.saveAndFlush(any(AdminUser.class))).thenAnswer(invocation -> invocation.getArgument(0));

		AdminUserService.CreatedAdmin result = service.create("bea");

		ArgumentCaptor<AdminUser> captor = ArgumentCaptor.forClass(AdminUser.class);
		verify(repository).saveAndFlush(captor.capture());
		AdminUser saved = captor.getValue();
		assertThat(saved.username()).isEqualTo("bea");
		assertThat(saved.createdAt()).isEqualTo(NOW);
		assertThat(saved.passwordHash()).startsWith("{bcrypt}");
		assertThat(saved.passwordHash()).doesNotContain("generated-password-24chr");
		assertThat(encoder.matches("generated-password-24chr", saved.passwordHash())).isTrue();
		assertThat(result.admin()).isSameAs(saved);
		assertThat(result.password()).isEqualTo("generated-password-24chr");
	}

	@Test
	// Fails if create proceeds to generate or save when the username is taken
	void createWithATakenUsernameIs409AndSavesNothing() {
		when(repository.existsByUsername("admin")).thenReturn(true);

		assertThatThrownBy(() -> service.create("admin"))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.USERNAME_TAKEN);
					assertThat(e.detail()).isEqualTo("Username already taken");
				});

		verify(repository, never()).saveAndFlush(any());
		verify(generator, never()).generate();
	}

	@Test
	// Fails if delete does not reject the caller before any repository call
	void deletingYourselfIs409BeforeAnyLookup() {
		assertThatThrownBy(() -> service.delete(CALLER, CALLER))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.ADMIN_SELF_DELETE);
					assertThat(e.detail()).isEqualTo("The signed-in admin cannot be deleted");
				});

		verifyNoInteractions(repository);
	}

	@Test
	// Fails if delete resolves the lockAll before throwing NOT_FOUND for an unknown id
	void deletingAnUnknownAdminIs404WithTheId() {
		when(repository.findById(OTHER)).thenReturn(Optional.empty());
		when(repository.lockAll()).thenReturn(List.of(new AdminUser("admin", "{bcrypt}x", NOW)));

		assertThatThrownBy(() -> service.delete(OTHER, CALLER))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.NOT_FOUND);
					assertThat(e.detail()).isEqualTo("Resource not found");
					assertThat(e.params()).isEqualTo(Map.of("adminId", OTHER));
				});

		verify(repository, never()).delete(any());
		verify(repository, never()).lockAll();
	}

	@Test
	// Fails if delete does not check that another admin remains
	void deletingTheLastRemainingAdminIs409() {
		when(repository.findById(OTHER)).thenReturn(Optional.of(new AdminUser("bea", "{bcrypt}x", NOW)));
		when(repository.lockAll()).thenReturn(List.of(new AdminUser("admin", "{bcrypt}x", NOW)));

		assertThatThrownBy(() -> service.delete(OTHER, CALLER))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.LAST_ADMIN);
					assertThat(e.detail()).isEqualTo("The last admin cannot be deleted");
				});

		verify(repository, never()).delete(any());
	}

	@Test
	// Fails if delete does not remove the admin entity on the happy path
	void deletingAnotherAdminRemovesIt() {
		AdminUser bea = new AdminUser("bea", "{bcrypt}x", NOW);
		when(repository.findById(OTHER)).thenReturn(Optional.of(bea));
		when(repository.lockAll()).thenReturn(List.of(bea, new AdminUser("admin", "{bcrypt}x", NOW)));

		service.delete(OTHER, CALLER);

		verify(repository).delete(bea);
		verify(repository, never()).count();
	}

	@Test
	// Fails if the DataIntegrityViolationException catch in create is removed.
	void createLosingTheUniqueConstraintIs409() {
		when(repository.existsByUsername("bea")).thenReturn(false);
		when(generator.generate()).thenReturn("generated-password-24chr");
		when(repository.saveAndFlush(any(AdminUser.class)))
				.thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));

		assertThatThrownBy(() -> service.create("bea"))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.USERNAME_TAKEN);
					assertThat(e.detail()).isEqualTo("Username already taken");
					assertThat(e.getCause()).isInstanceOf(DataIntegrityViolationException.class);
				});
	}
}
