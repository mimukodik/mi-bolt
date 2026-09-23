package com.example.mi_bolt_backend.admin.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import com.example.mi_bolt_backend.admin.user.AdminUser;
import com.example.mi_bolt_backend.admin.user.AdminUserRepository;

class AdminUserDetailsServiceTest {

	@Test
	void foundReturnsAdminPrincipalWithRoleAdminIdAndHash() {
		UUID id = UUID.randomUUID();
		AdminUser row = mock(AdminUser.class);
		when(row.id()).thenReturn(id);
		when(row.username()).thenReturn("admin");
		when(row.passwordHash()).thenReturn("{bcrypt}$2a$10$abcdef");
		AdminUserRepository repository = mock(AdminUserRepository.class);
		when(repository.findByUsername("admin")).thenReturn(Optional.of(row));

		AdminUserDetailsService service = new AdminUserDetailsService(repository);

		AdminPrincipal principal = (AdminPrincipal) service.loadUserByUsername("admin");
		assertThat(principal.id()).isEqualTo(id);
		assertThat(principal.getUsername()).isEqualTo("admin");
		assertThat(principal.getPassword()).isEqualTo("{bcrypt}$2a$10$abcdef");
		assertThat(principal.getAuthorities())
				.extracting(GrantedAuthority::getAuthority)
				.containsExactly("ROLE_ADMIN");
	}

	@Test
	void missingThrowsUsernameNotFoundException() {
		AdminUserRepository repository = mock(AdminUserRepository.class);
		when(repository.findByUsername("nobody")).thenReturn(Optional.empty());

		AdminUserDetailsService service = new AdminUserDetailsService(repository);

		assertThatThrownBy(() -> service.loadUserByUsername("nobody"))
				.isInstanceOf(UsernameNotFoundException.class);
	}
}
