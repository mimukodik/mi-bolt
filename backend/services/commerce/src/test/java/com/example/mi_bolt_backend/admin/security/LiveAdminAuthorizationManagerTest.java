package com.example.mi_bolt_backend.admin.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import com.example.mi_bolt_backend.admin.user.AdminUserRepository;

class LiveAdminAuthorizationManagerTest {

	private final AdminUserRepository repository = mock(AdminUserRepository.class);

	private final LiveAdminAuthorizationManager manager = new LiveAdminAuthorizationManager(repository);

	@Test
	void anonymousIsDenied() {
		SecurityContext ctx = SecurityContextHolder.createEmptyContext();
		ctx.setAuthentication(anonymous());
		SecurityContextHolder.setContext(ctx);

		AuthorizationDecision decision = manager.authorize(
				() -> SecurityContextHolder.getContext().getAuthentication(),
				requestContext());

		assertThat(decision).isNotNull();
		assertThat(decision.isGranted()).isFalse();
	}

	@Test
	void principalWithMissingRowIsDenied() {
		UUID id = UUID.randomUUID();
		when(repository.existsById(id)).thenReturn(false);

		Authentication authentication = new UsernamePasswordAuthenticationToken(
				new AdminPrincipal(id, "admin", "{bcrypt}$2a$10$abc"), null,
				List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));

		AuthorizationDecision decision = manager.authorize(() -> authentication, requestContext());

		assertThat(decision.isGranted()).isFalse();
	}

	@Test
	void principalWithLiveRowIsGranted() {
		UUID id = UUID.randomUUID();
		when(repository.existsById(id)).thenReturn(true);

		Authentication authentication = new UsernamePasswordAuthenticationToken(
				new AdminPrincipal(id, "admin", "{bcrypt}$2a$10$abc"), null,
				List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));

		AuthorizationDecision decision = manager.authorize(() -> authentication, requestContext());

		assertThat(decision.isGranted()).isTrue();
	}

	private static Authentication anonymous() {
		return new AnonymousAuthenticationToken("key", "anonymousUser",
				List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
	}

	private static RequestAuthorizationContext requestContext() {
		MockHttpServletRequest request = new MockHttpServletRequest(new MockServletContext(), "POST", "/admin/users");
		return new RequestAuthorizationContext(request);
	}
}