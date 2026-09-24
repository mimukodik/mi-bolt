package com.example.mi_bolt_backend.demo;

import java.time.Clock;
import java.time.OffsetDateTime;

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
 * Creates the one demo user when {@code demo_user} is empty at startup (MIM-423), from
 * {@code mibolt.demo.username} / {@code mibolt.demo.password} and hashed with the shared
 * {@code PasswordEncoder}. There is no admin password policy here: the demo password is
 * public, so only its emptiness and its length are checked, against the contract's
 * {@code DemoSessionRequest.password} bounds (1 to 64 characters) so a value that could
 * never be typed in cannot be configured. The password is never logged. A start that
 * loses the race to another instance's insert skips the bootstrap as if it had found the
 * user. Runs after the catalogue loader ({@code @Order(0)}) and the admin bootstrap
 * ({@code @Order(1)}).
 */
@Component
@Order(2)
public class DemoAccessBootstrap implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DemoAccessBootstrap.class);

	private final DemoUserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final Clock clock;

	private final String username;

	private final String password;

	public DemoAccessBootstrap(DemoUserRepository users, PasswordEncoder passwordEncoder, Clock clock,
			@Value("${mibolt.demo.username}") String username,
			@Value("${mibolt.demo.password}") String password) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
		this.username = username;
		this.password = password;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (users.count() > 0) {
			if (log.isInfoEnabled()) {
				log.info("demo user present, bootstrap skipped");
			}
			return;
		}
		if (username.isBlank() || username.length() > 80) {
			throw new IllegalStateException("MIBOLT_DEMO_USERNAME must be 1 to 80 characters");
		}
		if (password.isBlank() || password.length() > 64) {
			throw new IllegalStateException("MIBOLT_DEMO_PASSWORD must be 1 to 64 characters");
		}
		try {
			users.save(new DemoUser(username, passwordEncoder.encode(password), OffsetDateTime.now(clock)));
		}
		catch (DataIntegrityViolationException ex) {
			if (log.isInfoEnabled()) {
				log.info("demo user already created by another instance, bootstrap skipped");
			}
			return;
		}
		if (log.isInfoEnabled()) {
			log.info("demo user created: username={}", username);
		}
	}
}
