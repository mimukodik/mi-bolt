package com.example.mi_bolt_backend.problem;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class JsonPointerTest {

	@Test
	void flatFieldBecomesSlashSegment() {
		assertEquals("/quantity", ProblemAdvice.toJsonPointer("quantity"));
	}

	@Test
	void nestedDottedFieldBecomesSlashedPath() {
		assertEquals("/contact/phone", ProblemAdvice.toJsonPointer("contact.phone"));
	}

	@Test
	void listIndexBecomesSlashIndex() {
		assertEquals("/items/0/quantity", ProblemAdvice.toJsonPointer("items[0].quantity"));
	}

	@Test
	void deeplyNestedPath() {
		assertEquals("/a/b/c/0/d",
				ProblemAdvice.toJsonPointer("a.b.c[0].d"));
	}

	@Test
	void emptyStringBecomesSlash() {
		assertEquals("/", ProblemAdvice.toJsonPointer(""));
	}

	@Test
	void nullBecomesSlash() {
		assertEquals("/", ProblemAdvice.toJsonPointer(null));
	}
}
