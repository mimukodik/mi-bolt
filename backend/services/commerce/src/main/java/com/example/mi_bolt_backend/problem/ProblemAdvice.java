package com.example.mi_bolt_backend.problem;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.ObjectError;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.util.unit.DataSize;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.ElementKind;
import jakarta.validation.Path;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.api.model.ProblemCode;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Single source of {@code application/problem+json} responses. Controllers never
 * build error bodies; they throw {@link DomainException} or let framework
 * exceptions bubble up here.
 */
@RestControllerAdvice
public class ProblemAdvice {

	private static final Logger log = LoggerFactory.getLogger(ProblemAdvice.class);

	private static final MediaType PROBLEM_JSON = MediaType.valueOf("application/problem+json");

	/** Contract-named codes for the two @Pattern fields the checkout forms carry. */
	private static final Map<String, String> PATTERN_CODES = Map.of(
			"phone", "PHONE_FORMAT",
			"postalCode", "POSTAL_CODE_FORMAT");

	/** Contract-named code for a member the body must carry and does not. */
	private static final String REQUIRED = "REQUIRED";

	/** {@code spring.servlet.multipart.max-file-size} in bytes, reported when the container names no limit. */
	private final long maxFileSizeBytes;

	public ProblemAdvice(@Value("${spring.servlet.multipart.max-file-size:1MB}") String maxFileSize) {
		this.maxFileSizeBytes = DataSize.parse(maxFileSize).toBytes();
	}

	@ExceptionHandler(DomainException.class)
	public ResponseEntity<ProblemDetails> handleDomain(DomainException ex, HttpServletRequest request) {
		return body(ex.code(), ex.detail(), ex.params(), ex.fieldErrors(), request);
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<ProblemDetails> handleUnreadable(HttpMessageNotReadableException ex,
			HttpServletRequest request) {
		if (log.isDebugEnabled()) {
			log.debug("Malformed request body: {}", ex.getMessage());
		}
		return body(ErrorCode.INVALID_REQUEST, "Malformed request body", null, null, request);
	}

	@ExceptionHandler(MissingServletRequestParameterException.class)
	public ResponseEntity<ProblemDetails> handleMissingParam(MissingServletRequestParameterException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		params.put("parameter", ex.getParameterName());
		return body(ErrorCode.INVALID_REQUEST, "Missing required query parameter", params, null, request);
	}

	@ExceptionHandler(MissingRequestHeaderException.class)
	public ResponseEntity<ProblemDetails> handleMissingHeader(MissingRequestHeaderException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		params.put("header", ex.getHeaderName());
		return body(ErrorCode.INVALID_REQUEST, "Missing required request header", params, null, request);
	}

	@ExceptionHandler(UnknownQueryParameterException.class)
	public ResponseEntity<ProblemDetails> handleUnknownQueryParameter(UnknownQueryParameterException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		params.put("parameter", ex.getParameterName());
		return body(ErrorCode.INVALID_REQUEST, "Unknown query parameter", params, null, request);
	}

	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	public ResponseEntity<ProblemDetails> handleTypeMismatchParam(MethodArgumentTypeMismatchException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		params.put("parameter", ex.getName());
		params.put("reason", "type " + (ex.getRequiredType() == null ? "?" : ex.getRequiredType().getSimpleName()));
		return body(ErrorCode.INVALID_REQUEST, "Query or path parameter has the wrong type", params, null, request);
	}

	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	public ResponseEntity<ProblemDetails> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		params.put("method", ex.getMethod());
		params.put("supported", ex.getSupportedHttpMethods() == null
				? List.of()
				: ex.getSupportedHttpMethods().stream().map(HttpMethod::name).toList());
		return body(HttpStatus.METHOD_NOT_ALLOWED, ErrorCode.INVALID_REQUEST,
				"HTTP method is not allowed for this path", params, null, request, allowHeader(ex));
	}

	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	public ResponseEntity<ProblemDetails> handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		params.put("contentType", ex.getContentType() == null ? "" : ex.getContentType().toString());
		return body(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.INVALID_REQUEST,
				"Request media type is not supported", params, null, request);
	}

	@ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
	public ResponseEntity<ProblemDetails> handleMediaTypeNotAcceptable(HttpMediaTypeNotAcceptableException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		List<String> supported = ex.getSupportedMediaTypes() == null
				? List.of()
				: ex.getSupportedMediaTypes().stream().map(MediaType::toString).collect(Collectors.toList());
		params.put("acceptable", supported);
		return body(HttpStatus.NOT_ACCEPTABLE, ErrorCode.INVALID_REQUEST,
				"Requested media type is not acceptable", params, null, request);
	}

	/**
	 * Bean-validation failures on a request body. A missing required member
	 * ({@code @NotNull}, reported as {@code REQUIRED}) is a schema violation,
	 * so the answer is 400 INVALID_REQUEST per docs/01 §5.1; every other
	 * failure is 422 VALIDATION_FAILED. Both carry a JSON-pointer {@code path}
	 * for each field, plus a {@code "/"} entry for each class-level
	 * (cross-field) error so the user interface can mark the offending control
	 * or a banner near the form.
	 */
	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ProblemDetails> handleBodyValidation(MethodArgumentNotValidException ex,
			HttpServletRequest request) {
		List<FieldError> fieldErrors = new ArrayList<>();
		boolean missingMember = false;
		for (var fe : ex.getBindingResult().getFieldErrors()) {
			String code = fieldCode(fe, fe.getField());
			missingMember |= REQUIRED.equals(code);
			fieldErrors.add(new FieldError(toJsonPointer(fe.getField()), code));
		}
		for (ObjectError ge : ex.getBindingResult().getGlobalErrors()) {
			fieldErrors.add(new FieldError("/", constraintCode(ge)));
		}
		if (missingMember) {
			return body(ErrorCode.INVALID_REQUEST, "Missing required member", null, fieldErrors, request);
		}
		return body(ErrorCode.VALIDATION_FAILED, "One or more supplied fields are not acceptable",
				null, fieldErrors, request);
	}

	/**
	 * Bean-validation on a method (query or path) parameter: 400 INVALID_REQUEST
	 * per docs/01 §5.1 and docs/02 §4.1/9 — formally wrong query input is a
	 * client error, not a business rejection. The body carries the parameter
	 * name and a constraint code in {@code params}; {@code fieldErrors} is
	 * empty because a JSON pointer in the body would mislead the form into
	 * marking a body field for what is actually a query-string issue.
	 */
	@ExceptionHandler(HandlerMethodValidationException.class)
	public ResponseEntity<ProblemDetails> handleHandlerValidation(HandlerMethodValidationException ex,
			HttpServletRequest request) {
		Map<String, Object> params = new HashMap<>();
		ParameterValidationResult first = ex.getParameterValidationResults().stream()
				.min(Comparator.comparingInt(result -> result.getMethodParameter().getParameterIndex()))
				.orElse(null);
		if (first != null) {
			String fieldName = first.getMethodParameter().getParameterName();
			params.put("parameter", fieldName == null ? "?" : fieldName);
			first.getResolvableErrors().stream()
					.map(MessageSourceResolvable::getCodes)
					.filter(codes -> codes != null && codes.length > 0 && codes[0] != null)
					.map(codes -> lastSegment(codes).toUpperCase(Locale.ROOT))
					.min(Comparator.naturalOrder())
					.ifPresent(reason -> params.put("reason", reason));
		}
		return body(ErrorCode.INVALID_REQUEST, "Query or path parameter is not acceptable",
				params, null, request);
	}

	/**
	 * Method-level Bean Validation triggered by {@code @Validated} on the
	 * generated {@code CatalogApi} interface throws this exception before the
	 * service runs. The brief's "any 400 must be INVALID_REQUEST" rule applies,
	 * so we map it to the same body the {@link HandlerMethodValidationException}
	 * handler would produce rather than letting it fall through to the 503
	 * fallback. Removed only when the generator stops emitting {@code @Validated}
	 * on interface methods (see docs/decisions/0008).
	 */
	@ExceptionHandler(ConstraintViolationException.class)
	public ResponseEntity<ProblemDetails> handleConstraintViolation(ConstraintViolationException ex,
			HttpServletRequest request) {
		ConstraintViolation<?> first = null;
		for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
			if ("slug".equals(leafName(violation))) {
				return body(ErrorCode.NOT_FOUND, "product not found",
						Map.of("slug", String.valueOf(violation.getInvalidValue())), null, request);
			}
			if (first == null || FIRST_VIOLATION.compare(violation, first) < 0) {
				first = violation;
			}
		}
		Map<String, Object> params = new HashMap<>();
		params.put("parameter", first == null ? "?" : leafName(first));
		if (first != null) {
			params.put("reason", reasonOf(first));
		}
		return body(ErrorCode.INVALID_REQUEST, "Query or path parameter is not acceptable",
				params, null, request);
	}

	@ExceptionHandler(NoResourceFoundException.class)
	public ResponseEntity<ProblemDetails> handleNotFound(NoResourceFoundException ex,
			HttpServletRequest request) {
		return body(ErrorCode.NOT_FOUND, "No handler for the requested path", null, null, request);
	}

	/**
	 * An upload over {@code spring.servlet.multipart.max-file-size} or
	 * {@code max-request-size}. {@code params.maxBytes} is the limit the
	 * exception reports, or the configured file limit when it reports -1,
	 * which Spring 7's {@code StandardMultipartHttpServletRequest} always does.
	 */
	@ExceptionHandler(MaxUploadSizeExceededException.class)
	public ResponseEntity<ProblemDetails> handleUploadTooLarge(MaxUploadSizeExceededException ex,
			HttpServletRequest request) {
		if (log.isDebugEnabled()) {
			log.debug("Upload exceeds the size limit: {}", ex.getMessage());
		}
		Map<String, Object> params = new HashMap<>();
		params.put("maxBytes", ex.getMaxUploadSize() >= 0 ? ex.getMaxUploadSize() : maxFileSizeBytes);
		return body(ErrorCode.PAYLOAD_TOO_LARGE, "The upload exceeds the size limit", params, null, request);
	}

	@ExceptionHandler(MissingServletRequestPartException.class)
	public ResponseEntity<ProblemDetails> handleMissingPart(MissingServletRequestPartException ex,
			HttpServletRequest request) {
		if (log.isDebugEnabled()) {
			log.debug("Missing required request part: {}", ex.getRequestPartName());
		}
		Map<String, Object> params = new HashMap<>();
		params.put("part", ex.getRequestPartName());
		return body(ErrorCode.INVALID_REQUEST, "Missing required request part", params, null, request);
	}

	/**
	 * A multipart body the container cannot parse, or a part endpoint called
	 * without a multipart body. {@link MaxUploadSizeExceededException} is a
	 * subclass and keeps its own, closer handler.
	 * The cause is logged at WARN because a server-side parse failure hides there.
	 */
	@ExceptionHandler(MultipartException.class)
	public ResponseEntity<ProblemDetails> handleMalformedMultipart(MultipartException ex,
			HttpServletRequest request) {
		if (log.isWarnEnabled()) {
			log.warn("Malformed multipart request: {}, cause: {}", ex.getMessage(), String.valueOf(ex.getCause()));
		}
		return body(ErrorCode.INVALID_REQUEST, "Malformed multipart request", null, null, request);
	}

	@ExceptionHandler(Throwable.class)
	public ResponseEntity<ProblemDetails> handleUnexpected(Throwable ex, HttpServletRequest request) {
		if (log.isErrorEnabled()) {
			log.error("Unhandled exception while serving {} {}", request.getMethod(), request.getRequestURI(), ex);
		}
		return body(ErrorCode.SERVICE_UNAVAILABLE, "The service is temporarily unavailable", null, null,
				request);
	}

	private ResponseEntity<ProblemDetails> body(ErrorCode code,
			String detail,
			Map<String, Object> params,
			List<FieldError> fieldErrors,
			HttpServletRequest request) {
		return body(HttpStatus.valueOf(code.httpStatus()), code, detail, params, fieldErrors, request, null);
	}

	private ResponseEntity<ProblemDetails> body(HttpStatus httpStatus,
			ErrorCode code,
			String detail,
			Map<String, Object> params,
			List<FieldError> fieldErrors,
			HttpServletRequest request) {
		return body(httpStatus, code, detail, params, fieldErrors, request, null);
	}

	private ResponseEntity<ProblemDetails> body(HttpStatus httpStatus,
			ErrorCode code,
			String detail,
			Map<String, Object> params,
			List<FieldError> fieldErrors,
			HttpServletRequest request,
			HttpHeaders extraHeaders) {
		String traceId = traceIdOf(request);
		List<FieldError> errors =
				fieldErrors == null ? List.of() : fieldErrors;
		ProblemDetails body = new ProblemDetails(
				code.problemTypeUri(),
				code.defaultTitle(),
				httpStatus.value(),
				codeToWireCode(code),
				detail == null ? code.defaultTitle() : detail,
				traceId,
				(params == null || params.isEmpty()) ? null : params,
				errors);
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(PROBLEM_JSON);
		headers.set(TraceIdFilter.RESPONSE_HEADER, traceId);
		if (extraHeaders != null) {
			headers.addAll(extraHeaders);
		}
		if (httpStatus.is4xxClientError()) {
			// 4xx is the caller's fault — log at WARN without a stack trace.
			if (log.isWarnEnabled()) {
				log.warn("{} {} -> {} {}", request.getMethod(), request.getRequestURI(),
						httpStatus.value(), code);
			}
		}
		return new ResponseEntity<>(body, headers, httpStatus);
	}

	private static HttpHeaders allowHeader(HttpRequestMethodNotSupportedException ex) {
		HttpHeaders headers = new HttpHeaders();
		if (ex.getSupportedHttpMethods() != null) {
			headers.set(HttpHeaders.ALLOW,
					ex.getSupportedHttpMethods().stream().map(HttpMethod::name).collect(Collectors.joining(", ")));
		}
		return headers;
	}

	/** Maps our internal {@link ErrorCode} to the wire-side generated {@link ProblemCode}. */
	private static ProblemCode codeToWireCode(ErrorCode code) {
		return ProblemCode.valueOf(code.name());
	}

	/**
	 * Turns a Spring binding path into a JSON pointer per RFC 6901: dots become
	 * slashes, array indices {@code [n]} become {@code /n}. Spring binds nested
	 * fields with a dot and list elements with the same form, so the conversion
	 * is mechanical.
	 */
	static String toJsonPointer(String springPath) {
		if (springPath == null || springPath.isEmpty()) {
			return "/";
		}
		StringBuilder out = new StringBuilder(springPath.length() + 4);
		out.append('/');
		for (int i = 0; i < springPath.length(); i++) {
			char c = springPath.charAt(i);
			if (c == '.') {
				out.append('/');
			}
			else if (c == '[') {
				out.append('/');
			}
			else if (c != ']') {
				out.append(c);
			}
		}
		return out.toString();
	}

	/**
	 * Picks the constraint's simple name out of the codes array Spring emits for
	 * a constraint violation. The array runs from most specific (with class and
	 * method) to least specific (the constraint annotation name); the last
	 * element is what the user interface expects.
	 */
	private static String lastSegment(String[] codes) {
		String last = codes[codes.length - 1];
		int dot = last.lastIndexOf('.');
		return dot < 0 ? last : last.substring(dot + 1);
	}

	/** The lowest parameter index first, then the alphabetically smallest reason: one answer for any request. */
	private static final Comparator<ConstraintViolation<?>> FIRST_VIOLATION = Comparator
			.<ConstraintViolation<?>>comparingInt(ProblemAdvice::parameterIndex)
			.thenComparing(ProblemAdvice::reasonOf);

	private static int parameterIndex(ConstraintViolation<?> violation) {
		for (Path.Node node : violation.getPropertyPath()) {
			if (node.getKind() == ElementKind.PARAMETER) {
				return node.as(Path.ParameterNode.class).getParameterIndex();
			}
		}
		return Integer.MAX_VALUE;
	}

	private static String leafName(ConstraintViolation<?> violation) {
		String path = violation.getPropertyPath() == null ? "" : violation.getPropertyPath().toString();
		int dot = path.lastIndexOf('.');
		return dot < 0 ? path : path.substring(dot + 1);
	}

	private static String reasonOf(ConstraintViolation<?> violation) {
		return violation.getConstraintDescriptor().getAnnotation().annotationType().getSimpleName()
				.toUpperCase(Locale.ROOT);
	}

	private static String constraintCode(ObjectError error) {
		String[] codes = error.getCodes();
		if (codes == null || codes.length == 0 || codes[0] == null) {
			return "VALIDATION_FAILED";
		}
		String code = lastSegment(codes).toUpperCase(Locale.ROOT);
		return "NOTNULL".equals(code) ? REQUIRED : code;
	}

	private static String fieldCode(ObjectError error, String field) {
		String code = constraintCode(error);
		if (!"PATTERN".equals(code)) {
			return code;
		}
		int dot = field.lastIndexOf('.');
		String leaf = dot < 0 ? field : field.substring(dot + 1);
		return PATTERN_CODES.getOrDefault(leaf, code);
	}

	private static String traceIdOf(HttpServletRequest request) {
		Object value = request.getAttribute(TraceIdFilter.ATTRIBUTE);
		return value instanceof String s ? s : "000000000000000000000000";
	}
}
