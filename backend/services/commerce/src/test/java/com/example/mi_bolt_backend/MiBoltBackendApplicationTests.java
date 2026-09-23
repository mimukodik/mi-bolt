package com.example.mi_bolt_backend;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.example.mi_bolt_backend.api.config.EnumConverterConfiguration;
import com.example.mi_bolt_backend.test.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

@IntegrationTest
class MiBoltBackendApplicationTests {

	@Autowired
	private ApplicationContext context;

	@Test
	void contextLoads() {
		// Spring Boot context-loads test: success is the absence of an exception.
	}

	@Test
	void enumConverterConfigurationBeanIsPresent() {
		EnumConverterConfiguration bean = context.getBean(EnumConverterConfiguration.class);
		assertNotNull(bean, "Generated EnumConverterConfiguration should be registered");
	}
}
