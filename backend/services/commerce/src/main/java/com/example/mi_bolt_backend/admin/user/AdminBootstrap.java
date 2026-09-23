package com.example.mi_bolt_backend.admin.user;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the first admin when {@code admin_user} is empty at startup
 * (docs/decisions/0016). The password is {@code mibolt.admin.initial-password}
 * when set, otherwise a generated one; either way it is logged once at WARN,
 * the generated value itself, a configured value only by name. A configured
 * value outside {@link PasswordPolicy} stops the start. A start that loses
 * the race to another instance's insert skips the bootstrap as if it
 * had found an admin. Runs after the catalogue loader ({@code @Order(0)}).
 */
@Component
@Order(1)
public class AdminBootstrap implements ApplicationRunner {

	static final String USERNAME = "admin";

	private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

	private final AdminUserRepository adminUserRepository;

	private final PasswordEncoder passwordEncoder;

	private final PasswordGenerator passwordGenerator;

	private final Clock clock;

	private final String initialPassword;

	public AdminBootstrap(AdminUserRepository adminUserRepository, PasswordEncoder passwordEncoder,
			PasswordGenerator passwordGenerator, Clock clock,
			@Value("${mibolt.admin.initial-password:}") String initialPassword) {
		this.adminUserRepository = adminUserRepository;
		this.passwordEncoder = passwordEncoder;
		this.passwordGenerator = passwordGenerator;
		this.clock = clock;
		this.initialPassword = initialPassword;
	}

	@Override
	public void run(ApplicationArguments args) {
		long count = adminUserRepository.count();
		if (count > 0) {
			if (log.isInfoEnabled()) {
				log.info("admin users present, {}, bootstrap skipped", count);
			}
			return;
		}
		boolean configured = !initialPassword.isBlank();
		String password = configured ? initialPassword : passwordGenerator.generate();
		List<String> violations = PasswordPolicy.violations(password);
		if (!violations.isEmpty()) {
			throw new IllegalStateException(
					"MIBOLT_ADMIN_INITIAL_PASSWORD violates the admin password policy: " + violations);
		}
		try {
			adminUserRepository.save(new AdminUser(USERNAME, passwordEncoder.encode(password), OffsetDateTime.now(clock)));
		}
		catch (DataIntegrityViolationException ex) {
			if (log.isInfoEnabled()) {
				log.info("initial admin already created by another instance, bootstrap skipped");
			}
			return;
		}
		if (log.isWarnEnabled()) {
			if (configured) {
				log.warn("initial admin created: username={} password=<from MIBOLT_ADMIN_INITIAL_PASSWORD>", USERNAME);
			}
			else {
				log.warn("initial admin created: username={} password={} (shown once; change it after the first sign-in)",
						USERNAME, password);
			}
		}
	}
}
