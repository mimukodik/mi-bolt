package com.example.mi_bolt_backend.problem;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.example.mi_bolt_backend.api.model.ProblemCode;

/**
 * Pins {@link ErrorCode} and the contract's {@link ProblemCode} enum to the
 * same value set, asserts the HTTP status for each new code added in contract
 * 2.1.0, and pins {@link ErrorCode#values()} length to 26.
 *
 * <p>Removing any one new {@code ErrorCode} constant fails the name-set
 * case; changing any new code's HTTP status fails its parameterised row.
 */
class ErrorCodeTest {

	@Test
	void everyErrorCodeNameExistsInTheGeneratedProblemCodeEnum() {
		Set<ProblemCode> generated = EnumSet.allOf(ProblemCode.class);
		for (ErrorCode code : ErrorCode.values()) {
			assertThat(generated)
					.as("ErrorCode.%s must exist in the generated ProblemCode enum", code.name())
					.contains(ProblemCode.valueOf(code.name()));
		}
	}

	@Test
	void everyGeneratedProblemCodeNameExistsInErrorCode() {
		Set<String> local = Arrays.stream(ErrorCode.values())
				.map(Enum::name)
				.collect(Collectors.toSet());
		for (ProblemCode generated : ProblemCode.values()) {
			assertThat(local)
					.as("Generated ProblemCode.%s must exist in ErrorCode", generated.name())
					.contains(generated.name());
		}
	}

	@Test
	void errorCodeValuesLengthIs26() {
		assertThat(ErrorCode.values()).hasSize(26);
	}

	static Stream<Arguments> newCodeStatus() {
		return Stream.of(
				Arguments.of(ErrorCode.UNAUTHENTICATED, 401),
				Arguments.of(ErrorCode.CSRF_TOKEN_INVALID, 403),
				Arguments.of(ErrorCode.PRODUCT_VERSION_CONFLICT, 412),
				Arguments.of(ErrorCode.PRECONDITION_REQUIRED, 428),
				Arguments.of(ErrorCode.USERNAME_TAKEN, 409),
				Arguments.of(ErrorCode.ADMIN_SELF_DELETE, 409),
				Arguments.of(ErrorCode.LAST_ADMIN, 409),
				Arguments.of(ErrorCode.VARIANT_IN_CART, 409),
				Arguments.of(ErrorCode.FEATURED_LIMIT, 409),
				Arguments.of(ErrorCode.CATALOG_CONSTRAINT_CONFLICT, 409),
				Arguments.of(ErrorCode.PAYLOAD_TOO_LARGE, 413));
	}

	@ParameterizedTest(name = "{0} is {1}")
	@MethodSource("newCodeStatus")
	void newCodeHttpStatus(ErrorCode code, int expectedStatus) {
		assertThat(code.httpStatus()).isEqualTo(expectedStatus);
	}

}
