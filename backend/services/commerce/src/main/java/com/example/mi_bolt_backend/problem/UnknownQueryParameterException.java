package com.example.mi_bolt_backend.problem;

/**
 * Thrown by {@link UnknownQueryParameterInterceptor} when a request carries a query
 * parameter the handler does not declare. Maps to {@code 400 INVALID_REQUEST} per
 * docs/02-backend.md 4.1/8.
 */
public class UnknownQueryParameterException extends RuntimeException {

	private final String parameterName;

	public UnknownQueryParameterException(String parameterName) {
		super("Unknown query parameter: " + parameterName);
		this.parameterName = parameterName;
	}

	public String getParameterName() {
		return parameterName;
	}
}
