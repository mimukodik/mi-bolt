package com.example.mi_bolt_backend.test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.test.web.servlet.ResultMatcher;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.mockmvc.OpenApiValidationMatchers;
import com.atlassian.oai.validator.report.LevelResolver;
import com.atlassian.oai.validator.report.ValidationReport;

import tools.jackson.databind.json.JsonMapper;

/**
 * Helper that hands MockMvc a validator built from the contract source
 * ({@code api/openapi.yaml}, the original — the same file the generator
 * derives its copy from).
 *
 * <p>The factory reads the contract via {@link Files#readString(Path)} from
 * the project working directory. Tests run from the repository root in both
 * Gradle and the IDE, so a single source serves both. There is no committed
 * copy under {@code src/test/resources}.
 */
public final class ContractValidation {

	public static final JsonMapper JSON = JsonMapper.builder().build();

	private ContractValidation() {
	}

	/** Asserts the response satisfies every applicable rule in the contract. */
	public static ResultMatcher validAgainstContract() {
		return OpenApiValidationMatchers.openApi().isValid(validator(LevelResolver.defaultResolver()));
	}

	/**
	 * The same check for a multipart request. MockMvc keeps the parts out of the request
	 * content, so the validator would report the required body as missing; that one message
	 * is ignored and every other request and response rule still applies.
	 */
	public static ResultMatcher validMultipartAgainstContract() {
		return OpenApiValidationMatchers.openApi().isValid(validator(LevelResolver.create()
				.withLevel("validation.request.parameter.query.unexpected", ValidationReport.Level.IGNORE)
				.withLevel("validation.request.body.missing", ValidationReport.Level.IGNORE)
				.build()));
	}

	/** Loads the contract from the project root; fail-fast if it cannot be read. */
	public static OpenApiInteractionValidator validator() {
		return validator(LevelResolver.defaultResolver());
	}

	private static OpenApiInteractionValidator validator(LevelResolver levels) {
		try {
			String spec = Files.readString(Path.of("api/openapi.yaml"), StandardCharsets.UTF_8);
			return OpenApiInteractionValidator.createForInlineApiSpecification(spec).withLevelResolver(levels).build();
		}
		catch (IOException e) {
			throw new IllegalStateException("Cannot read api/openapi.yaml from the project root", e);
		}
	}
}
