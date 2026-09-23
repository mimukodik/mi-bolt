package com.example.mi_bolt_backend.cart;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Provides the {@link Clock} the cart service injects to keep "now" deterministic in tests. */
@Configuration
public class CartClockConfig {

	@Bean
	Clock cartClock() {
		return Clock.systemUTC();
	}
}
