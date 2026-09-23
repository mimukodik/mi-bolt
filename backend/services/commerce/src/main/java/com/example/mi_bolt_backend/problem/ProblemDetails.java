package com.example.mi_bolt_backend.problem;

import java.util.List;
import java.util.Map;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.api.model.ProblemCode;

/**
 * Wire body for {@code application/problem+json} responses.
 *
 * <p>The contract (contracts/commerce/openapi.yaml → Problem schema) requires every field on
 * every response. {@code params} is omitted when empty by the global Jackson
 * {@code non_null} setting.
 */
public record ProblemDetails(
		String type,
		String title,
		int status,
		ProblemCode code,
		String detail,
		String traceId,
		Map<String, Object> params,
		List<FieldError> fieldErrors) {
}
