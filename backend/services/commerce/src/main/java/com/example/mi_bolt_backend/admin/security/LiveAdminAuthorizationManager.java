package com.example.mi_bolt_backend.admin.security;

import java.util.function.Supplier;

import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;

import com.example.mi_bolt_backend.admin.user.AdminUserRepository;

/**
 * Re-reads the {@code admin_user} primary key on every admin request. A row
 * that has been deleted between login and the current request gets the session
 * invalidated by {@link ProblemAccessDeniedHandler} (plan §1.4): one
 * primary-key lookup per admin request.
 */
@Component
public class LiveAdminAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

	private final AdminUserRepository adminUserRepository;

	public LiveAdminAuthorizationManager(AdminUserRepository adminUserRepository) {
		this.adminUserRepository = adminUserRepository;
	}

	@Override
	public AuthorizationDecision authorize(Supplier<? extends Authentication> authentication,
			RequestAuthorizationContext context) {
		Authentication auth = authentication.get();
		if (auth == null || !auth.isAuthenticated()) {
			return new AuthorizationDecision(false);
		}
		Object principal = auth.getPrincipal();
		if (!(principal instanceof AdminPrincipal admin)) {
			return new AuthorizationDecision(false);
		}
		return new AuthorizationDecision(adminUserRepository.existsById(admin.id()));
	}
}