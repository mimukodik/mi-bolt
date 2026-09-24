package com.example.mi_bolt_backend.test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer;
import org.springframework.context.annotation.Bean;

import com.example.mi_bolt_backend.demo.DemoAccessService;

import jakarta.servlet.http.Cookie;

/**
 * Every MockMvc request of an {@link IntegrationTest} carries a valid demo access cookie
 * (MIM-423), issued once per application context. A request that sets its own
 * {@code mibolt_demo_access} cookie replaces this one: MockMvc adds a default-request
 * cookie only when the request has none of the same name.
 */
@TestConfiguration(proxyBeanMethods = false)
public class DemoAccessTestConfiguration {

	@Bean
	MockMvcBuilderCustomizer demoAccessCookie(DemoAccessService demoAccess) {
		return builder -> builder.defaultRequest(
				get("/").cookie(new Cookie(DemoAccessService.COOKIE_NAME, demoAccess.issueSession())));
	}
}
