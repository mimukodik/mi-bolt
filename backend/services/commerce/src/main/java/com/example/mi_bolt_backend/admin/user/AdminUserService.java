package com.example.mi_bolt_backend.admin.user;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * The admin users operations: list, create with a generated password, and
 * delete, which never removes the caller or the last admin.
 */
@Service
@Transactional
public class AdminUserService {

	private final AdminUserRepository adminUserRepository;
	private final PasswordEncoder passwordEncoder;
	private final PasswordGenerator passwordGenerator;
	private final Clock clock;

	public AdminUserService(AdminUserRepository adminUserRepository, PasswordEncoder passwordEncoder,
			PasswordGenerator passwordGenerator, Clock clock) {
		this.adminUserRepository = adminUserRepository;
		this.passwordEncoder = passwordEncoder;
		this.passwordGenerator = passwordGenerator;
		this.clock = clock;
	}

	/** Every admin, oldest first, then by username. */
	@Transactional(readOnly = true)
	public List<AdminUser> list() {
		return adminUserRepository.findAllByOrderByCreatedAtAscUsernameAsc();
	}

	/**
	 * Stores only the hash; the generated password is returned here once and never again.
	 * A concurrent create of the same username loses at the unique constraint and gets the same 409.
	 */
	public CreatedAdmin create(String username) {
		if (adminUserRepository.existsByUsername(username)) {
			throw new DomainException(ErrorCode.USERNAME_TAKEN);
		}
		String password = passwordGenerator.generate();
		AdminUser admin;
		try {
			admin = adminUserRepository.saveAndFlush(
					new AdminUser(username, passwordEncoder.encode(password), OffsetDateTime.now(clock)));
		}
		catch (DataIntegrityViolationException ex) {
			throw new DomainException(ErrorCode.USERNAME_TAKEN, ErrorCode.USERNAME_TAKEN.defaultTitle(), null, null,
					ex);
		}
		return new CreatedAdmin(admin, password);
	}

	/** Checks the caller first, then that the admin exists, then, holding a lock on every admin row, that another admin remains. */
	public void delete(UUID adminId, UUID callerId) {
		if (adminId.equals(callerId)) {
			throw new DomainException(ErrorCode.ADMIN_SELF_DELETE);
		}
		AdminUser admin = adminUserRepository.findById(adminId)
				.orElseThrow(() -> new DomainException(ErrorCode.NOT_FOUND, ErrorCode.NOT_FOUND.defaultTitle(),
						Map.of("adminId", adminId)));
		if (adminUserRepository.lockAll().size() <= 1) {
			throw new DomainException(ErrorCode.LAST_ADMIN);
		}
		adminUserRepository.delete(admin);
	}

	/** A new admin and its one-time generated password. */
	public record CreatedAdmin(AdminUser admin, String password) {
	}
}
