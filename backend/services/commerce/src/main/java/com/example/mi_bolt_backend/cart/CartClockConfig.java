package com.example.mi_bolt_backend.cart;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Provides the {@link Clock} the cart service injects to keep "now" deterministic in tests. */
@Configuration
public class CartClockConfig {

	@Bean
	Clock cartClock() {
		return new Clock() {
			@Override
			public ZoneId getZone() { return ZoneOffset.UTC; }
			@Override
			public Clock withZone(ZoneId zone) { return fixed(instant(), zone); }
			@Override
			public Instant instant() {
				RequestAttributes request = RequestContextHolder.getRequestAttributes();
				if (request == null) { return Instant.now(); }
				String key = CartClockConfig.class.getName();
				Instant at = (Instant) request.getAttribute(key, RequestAttributes.SCOPE_REQUEST);
				if (at == null) {
					at = Instant.now();
					request.setAttribute(key, at, RequestAttributes.SCOPE_REQUEST);
				}
				return at;
			}
		};
	}
}
