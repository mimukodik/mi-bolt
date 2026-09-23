package com.example.mi_bolt_backend.admin.user;

import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.AdminAuthApi;
import com.example.mi_bolt_backend.api.model.AdminLoginRequest;
import com.example.mi_bolt_backend.api.model.AdminPasswordChangeRequest;
import com.example.mi_bolt_backend.api.model.AdminUser;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** The AdminAuth operations; delegation only, plus the read that issues the XSRF cookie. */
@RestController
public class AdminAuthController implements AdminAuthApi {

	private final AdminAuthService adminAuthService;
	private final HttpServletRequest request;
	private final HttpServletResponse response;

	public AdminAuthController(AdminAuthService adminAuthService, HttpServletRequest request,
			HttpServletResponse response) {
		this.adminAuthService = adminAuthService;
		this.request = request;
		this.response = response;
	}

	@Override
	public ResponseEntity<AdminUser> getAdminSession() {
		issueXsrfToken();
		var admin = adminAuthService.currentAdmin(request);
		return ResponseEntity.ok(new AdminUser(admin.id(), admin.username(), admin.createdAt()));
	}

	@Override
	public ResponseEntity<AdminUser> loginAdmin(AdminLoginRequest adminLoginRequest) {
		var admin = adminAuthService.login(adminLoginRequest.getUsername(),
				adminLoginRequest.getPassword(), request, response);
		issueXsrfToken();
		return ResponseEntity.ok(new AdminUser(admin.id(), admin.username(), admin.createdAt()));
	}

	@Override
	public ResponseEntity<Void> logoutAdmin() {
		adminAuthService.logout(request, response);
		return ResponseEntity.noContent().build();
	}

	@Override
	public ResponseEntity<Void> changeAdminPassword(AdminPasswordChangeRequest adminPasswordChangeRequest) {
		adminAuthService.changePassword(adminPasswordChangeRequest.getCurrentPassword(),
				adminPasswordChangeRequest.getNewPassword(), request);
		return ResponseEntity.noContent().build();
	}

	/** Reading the deferred token makes the repository write the XSRF-TOKEN cookie on this response. */
	private void issueXsrfToken() {
		if (request.getAttribute(CsrfToken.class.getName()) instanceof CsrfToken token) {
			token.getToken();
		}
	}
}
