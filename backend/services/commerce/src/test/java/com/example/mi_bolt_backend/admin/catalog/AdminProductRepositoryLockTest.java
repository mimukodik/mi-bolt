package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.example.mi_bolt_backend.test.IntegrationTest;

@IntegrationTest
class AdminProductRepositoryLockTest {

	@Autowired
	private AdminProductRepository adminProductRepository;

	@Test
	// Fails if changeset 0009 did not create and seed the guard row, or the native query is not accepted.
	@Transactional
	void lockFeaturedLimitReturnsTheGuardRow() {
		assertThat(adminProductRepository.lockFeaturedLimit()).isEqualTo(1);
	}
}
