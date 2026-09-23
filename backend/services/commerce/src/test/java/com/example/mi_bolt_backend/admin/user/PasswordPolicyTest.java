package com.example.mi_bolt_backend.admin.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordPolicyTest {

	@Test
	void fifteenCharactersPass() {
		assertThat(PasswordPolicy.violations("a".repeat(15))).isEmpty();
	}

	@Test
	void fourteenCharactersAreSize() {
		assertThat(PasswordPolicy.violations("a".repeat(14))).containsExactly(PasswordPolicy.SIZE);
	}

	@Test
	void sixtyFourCharactersPass() {
		assertThat(PasswordPolicy.violations("a".repeat(64))).isEmpty();
	}

	@Test
	void sixtyFiveCharactersAreSize() {
		assertThat(PasswordPolicy.violations("a".repeat(65))).containsExactly(PasswordPolicy.SIZE);
	}

	@Test
	void thirtySixTwoByteCharactersPassAtSeventyTwoBytes() {
		assertThat(PasswordPolicy.violations("é".repeat(36))).isEmpty();
	}

	@Test
	void fortyTwoByteCharactersAreTooLong() {
		assertThat(PasswordPolicy.violations("é".repeat(40))).containsExactly(PasswordPolicy.PASSWORD_TOO_LONG);
	}

	@Test
	void seventyThreeBytesAreTooLong() {
		assertThat(PasswordPolicy.violations("é".repeat(36) + "a")).containsExactly(PasswordPolicy.PASSWORD_TOO_LONG);
	}

	@Test
	void sixtyFiveTwoByteCharactersAreBoth() {
		assertThat(PasswordPolicy.violations("é".repeat(65))).containsExactly(PasswordPolicy.SIZE, PasswordPolicy.PASSWORD_TOO_LONG);
	}
}
