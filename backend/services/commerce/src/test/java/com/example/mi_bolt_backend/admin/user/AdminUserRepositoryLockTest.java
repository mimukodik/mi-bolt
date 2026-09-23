package com.example.mi_bolt_backend.admin.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.test.IntegrationTest;

@IntegrationTest
class AdminUserRepositoryLockTest {

	@Autowired
	private AdminUserRepository adminUserRepository;

	@Test
	// Fails if lockAll's JPQL or lock mode is not accepted by the database.
	@Transactional
	void lockAllReturnsEveryAdminInsideATransaction() {
		assertThat(adminUserRepository.lockAll()).extracting(AdminUser::username).contains("admin");
	}
}
