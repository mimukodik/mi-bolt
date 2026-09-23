package com.example.mi_bolt_backend.problem;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.slf4j.LoggerFactory;

import com.example.mi_bolt_backend.api.model.ProblemCode;
import com.example.mi_bolt_backend.test.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@IntegrationTest
class ProblemAdviceTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void unknownQueryParameterReturns400InvalidRequest() throws Exception {
		mockMvc.perform(get("/products/__probe").param("echo", "hi").param("ghost", "yes"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.traceId").exists())
				.andExpect(jsonPath("$.fieldErrors").exists());
	}

	@Test
	void zeroRequestParamFixtureStillRejectsUnknownQueryParameter() throws Exception {
		mockMvc.perform(get("/cart/__probe").param("ghost", "yes"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.params.parameter").value("ghost"));
	}

	@Test
	void missingRequiredQueryParameterReturns400InvalidRequest() throws Exception {
		mockMvc.perform(get("/products/__probe-missing"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.traceId").exists());
	}

	@Test
	void typeMismatchOnQueryParameterReturns400InvalidRequest() throws Exception {
		// /probe/__validated requires ?page as int; sending a non-int triggers
		// MethodArgumentTypeMismatchException which ProblemAdvice routes to 400 INVALID_REQUEST.
		mockMvc.perform(get("/probe/__validated").param("page", "abc"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.params.parameter").value("page"));
	}

	@Test
	void methodNotAllowedReturns405InvalidRequest() throws Exception {
		mockMvc.perform(delete("/cart/__probe"))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(header().exists("Allow"));
	}

	@Test
	void unsupportedMediaTypeReturns415InvalidRequest() throws Exception {
		mockMvc.perform(post("/products/__probe-body")
						.contentType(MediaType.TEXT_PLAIN)
						.content("not-json"))
				.andExpect(status().isUnsupportedMediaType())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void notAcceptableReturns406InvalidRequest() throws Exception {
		mockMvc.perform(get("/cart/__probe").accept(MediaType.TEXT_HTML))
				.andExpect(status().isNotAcceptable())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
	}

	@Test
	void malformedBodyReturns400InvalidRequest() throws Exception {
		mockMvc.perform(post("/products/__probe-body")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{not-json"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.traceId").exists());
	}

	@Test
	void malformedBodyIsLoggedAtDebug() throws Exception {
		try (LoggingProbe probe = LoggingProbe.attach(ProblemAdvice.class)) {
			mockMvc.perform(post("/products/__probe-body")
							.contentType(MediaType.APPLICATION_JSON)
							.content("{not-json"))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
			assertThat(probe.events())
					.anyMatch(e -> e.getLevel() == Level.DEBUG
							&& e.getFormattedMessage().startsWith("Malformed request body"));
		}
	}

	@Test
	void unexpectedExceptionIsLoggedAtError() throws Exception {
		try (LoggingProbe probe = LoggingProbe.attach(ProblemAdvice.class)) {
			mockMvc.perform(get("/throw/__unexpected"))
					.andExpect(status().isServiceUnavailable())
					.andExpect(jsonPath("$.code").value(ProblemCode.SERVICE_UNAVAILABLE.name()));
			assertThat(probe.events())
					.anyMatch(e -> e.getLevel() == Level.ERROR
							&& e.getFormattedMessage().startsWith("Unhandled exception"));
		}
	}

	@Test
	void fourHundredClientErrorIsLoggedAtWarn() throws Exception {
		try (LoggingProbe probe = LoggingProbe.attach(ProblemAdvice.class)) {
			mockMvc.perform(get("/products/__probe").param("ghost", "yes"))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()));
			assertThat(probe.events())
					.anyMatch(e -> e.getLevel() == Level.WARN
							&& e.getFormattedMessage().contains("-> 400 INVALID_REQUEST"));
		}
	}

	@Test
	void unknownRouteReturns404NotFound() throws Exception {
		mockMvc.perform(get("/this/does/not/exist"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value(ProblemCode.NOT_FOUND.name()))
				.andExpect(jsonPath("$.traceId").exists())
				.andExpect(jsonPath("$.fieldErrors").exists());
	}

	@Test
	void unexpectedExceptionReturns503ServiceUnavailable() throws Exception {
		mockMvc.perform(get("/throw/__unexpected"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.code").value(ProblemCode.SERVICE_UNAVAILABLE.name()))
				.andExpect(jsonPath("$.traceId").exists());
	}

	@Test
	void domainExceptionReturnsRoutedStatusAndParams() throws Exception {
		mockMvc.perform(get("/throw/__domain"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value(ProblemCode.QUANTITY_LIMIT.name()))
				.andExpect(jsonPath("$.params.max").value(5))
				.andExpect(jsonPath("$.params.requested").value(7))
				.andExpect(jsonPath("$.traceId").exists());
	}

	@Test
	void responseHasProblemJsonContentTypeAndTraceIdHeader() throws Exception {
		mockMvc.perform(get("/throw/__domain"))
				.andExpect(status().isConflict())
				.andExpect(result -> {
					String contentType = result.getResponse().getContentType();
					assert contentType != null && contentType.startsWith("application/problem+json")
							: "Content-Type was " + contentType;
					String header = result.getResponse().getHeader("X-Trace-Id");
					assert header != null && !header.isBlank() : "X-Trace-Id missing";
				});
	}

	@Test
	void missingIfMatchHeaderReturns400InvalidRequest() throws Exception {
		mockMvc.perform(get("/probe/__require-header"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.params.header").exists());
	}

	@Test
	void invalidEmailReturns422ValidationFailedWithJsonPointer() throws Exception {
		mockMvc.perform(post("/probe/__body")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fullName\":\"Anna\",\"email\":\"not-an-email\",\"phone\":\"+36111111111\"}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value(ProblemCode.VALIDATION_FAILED.name()))
				.andExpect(jsonPath("$.fieldErrors").isArray())
				.andExpect(jsonPath("$.fieldErrors[*].path").exists());
	}

	@Test
	void phonePatternViolationIsReportedAsPhoneFormat() throws Exception {
		// ProbeFixtureController.__body binds Contact whose phone carries a @Pattern.
		// ProblemAdvice maps the resulting PATTERN code to PHONE_FORMAT via the
		// field-leaf map (item 3, decision 0010).
		mockMvc.perform(post("/probe/__body")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fullName\":\"Anna\",\"email\":\"anna@example.com\",\"phone\":\"12345\"}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value(ProblemCode.VALIDATION_FAILED.name()))
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/phone')].code").value(hasItem("PHONE_FORMAT")));
	}

	@Test
	void invalidNestedFieldReturns422WithFullPath() throws Exception {
		// ProbeWrapper has a single @Valid nested ProbeNested whose phone fails the
		// Pattern regex. The path must include the nested segment so the user
		// interface can mark the right control.
		mockMvc.perform(post("/probe/__nested")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"nested\":{\"phone\":\"not-a-phone\"}}"))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.code").value(ProblemCode.VALIDATION_FAILED.name()))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/nested/phone"));
	}

	@Test
	void invalidValidatedQueryParameterReturns400InvalidRequestNot422() throws Exception {
		mockMvc.perform(get("/probe/__validated").param("page", "0"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.params.parameter").exists())
				.andExpect(jsonPath("$.fieldErrors").isArray())
				.andExpect(jsonPath("$.fieldErrors.length()").value(0));
	}

	@Test
	void missingRequiredBodyMemberReturns400InvalidRequest() throws Exception {
		// Contact.phone carries @NotNull; a member that is absent is a schema
		// violation (contracts/commerce/kommunikacio.md §5.1), so the handler answers 400 rather than 422.
		mockMvc.perform(post("/probe/__body")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fullName\":\"Anna\",\"email\":\"anna@example.com\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.detail").value("Missing required member"))
				.andExpect(jsonPath("$.fieldErrors.length()").value(1))
				.andExpect(jsonPath("$.fieldErrors[0].path").value("/phone"))
				.andExpect(jsonPath("$.fieldErrors[0].code").value("REQUIRED"));
	}

	@Test
	void missingMemberOutranksInvalidValueAs400() throws Exception {
		// One member missing and another present but invalid: the body is not
		// shaped, so 400 wins and both field errors are still listed.
		mockMvc.perform(post("/probe/__body")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fullName\":\"Anna\",\"email\":\"not-an-email\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.fieldErrors.length()").value(2))
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/phone')].code").value(hasItem("REQUIRED")))
				.andExpect(jsonPath("$.fieldErrors[?(@.path=='/email')].code").value(hasItem("EMAIL")));
	}

	@Test
	void unknownBodyMemberReturns400InvalidRequest() throws Exception {
		// Every request schema is additionalProperties: false; Jackson is set to
		// fail on an unknown member and handleUnreadable maps that to 400.
		mockMvc.perform(post("/probe/__body")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"fullName\":\"Anna\",\"email\":\"anna@example.com\",\"phone\":\"+36301234567\",\"extra\":1}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.detail").value("Malformed request body"));
	}

	@Test
	void currentSessionIsAccessibleFromController() throws Exception {
		mockMvc.perform(get("/cart/__session"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sessionId").exists());
	}

	@Test
	void uploadOverKnownLimitReturns413WithMaxBytes() {
		ResponseEntity<ProblemDetails> response = new ProblemAdvice("1MB")
				.handleUploadTooLarge(new MaxUploadSizeExceededException(1_048_576L),
						new MockHttpServletRequest("POST", "/admin/media"));

		assertThat(response.getStatusCode().value()).isEqualTo(413);
		assertThat(response.getBody().status()).isEqualTo(413);
		assertThat(response.getBody().code()).isEqualTo(ProblemCode.PAYLOAD_TOO_LARGE);
		assertThat(response.getBody().params()).isEqualTo(Map.of("maxBytes", 1_048_576L));
		assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.valueOf("application/problem+json"));
	}

	// Fails if handleUploadTooLarge drops maxBytes when the exception reports -1.
	@Test
	void uploadOverUnknownLimitReportsTheConfiguredFileLimit() {
		ResponseEntity<ProblemDetails> response = new ProblemAdvice("2MB")
				.handleUploadTooLarge(new MaxUploadSizeExceededException(-1L),
						new MockHttpServletRequest("POST", "/admin/media"));

		assertThat(response.getStatusCode().value()).isEqualTo(413);
		assertThat(response.getBody().code()).isEqualTo(ProblemCode.PAYLOAD_TOO_LARGE);
		assertThat(response.getBody().params()).isEqualTo(Map.of("maxBytes", 2_097_152L));
	}

	@Test
	void missingPartReturns400WithPartName() {
		ResponseEntity<ProblemDetails> response = new ProblemAdvice("1MB")
				.handleMissingPart(new MissingServletRequestPartException("file"),
						new MockHttpServletRequest("POST", "/admin/media"));

		assertThat(response.getStatusCode().value()).isEqualTo(400);
		assertThat(response.getBody().code()).isEqualTo(ProblemCode.INVALID_REQUEST);
		assertThat(response.getBody().params()).isEqualTo(Map.of("part", "file"));
	}

	@Test
	void multipartFailuresNoLongerFallIntoTheUnexpectedHandler() {
		ResponseEntity<ProblemDetails> tooLarge = new ProblemAdvice("1MB")
				.handleUploadTooLarge(new MaxUploadSizeExceededException(1_048_576L),
						new MockHttpServletRequest("POST", "/admin/media"));
		ResponseEntity<ProblemDetails> missingPart = new ProblemAdvice("1MB")
				.handleMissingPart(new MissingServletRequestPartException("file"),
						new MockHttpServletRequest("POST", "/admin/media"));
		ResponseEntity<ProblemDetails> malformed = new ProblemAdvice("1MB")
				.handleMalformedMultipart(new MultipartException("x"),
						new MockHttpServletRequest("POST", "/admin/media"));

		assertThat(tooLarge.getStatusCode().value()).isNotEqualTo(503);
		assertThat(missingPart.getStatusCode().value()).isNotEqualTo(503);
		assertThat(malformed.getStatusCode().value()).isNotEqualTo(503);
	}

	@Test
	void tooLargeThroughTheDispatcherReturns413WithMaxBytes() throws Exception {
		try (LoggingProbe probe = LoggingProbe.attach(ProblemAdvice.class)) {
			mockMvc.perform(get("/throw/__multipart-too-large").param("maxBytes", "1048576"))
					.andExpect(status().isPayloadTooLarge())
					.andExpect(jsonPath("$.code").value(ProblemCode.PAYLOAD_TOO_LARGE.name()))
					.andExpect(jsonPath("$.params.maxBytes").value(1_048_576))
					.andExpect(jsonPath("$.traceId").exists())
					.andExpect(header().exists("X-Trace-Id"));
			assertThat(probe.events())
					.anyMatch(e -> e.getLevel() == Level.DEBUG
							&& e.getFormattedMessage().startsWith("Upload exceeds the size limit"));
		}
	}

	// Fails if the advice bean does not receive spring.servlet.multipart.max-file-size (Boot default 1MB).
	// 1MB is also the @Value fallback and Boot's own default, so this cannot tell the three apart; a
	// differing value would need a second @SpringBootTest context, which the shared in-memory H2 rejects.
	@Test
	void tooLargeWithUnknownLimitThroughTheDispatcherReportsTheConfiguredFileLimit() throws Exception {
		mockMvc.perform(get("/throw/__multipart-too-large"))
				.andExpect(status().isPayloadTooLarge())
				.andExpect(jsonPath("$.code").value(ProblemCode.PAYLOAD_TOO_LARGE.name()))
				.andExpect(jsonPath("$.params.maxBytes").value(1_048_576));
	}

	@Test
	void missingPartThroughTheDispatcherReturns400WithPartName() throws Exception {
		try (LoggingProbe probe = LoggingProbe.attach(ProblemAdvice.class)) {
			mockMvc.perform(multipart("/probe/__part"))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
					.andExpect(jsonPath("$.params.part").value("file"))
					.andExpect(jsonPath("$.traceId").exists());
			assertThat(probe.events())
					.anyMatch(e -> e.getLevel() == Level.DEBUG
							&& e.getFormattedMessage().startsWith("Missing required request part"));
		}
	}

	@Test
	void malformedMultipartReturns400WithoutParams() {
		ResponseEntity<ProblemDetails> response = new ProblemAdvice("1MB")
				.handleMalformedMultipart(new MultipartException("Failed to parse multipart servlet request"),
						new MockHttpServletRequest("POST", "/admin/media"));

		assertThat(response.getStatusCode().value()).isEqualTo(400);
		assertThat(response.getBody().code()).isEqualTo(ProblemCode.INVALID_REQUEST);
		assertThat(response.getBody().params()).isNull();
	}

	// Fails if handleMalformedMultipart stops logging the cause at WARN: Spring 7's message is fixed and
	// a server-side parse failure (an unwritable temp directory) is only in getCause().
	@Test
	void malformedMultipartLogsTheCauseAtWarn() {
		try (LoggingProbe probe = LoggingProbe.attach(ProblemAdvice.class)) {
			new ProblemAdvice("1MB").handleMalformedMultipart(
					new MultipartException("Failed to parse multipart servlet request", new IOException("disk full")),
					new MockHttpServletRequest("POST", "/admin/media"));

			assertThat(probe.events())
					.anyMatch(e -> e.getLevel() == Level.WARN
							&& "Malformed multipart request: Failed to parse multipart servlet request, cause: java.io.IOException: disk full"
									.equals(e.getFormattedMessage())
							&& e.getThrowableProxy() == null);
		}
	}

	// Fails if handleMalformedMultipart is removed: RequestPartMethodArgumentResolver throws
	// MultipartException("Current request is not a multipart request") and the Throwable handler answers 503.
	@Test
	void partEndpointWithoutMultipartBodyReturns400NotThe503() throws Exception {
		try (LoggingProbe probe = LoggingProbe.attach(ProblemAdvice.class)) {
			mockMvc.perform(post("/probe/__part").contentType(MediaType.APPLICATION_JSON).content("{}"))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
					.andExpect(jsonPath("$.detail").value("Malformed multipart request"))
					.andExpect(jsonPath("$.params").doesNotExist());
			assertThat(probe.events())
					.anyMatch(e -> e.getLevel() == Level.WARN
							&& "Malformed multipart request: Current request is not a multipart request, cause: null"
									.equals(e.getFormattedMessage())
							&& e.getThrowableProxy() == null);
		}
	}

	// Fails if handleHandlerValidation stops naming the parameter with the lowest index.
	@Test
	void twoBrokenParametersReportTheFirstFromMvcValidation() throws Exception {
		mockMvc.perform(get("/probe/__bounds").param("low", "0").param("high", "11"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("low"))
				.andExpect(jsonPath("$.params.reason").value("MIN"));
	}

	// Fails if handleConstraintViolation stops naming the parameter with the lowest index.
	@Test
	void twoBrokenParametersReportTheFirstFromTheValidatedProxy() throws Exception {
		mockMvc.perform(get("/probe/__validated-bounds").param("low", "0").param("high", "11"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("low"))
				.andExpect(jsonPath("$.params.reason").value("MIN"));
	}

	// Fails if handleHandlerValidation stops reporting a single broken parameter as it did before.
	@Test
	void oneBrokenParameterStillReportsItself() throws Exception {
		mockMvc.perform(get("/probe/__bounds").param("low", "5").param("high", "11"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(ProblemCode.INVALID_REQUEST.name()))
				.andExpect(jsonPath("$.detail").value("Query or path parameter is not acceptable"))
				.andExpect(jsonPath("$.params.parameter").value("high"))
				.andExpect(jsonPath("$.params.reason").value("MAX"));
	}

	/**
	 * Captures log events emitted on a Logback logger so a test can assert
	 * a particular level+message was produced. The level is forced to its
	 * least-restrictive setting (TRACE) while attached, so DEBUG/INFO/WARN/ERROR
	 * guards inside the production code are entered, and restored on detach.
	 */
	private static final class LoggingProbe implements AutoCloseable {

		private final Logger logger;
		private final Level previousLevel;
		private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

		private LoggingProbe(Class<?> owner) {
			this.logger = (Logger) LoggerFactory.getLogger(owner);
			this.previousLevel = logger.getLevel();
			this.logger.setLevel(Level.TRACE);
			this.appender.start();
			this.logger.addAppender(this.appender);
		}

		static LoggingProbe attach(Class<?> owner) {
			return new LoggingProbe(owner);
		}

		List<ILoggingEvent> events() {
			return appender.list;
		}

		void detach() {
			logger.detachAppender(appender);
			logger.setLevel(previousLevel);
		}

		@Override
		public void close() {
			detach();
		}
	}
}
