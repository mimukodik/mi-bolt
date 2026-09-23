package com.example.mi_bolt_backend.admin.user;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.example.mi_bolt_backend.test.IntegrationTest;

@IntegrationTest
class AdminBootstrapIntegrationTest {

	private static final String BOOTSTRAPPED_PASSWORD = "integration-admin-password";

	@Autowired
	private AdminUserRepository adminUserRepository;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@Test
	void bootstrappedAdminSignsInWithTheTestPassword() {
		Optional<AdminUser> bootstrapped = adminUserRepository.findByUsername("admin");

		assertThat(bootstrapped).isPresent();
		AdminUser admin = bootstrapped.get();
		assertThat(admin.id()).isNotNull();
		assertThat(admin.id().version()).isEqualTo(4);
		assertThat(passwordEncoder.matches(BOOTSTRAPPED_PASSWORD, admin.passwordHash())).isTrue();
	}
}
