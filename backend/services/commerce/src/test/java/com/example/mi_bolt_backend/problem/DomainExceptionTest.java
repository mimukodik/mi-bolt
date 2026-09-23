package com.example.mi_bolt_backend.problem;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import com.example.mi_bolt_backend.api.model.FieldError;

class DomainExceptionTest {

	@Test
	void codeOnlyConstructorUsesDefaultTitle() {
		DomainException ex = new DomainException(ErrorCode.NOT_FOUND);
		assertEquals(ErrorCode.NOT_FOUND, ex.code());
		assertEquals(ErrorCode.NOT_FOUND.defaultTitle(), ex.detail());
		assertEquals(404, ex.httpStatus());
		assertNull(ex.params());
		assertNull(ex.fieldErrors());
	}

	@Test
	void detailOnlyConstructorUsesProvidedDetail() {
		DomainException ex = new DomainException(ErrorCode.NOT_FOUND, "no such product");
		assertEquals("no such product", ex.detail());
	}

	@Test
	void codeDetailParamsConstructorCarriesAllFields() {
		Map<String, Object> params = Map.of("max", 5);
		DomainException ex = new DomainException(
				ErrorCode.QUANTITY_LIMIT, "Merged quantity would exceed", params);
		assertEquals("Merged quantity would exceed", ex.detail());
		assertSame(params, ex.params());
	}

	@Test
	void fullConstructorCarriesAllFields() {
		Map<String, Object> params = Map.of("max", 5);
		List<FieldError> errors = List.of(
				new FieldError(
						"/contact/phone", "PHONE_FORMAT"));
		DomainException ex = new DomainException(
				ErrorCode.VALIDATION_FAILED, "Phone is wrong", params, errors, null);
		assertEquals(ErrorCode.VALIDATION_FAILED, ex.code());
		assertEquals("Phone is wrong", ex.detail());
		assertEquals(422, ex.httpStatus());
		assertSame(params, ex.params());
		assertSame(errors, ex.fieldErrors());
		assertNotNull(ex.getMessage());
	}

	@Test
	void problemTypeUriUsesKebabCase() {
		assertEquals("urn:mi-bolt:problem:not-found", ErrorCode.NOT_FOUND.problemTypeUri());
		assertEquals("urn:mi-bolt:problem:cart-version-conflict",
				ErrorCode.CART_VERSION_CONFLICT.problemTypeUri());
		assertTrue(ErrorCode.SERVICE_UNAVAILABLE.kebab().contains("-"));
	}
}
