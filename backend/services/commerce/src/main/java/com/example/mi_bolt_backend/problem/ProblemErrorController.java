package com.example.mi_bolt_backend.problem;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import com.example.mi_bolt_backend.api.model.ProblemCode;

/**
 * Renders the error path {@code ${server.error.path:/error}} as
 * {@code application/problem+json}. Boot's default forwards there for any
 * exception the controller chain did not handle; without this controller
 * the response is Boot's bare JSON {@code {"status":999,...}} body.
 *
 * <p>Implementing Boot's {@link ErrorController} interface replaces the
 * default {@code BasicErrorController} so there is exactly one handler for
 * the {@code /error} path.
 *
 * <p>The contract has no 500. A 404 keeps its status and uses NOT_FOUND;
 * anything else is collapsed to 503 SERVICE_UNAVAILABLE so an unhandled
 * framework exception never surfaces as a 500 to a client.
 */
@Controller
public class ProblemErrorController implements ErrorController {

	private static final MediaType PROBLEM_JSON = MediaType.valueOf("application/problem+json");
	private static final String ERROR_PATH = "/error";

	@RequestMapping(ERROR_PATH)
	public ResponseEntity<ProblemDetails> handle(HttpServletRequest request,
			HttpServletResponse response) {
		Object statusObj = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
		int raw = (statusObj instanceof Integer i) ? i : HttpStatus.SERVICE_UNAVAILABLE.value();
		boolean notFound = raw == HttpStatus.NOT_FOUND.value();
		HttpStatus httpStatus = notFound ? HttpStatus.NOT_FOUND : HttpStatus.SERVICE_UNAVAILABLE;
		ErrorCode code = notFound ? ErrorCode.NOT_FOUND : ErrorCode.SERVICE_UNAVAILABLE;
		String traceId = traceIdOf(request);
		if (!response.isCommitted()) {
			// Reset is needed when the request reached us via
			// RequestDispatcher.forward() after an upstream sendError-style
			// dispatch, which leaves a 200 default on MockMvc's forward path.
			response.reset();
		}
		ProblemDetails body = new ProblemDetails(
				code.problemTypeUri(),
				code.defaultTitle(),
				httpStatus.value(),
				ProblemCode.valueOf(code.name()),
				code.defaultTitle(),
				traceId,
				null,
				List.of());
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(PROBLEM_JSON);
		headers.set(TraceIdFilter.RESPONSE_HEADER, traceId);
		return new ResponseEntity<>(body, headers, httpStatus);
	}

	private static String traceIdOf(HttpServletRequest request) {
		Object value = request.getAttribute(TraceIdFilter.ATTRIBUTE);
		return value instanceof String s ? s : "000000000000000000000000";
	}
}
