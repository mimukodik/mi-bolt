package com.example.mi_bolt_backend.problem;

import java.util.List;
import java.util.Map;

import com.example.mi_bolt_backend.api.model.FieldError;

/**
 * Domain-level exception carrying the Problem data the advice renders.
 *
 * <p>The HTTP status, machine-readable code, developer-facing detail and any
 * interpolation params or field errors live on the exception; the advice layer
 * is the only place that turns them into a wire response.
 */
public class DomainException extends RuntimeException {

	private final ErrorCode code;
	private final String detail;
	private final Map<String, Object> params;
	private final List<FieldError> fieldErrors;

	public DomainException(ErrorCode code) {
		this(code, code.defaultTitle(), null, null, null);
	}

	public DomainException(ErrorCode code, String detail) {
		this(code, detail, null, null, null);
	}

	public DomainException(ErrorCode code, String detail, Map<String, Object> params) {
		this(code, detail, params, null, null);
	}

	public DomainException(ErrorCode code, String detail,
			Map<String, Object> params, List<FieldError> fieldErrors, Throwable cause) {
		super(detail, cause);
		this.code = code;
		this.detail = detail;
		this.params = params;
		this.fieldErrors = fieldErrors;
	}

	public ErrorCode code() {
		return code;
	}

	public int httpStatus() {
		return code.httpStatus();
	}

	public String detail() {
		return detail;
	}

	public Map<String, Object> params() {
		return params;
	}

	public List<FieldError> fieldErrors() {
		return fieldErrors;
	}
}
