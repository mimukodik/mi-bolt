package com.example.mi_bolt_backend.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import com.example.mi_bolt_backend.test.IntegrationTest;

@IntegrationTest
class AdminUserRepositoryTest {

	@Autowired
	private AdminUserRepository adminUserRepository;

	private final List<AdminUser> created = new ArrayList<>();

	private AdminUser save(String username, String hash, OffsetDateTime createdAt) {
		AdminUser saved = adminUserRepository.saveAndFlush(new AdminUser(username, hash, createdAt));
		created.add(saved);
		return saved;
	}

	@AfterEach
	void cleanup() {
		adminUserRepository.deleteAll(created);
		created.clear();
	}

	@Test
	void saveGeneratesUuidV4Id() {
		AdminUser saved = save("alpha", "{bcrypt}$2a$10$abcdef", OffsetDateTime.now());

		assertThat(saved.id()).isNotNull();
		assertThat(saved.id().version()).isEqualTo(4);
		assertThat(saved.passwordHash()).isEqualTo("{bcrypt}$2a$10$abcdef");
		saved.setPasswordHash("{bcrypt}$2a$10$updated");
		assertThat(saved.passwordHash()).isEqualTo("{bcrypt}$2a$10$updated");
		assertThat(saved.createdAt()).isNotNull();
		assertThat(saved.username()).isEqualTo("alpha");
	}

	@Test
	void findByUsernameReturnsTheRow() {
		AdminUser saved = save("alpha", "{bcrypt}$2a$10$abcdef", OffsetDateTime.now());

		assertThat(adminUserRepository.findByUsername("alpha")).isPresent()
				.get().extracting(AdminUser::id).isEqualTo(saved.id());
	}

	@Test
	void existsByUsernameReturnsTrueForKnownAndFalseForUnknown() {
		save("alpha", "{bcrypt}$2a$10$abcdef", OffsetDateTime.now());

		assertThat(adminUserRepository.existsByUsername("alpha")).isTrue();
		assertThat(adminUserRepository.existsByUsername("nope")).isFalse();
	}

	@Test
	void findAllByOrderByCreatedAtAscUsernameAscReturnsRowsInOrder() {
		OffsetDateTime now = OffsetDateTime.now();
		AdminUser older = save("charlie", "{bcrypt}$2a$10$aaa", now.minusMinutes(2));
		AdminUser sameTime = save("bravo", "{bcrypt}$2a$10$bbb", now.minusMinutes(2));
		AdminUser newer = save("alpha", "{bcrypt}$2a$10$ccc", now);

		List<AdminUser> ordered = adminUserRepository.findAllByOrderByCreatedAtAscUsernameAsc();

		assertThat(ordered).filteredOn(user -> created.stream().anyMatch(mine -> mine.id().equals(user.id())))
				.extracting(AdminUser::id).containsExactly(sameTime.id(), older.id(), newer.id());
	}

	@Test
	void duplicateUsernameFailsAtFlush() {
		OffsetDateTime now = OffsetDateTime.now();
		save("alpha", "{bcrypt}$2a$10$aaa", now);

		assertThatThrownBy(() -> adminUserRepository.saveAndFlush(
				new AdminUser("alpha", "{bcrypt}$2a$10$bbb", now)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}
}