package com.example.mi_bolt_backend.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

import java.time.Clock;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.example.mi_bolt_backend.test.IntegrationTest;

/** The first-admin race against the real database: a duplicate insert after a zero count is skipped. */
@IntegrationTest
class AdminBootstrapRaceTest {

	@Autowired
	private AdminUserRepository adminUserRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@Autowired
	private PasswordGenerator passwordGenerator;

	@Autowired
	private Clock clock;

	// Fails if the DataIntegrityViolationException catch in AdminBootstrap#run is removed, or if the
	// real duplicate insert surfaces as another exception type than the one it catches.
	@Test
	void aRealDuplicateFirstAdminInsertIsSkipped() {
		assertThat(adminUserRepository.findAll()).extracting(AdminUser::username).contains("admin");
		AdminUserRepository zeroCount = mock(AdminUserRepository.class, delegatesTo(adminUserRepository));
		doReturn(0L).when(zeroCount).count();
		AdminBootstrap bootstrap = new AdminBootstrap(zeroCount, passwordEncoder, passwordGenerator, clock, "");

		assertThatCode(() -> bootstrap.run(null)).doesNotThrowAnyException();

		assertThat(adminUserRepository.findAll()).extracting(AdminUser::username)
				.filteredOn("admin"::equals).hasSize(1);
	}
}
