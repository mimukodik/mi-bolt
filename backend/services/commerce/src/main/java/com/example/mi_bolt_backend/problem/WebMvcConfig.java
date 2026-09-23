package com.example.mi_bolt_backend.problem;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

	private final UnknownQueryParameterInterceptor unknownQueryParameter;

	public WebMvcConfig(UnknownQueryParameterInterceptor unknownQueryParameter) {
		this.unknownQueryParameter = unknownQueryParameter;
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(unknownQueryParameter);
	}
}
