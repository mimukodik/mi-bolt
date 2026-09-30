package com.example.mi_bolt_backend.cart;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class CartClockConfigTest {
	@Test
	void oneInstantIsSharedThroughoutARequestAndReleasedForTheNextRequest() {
		Clock clock = new CartClockConfig().cartClock();
		assertThat(clock.getZone()).isEqualTo(ZoneOffset.UTC);
		assertThat(clock.instant()).isBeforeOrEqualTo(Instant.now());
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
		try {
			Instant first = clock.instant();
			assertThat(clock.instant()).isSameAs(first);
			assertThat(clock.withZone(ZoneId.of("Europe/Budapest")).getZone()).isEqualTo(ZoneId.of("Europe/Budapest"));
			assertThat(clock.withZone(ZoneOffset.UTC).instant()).isEqualTo(first);
		}
		finally { RequestContextHolder.resetRequestAttributes(); }
	}
}
