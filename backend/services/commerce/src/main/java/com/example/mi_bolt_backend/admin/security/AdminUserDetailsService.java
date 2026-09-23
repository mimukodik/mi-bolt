package com.example.mi_bolt_backend.admin.security;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.example.mi_bolt_backend.admin.user.AdminUserRepository;

/**
 * Loads an admin by username and hands Spring Security an
 * {@link AdminPrincipal}. A missing row raises {@link UsernameNotFoundException}
 * — {@code DaoAuthenticationProvider} hides that distinction from the wire by
 * default, so a wrong password and an unknown username produce the same body.
 */
@Service
public class AdminUserDetailsService implements UserDetailsService {

	private final AdminUserRepository adminUserRepository;

	public AdminUserDetailsService(AdminUserRepository adminUserRepository) {
		this.adminUserRepository = adminUserRepository;
	}

	@Override
	public UserDetails loadUserByUsername(String username) {
		return adminUserRepository.findByUsername(username)
				.map(admin -> new AdminPrincipal(admin.id(), admin.username(), admin.passwordHash()))
				.orElseThrow(() -> new UsernameNotFoundException("No admin account: " + username));
	}
}