package com.example.mi_bolt_backend.session;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.time.OffsetDateTime;
import java.time.Duration;

class CurrentSessionTest {

	@Test
	void getReturnsNullWhenAttributeIsAbsent() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		assertNull(CurrentSession.get(request));
	}

	@Test
	void setThenGetReturnsSameInstance() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		ShopSession session = new ShopSession(
				"hash",
				OffsetDateTime.now(),
				OffsetDateTime.now().plus(Duration.ofDays(30)));
		CurrentSession.set(request, session);
		assertSame(session, CurrentSession.get(request));
	}
}
