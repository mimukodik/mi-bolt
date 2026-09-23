package com.example.mi_bolt_backend.admin.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordGeneratorTest {

	private final PasswordGenerator generator = new PasswordGenerator();

	@Test
	void generatesTwentyFourUrlSafeCharacters() {
		assertThat(generator.generate()).matches("[A-Za-z0-9_-]{24}");
	}

	@Test
	void generatedPasswordMeetsThePolicy() {
		assertThat(PasswordPolicy.violations(generator.generate())).isEmpty();
	}

	@Test
	void twoPasswordsDiffer() {
		assertThat(generator.generate()).isNotEqualTo(generator.generate());
	}
}
