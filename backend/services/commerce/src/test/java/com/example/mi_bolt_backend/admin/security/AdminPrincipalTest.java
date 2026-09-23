package com.example.mi_bolt_backend.admin.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class AdminPrincipalTest {

	@Test
	void accountFlagsAreAllTrueAndCredentialsAreErasedOnDemand() {
		UUID id = UUID.randomUUID();
		AdminPrincipal principal = new AdminPrincipal(id, "admin", "{bcrypt}$2a$10$abc");

		assertThat(principal.id()).isEqualTo(id);
		assertThat(principal.getUsername()).isEqualTo("admin");
		assertThat(principal.getPassword()).isEqualTo("{bcrypt}$2a$10$abc");
		assertThat(principal.isAccountNonExpired()).isTrue();
		assertThat(principal.isAccountNonLocked()).isTrue();
		assertThat(principal.isCredentialsNonExpired()).isTrue();
		assertThat(principal.isEnabled()).isTrue();
		assertThat(principal.getAuthorities()).hasSize(1);
		assertThat(principal.getAuthorities().iterator().next().getAuthority()).isEqualTo("ROLE_ADMIN");

		principal.eraseCredentials();
		assertThat(principal.getPassword()).isNull();
	}
}