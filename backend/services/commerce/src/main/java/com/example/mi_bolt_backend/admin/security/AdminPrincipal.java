package com.example.mi_bolt_backend.admin.security;

import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * Spring Security principal for a signed-in admin. Carries the admin's id so
 * the live re-check ({@link LiveAdminAuthorizationManager}) can hit the
 * primary key without reading the rest of the row. The bcrypt hash is held
 * here for the lifetime of the authentication; {@link #eraseCredentials()}
 * clears it after the session is established so a serialised session does
 * not carry it (Spring Security's session-fixation strategy invokes it).
 */
public class AdminPrincipal implements UserDetails, CredentialsContainer, Serializable {

	private static final long serialVersionUID = 1L;

	private final UUID id;
	private final String username;
	private String passwordHash;

	public AdminPrincipal(UUID id, String username, String passwordHash) {
		this.id = id;
		this.username = username;
		this.passwordHash = passwordHash;
	}

	public UUID id() {
		return id;
	}

	@Override
	public String getUsername() {
		return username;
	}

	@Override
	public String getPassword() {
		return passwordHash;
	}

	@Override
	public Collection<? extends GrantedAuthority> getAuthorities() {
		return List.of(new SimpleGrantedAuthority("ROLE_ADMIN"));
	}

	@Override
	public boolean isAccountNonExpired() {
		return true;
	}

	@Override
	public boolean isAccountNonLocked() {
		return true;
	}

	@Override
	public boolean isCredentialsNonExpired() {
		return true;
	}

	@Override
	public boolean isEnabled() {
		return true;
	}

	@Override
	public void eraseCredentials() {
		this.passwordHash = null;
	}
}