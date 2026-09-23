package com.example.mi_bolt_backend.test;

import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;
import com.example.mi_bolt_backend.api.model.Address;
import com.example.mi_bolt_backend.api.model.Contact;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;
import com.example.mi_bolt_backend.session.CurrentSession;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import org.springframework.validation.annotation.Validated;

/**
 * Test-only fixtures that let the foundation tests probe the cookie filter, the
 * Problem advice, the unknown-query interceptor and the Jackson configuration
 * without depending on a real business endpoint (T4+).
 *
 * <p>The paths live under the configured context path {@code /api/v1}; the
 * filters and advice are exercised against them. These classes never appear in
 * the main source set and so are not part of the deployed application.
 */
@RestController
@RequestMapping("/cart")
class CartFixtureController {

	@GetMapping("/__probe")
	Map<String, Object> probe() {
		return Map.of("status", "ok");
	}
}

@RestController
@RequestMapping("/checkout")
class CheckoutFixtureController {

	@GetMapping("/__probe")
	Map<String, Object> probe() {
		return Map.of("status", "ok");
	}
}

@RestController
@RequestMapping("/products")
class ProductsFixtureController {

	@GetMapping("/__probe")
	Map<String, Object> probe(@RequestParam("echo") String echo) {
		return Map.of("echo", echo);
	}

	@GetMapping("/__probe-empty")
	Map<String, Object> probeEmptyOptional(@RequestParam(value = "maybe", required = false) String maybe) {
		return maybe == null ? Map.of() : Map.of("maybe", maybe);
	}

	@GetMapping("/__probe-missing")
	Map<String, Object> probeMissingRequired(@RequestParam("required") String required) {
		return Map.of("required", required);
	}

	@PostMapping(value = "/__probe-body", consumes = MediaType.APPLICATION_JSON_VALUE)
	Map<String, Object> probeBody(@RequestBody Map<String, Object> body) {
		return Map.of("received", body);
	}
}

@RestController
@RequestMapping("/throw")
class ThrowingFixtureController {

	@GetMapping("/__domain")
	Map<String, Object> domainException() {
		throw new DomainException(
				ErrorCode.QUANTITY_LIMIT,
				"Merged quantity would exceed the line maximum.",
				Map.of("max", 5, "requested", 7));
	}

	@GetMapping("/__unexpected")
	Map<String, Object> unexpected() {
		throw new IllegalStateException("kaboom");
	}

	/**
	 * The upload-size case as the servlet stack raises it. Spring 7 builds the
	 * exception in {@code StandardMultipartHttpServletRequest.handleParseFailure}
	 * and always passes -1, a state MockMvc cannot reach through the multipart
	 * resolver, so the fixture raises the exception itself and takes the limit as
	 * a parameter.
	 */
	@GetMapping("/__multipart-too-large")
	Map<String, Object> multipartTooLarge(@RequestParam(name = "maxBytes", defaultValue = "-1") long maxBytes) {
		throw new MaxUploadSizeExceededException(maxBytes);
	}
}

@RestController
@RequestMapping("/probe")
class ProbeFixtureController {

	@GetMapping("/__address")
	Address probeAddress() {
		return new Address()
				.countryCode(Address.CountryCodeEnum.HU)
				.postalCode("1111")
				.city("Budapest")
				.line1("Fo utca 1");
	}

	@GetMapping("/__if-match")
	Map<String, Object> probeIfMatch(
			@RequestHeader(value = "If-Match", required = false) String ifMatch) {
		return Map.of("ifMatch", ifMatch == null ? "" : ifMatch);
	}

	@GetMapping("/__require-header")
	Map<String, Object> probeRequireHeader(
			@RequestHeader(value = "X-Required", required = true) String required) {
		return Map.of("required", required);
	}

	@PostMapping(value = "/__body", consumes = MediaType.APPLICATION_JSON_VALUE)
	Map<String, Object> probeBody(
			@RequestBody @Valid Contact body) {
		return Map.of("email", body.getEmail());
	}

	@PostMapping(value = "/__nested", consumes = MediaType.APPLICATION_JSON_VALUE)
	Map<String, Object> probeNested(
			@RequestBody @Valid ProbeWrapper body) {
		return Map.of("ok", true);
	}

	@GetMapping("/__validated")
	Map<String, Object> probeValidated(
			@Validated
			@RequestParam("page") @Min(1) int page) {
		return Map.of("page", page);
	}

	@PostMapping("/__part")
	Map<String, Object> probePart(@RequestPart("file") MultipartFile file) {
		return Map.of("size", file.getSize());
	}
}

@RestController
class SessionProbeFixtureController {

	@GetMapping("/cart/__session")
	Map<String, Object> sessionId(HttpServletRequest request) {
		var session = CurrentSession.get(request);
		return Map.of("sessionId", session == null ? "" : String.valueOf(session.getId()));
	}
}

class ProbeWrapper {

	@Valid
	@NotNull
	private ProbeNested nested;

	public ProbeNested getNested() {
		return nested;
	}

	public void setNested(ProbeNested nested) {
		this.nested = nested;
	}
}

class ProbeNested {

	@Pattern(regexp = "\\+36[0-9]{8,9}")
	private String phone;

	public String getPhone() {
		return phone;
	}

	public void setPhone(String phone) {
		this.phone = phone;
	}
}

@RestController
@RequestMapping("/probe")
class BoundsFixtureController {

	@GetMapping("/__bounds")
	Map<String, Object> probeBounds(@RequestParam("low") @Min(1) int low, @RequestParam("high") @Max(10) int high) {
		return Map.of("low", low, "high", high);
	}
}

@Validated
@RestController
@RequestMapping("/probe")
class ValidatedBoundsFixtureController {

	@GetMapping("/__validated-bounds")
	Map<String, Object> probeValidatedBounds(@RequestParam("low") @Min(1) int low,
			@RequestParam("high") @Max(10) int high) {
		return Map.of("low", low, "high", high);
	}
}
