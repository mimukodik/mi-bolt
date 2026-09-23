package com.example.mi_bolt_backend.admin.user;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.AdminUsersApi;
import com.example.mi_bolt_backend.api.model.AdminUser;
import com.example.mi_bolt_backend.api.model.AdminUserCreateRequest;
import com.example.mi_bolt_backend.api.model.AdminUserCreated;

import jakarta.servlet.http.HttpServletRequest;

/** The AdminUsers operations; delegation only. The caller of a delete is the signed-in admin. */
@RestController
public class AdminUsersController implements AdminUsersApi {

	private final AdminUserService adminUserService;
	private final AdminAuthService adminAuthService;
	private final HttpServletRequest request;

	public AdminUsersController(AdminUserService adminUserService, AdminAuthService adminAuthService,
			HttpServletRequest request) {
		this.adminUserService = adminUserService;
		this.adminAuthService = adminAuthService;
		this.request = request;
	}

	@Override
	public ResponseEntity<List<AdminUser>> listAdminUsers() {
		return ResponseEntity.ok(adminUserService.list().stream()
				.map(admin -> new AdminUser(admin.id(), admin.username(), admin.createdAt()))
				.toList());
	}

	@Override
	public ResponseEntity<AdminUserCreated> createAdminUser(AdminUserCreateRequest adminUserCreateRequest) {
		var created = adminUserService.create(adminUserCreateRequest.getUsername());
		var admin = created.admin();
		return ResponseEntity.status(HttpStatus.CREATED).body(new AdminUserCreated(
				new AdminUser(admin.id(), admin.username(), admin.createdAt()), created.password()));
	}

	@Override
	public ResponseEntity<Void> deleteAdminUser(UUID adminId) {
		adminUserService.delete(adminId, adminAuthService.currentAdmin(request).id());
		return ResponseEntity.noContent().build();
	}
}
