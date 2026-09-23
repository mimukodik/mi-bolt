package com.example.mi_bolt_backend.admin.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

/**
 * Reads and writes the {@code admin_user} table
 * (decisions/0015-admin-security-filter-chains.md).
 */
public interface AdminUserRepository extends JpaRepository<AdminUser, UUID> {

	Optional<AdminUser> findByUsername(String username);

	boolean existsByUsername(String username);

	List<AdminUser> findAllByOrderByCreatedAtAscUsernameAsc();

	/** Locks every admin row until the transaction ends, so two deletes cannot both see a second admin. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from AdminUser a")
	List<AdminUser> lockAll();
}
