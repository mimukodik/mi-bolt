package com.example.mi_bolt_backend.admin.user;

import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfLogoutHandler;
import org.springframework.stereotype.Service;

import com.example.mi_bolt_backend.admin.security.AdminPrincipal;
import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Sign-in, sign-out, the session read and the own password change of the admin API
 * (docs/decisions/0015 and 0016). Login stores the authentication by hand: the shared
 * session strategy changes the session id and rotates the CSRF token, and the context
 * is saved into the repository chain 1 reads.
 */
@Service
public class AdminAuthService {

	private static final String SESSION_COOKIE = "mibolt_admin_session"; // server.servlet.session.cookie.name in application.properties.
	private static final String BAD_CREDENTIALS = "Wrong username or password";
	private static final String NOT_SIGNED_IN = "Authentication required";
	private static final String WRONG_PASSWORD = "WRONG_PASSWORD";

	private final AuthenticationManager adminAuthenticationManager;
	private final SessionAuthenticationStrategy adminSessionAuthenticationStrategy;
	private final SecurityContextRepository adminSecurityContextRepository;
	private final CookieCsrfTokenRepository adminCsrfTokenRepository;
	private final AdminUserRepository adminUserRepository;
	private final PasswordEncoder passwordEncoder;
	private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

	public AdminAuthService(AuthenticationManager adminAuthenticationManager,
			SessionAuthenticationStrategy adminSessionAuthenticationStrategy,
			SecurityContextRepository adminSecurityContextRepository,
			CookieCsrfTokenRepository adminCsrfTokenRepository,
			AdminUserRepository adminUserRepository,
			PasswordEncoder passwordEncoder) {
		this.adminAuthenticationManager = adminAuthenticationManager;
		this.adminSessionAuthenticationStrategy = adminSessionAuthenticationStrategy;
		this.adminSecurityContextRepository = adminSecurityContextRepository;
		this.adminCsrfTokenRepository = adminCsrfTokenRepository;
		this.adminUserRepository = adminUserRepository;
		this.passwordEncoder = passwordEncoder;
	}

	/** The signed-in admin; a principal whose row is gone ends its session and is 401. */
	public AdminUser currentAdmin(HttpServletRequest request) {
		Authentication authentication = contextHolder.getContext().getAuthentication();
		if (authentication == null || !(authentication.getPrincipal() instanceof AdminPrincipal principal)) {
			throw new DomainException(ErrorCode.UNAUTHENTICATED, NOT_SIGNED_IN);
		}
		return adminUserRepository.findById(principal.id()).orElseThrow(() -> {
			HttpSession session = request.getSession(false);
			if (session != null) {
				session.invalidate();
			}
			contextHolder.clearContext();
			return new DomainException(ErrorCode.UNAUTHENTICATED, NOT_SIGNED_IN);
		});
	}

	/** An unknown username and a wrong password get the same 401. */
	public AdminUser login(String username, String password, HttpServletRequest request,
			HttpServletResponse response) {
		Authentication authentication;
		try {
			authentication = adminAuthenticationManager.authenticate(
					UsernamePasswordAuthenticationToken.unauthenticated(username, password));
		}
		catch (AuthenticationException ex) {
			throw new DomainException(ErrorCode.UNAUTHENTICATED, BAD_CREDENTIALS, null, null, ex);
		}
		adminSessionAuthenticationStrategy.onAuthentication(authentication, request, response);
		SecurityContext context = contextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		contextHolder.setContext(context);
		adminSecurityContextRepository.saveContext(context, request, response);
		return adminUserRepository.findByUsername(authentication.getName())
				.orElseThrow(() -> new DomainException(ErrorCode.UNAUTHENTICATED, BAD_CREDENTIALS));
	}

	/**
	 * Ends the session whether or not one exists, expires the session cookie and
	 * issues a fresh XSRF token: the CSRF filter already loaded the request's
	 * token, so a new one comes from the repository rather than the attribute.
	 */
	public void logout(HttpServletRequest request, HttpServletResponse response) {
		Authentication authentication = contextHolder.getContext().getAuthentication();
		new SecurityContextLogoutHandler().logout(request, response, authentication);
		new CsrfLogoutHandler(adminCsrfTokenRepository).logout(request, response, authentication);
		ResponseCookie expired = ResponseCookie.from(SESSION_COOKIE, "")
				.maxAge(0)
				.httpOnly(true)
				.secure(true)
				.sameSite("Strict")
				.path(request.getContextPath().isEmpty() ? "/" : request.getContextPath())
				.build();
		response.addHeader(HttpHeaders.SET_COOKIE, expired.toString());
		adminCsrfTokenRepository.loadDeferredToken(request, response).get();
	}

	/** The session stays signed in; the current password is checked before the policy. */
	public void changePassword(String currentPassword, String newPassword, HttpServletRequest request) {
		AdminUser admin = currentAdmin(request);
		if (!passwordEncoder.matches(currentPassword, admin.passwordHash())) {
			throw rejected("/currentPassword", List.of(WRONG_PASSWORD), "The current password is wrong");
		}
		List<String> violations = PasswordPolicy.violations(newPassword);
		if (!violations.isEmpty()) {
			throw rejected("/newPassword", violations, "The new password does not meet the password policy");
		}
		admin.setPasswordHash(passwordEncoder.encode(newPassword));
		adminUserRepository.save(admin);
	}

	private static DomainException rejected(String path, List<String> codes, String detail) {
		List<FieldError> errors = codes.stream().map(code -> new FieldError(path, code)).toList();
		return new DomainException(ErrorCode.VALIDATION_FAILED, detail, null, errors, null);
	}
}
