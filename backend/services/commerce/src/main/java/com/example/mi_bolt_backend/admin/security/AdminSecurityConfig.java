package com.example.mi_bolt_backend.admin.security;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

/**
 * Two Spring Security filter chains against the {@code /api/v1} context path
 * (plan §1.2). Chain 1 guards {@code /admin/**}; chain 2 keeps every other
 * request exactly as before — declared second so chain 1 wins by ordering
 * and the matcher excludes the shop.
 */
@Configuration
@EnableWebSecurity
public class AdminSecurityConfig {

	/**
	 * Cookie path must be {@code "/"}: {@code document.cookie} on the SPA
	 * (served from {@code /admin/}) does not see a cookie scoped under
	 * {@code /api/v1} (plan §1.2, CookieCsrfTokenRepository 7.1.1).
	 */
	@Bean
	public CookieCsrfTokenRepository adminCsrfTokenRepository() {
		CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
		repository.setCookiePath("/");
		return repository;
	}

	/** Shared between chain 1 and the B5 login controller. */
	@Bean
	public SecurityContextRepository adminSecurityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	@Bean
	public PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	@Bean
	public AuthenticationManager adminAuthenticationManager(
			AdminUserDetailsService adminUserDetailsService,
			PasswordEncoder passwordEncoder) {
		DaoAuthenticationProvider provider = new DaoAuthenticationProvider(adminUserDetailsService);
		provider.setPasswordEncoder(passwordEncoder);
		return new ProviderManager(provider);
	}

	@Bean
	public SessionAuthenticationStrategy adminSessionAuthenticationStrategy(
			CookieCsrfTokenRepository adminCsrfTokenRepository) {
		return new CompositeSessionAuthenticationStrategy(List.of(
				new ChangeSessionIdAuthenticationStrategy(),
				new CsrfAuthenticationStrategy(adminCsrfTokenRepository)));
	}

	/** Chain 1, {@code @Order(1)}: {@code /admin/**}. */
	@Bean
	@Order(1)
	public SecurityFilterChain adminFilterChain(HttpSecurity http,
			LiveAdminAuthorizationManager liveAdminAuthorizationManager,
			CookieCsrfTokenRepository adminCsrfTokenRepository,
			SecurityContextRepository adminSecurityContextRepository,
			ProblemAuthenticationEntryPoint problemAuthenticationEntryPoint,
			ProblemAccessDeniedHandler problemAccessDeniedHandler) throws Exception {
		http
				.securityMatcher("/admin/**")
				.csrf(c -> c.spa().csrfTokenRepository(adminCsrfTokenRepository))
				.exceptionHandling(c -> c
						.authenticationEntryPoint(problemAuthenticationEntryPoint)
						.accessDeniedHandler(problemAccessDeniedHandler))
				.authorizeHttpRequests(c -> c
						.requestMatchers(HttpMethod.GET, "/admin/auth/session").permitAll()
						.requestMatchers(HttpMethod.POST, "/admin/auth/login", "/admin/auth/logout").permitAll()
						.anyRequest().access(liveAdminAuthorizationManager))
				.formLogin(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				.logout(AbstractHttpConfigurer::disable)
				.requestCache(AbstractHttpConfigurer::disable)
				.securityContext(c -> c.securityContextRepository(adminSecurityContextRepository));
		return http.build();
	}

	/** Chain 2, {@code @Order(2)}: every shop request stays exactly as before. */
	@Bean
	@Order(2)
	public SecurityFilterChain publicFilterChain(HttpSecurity http) throws Exception {
		http
				.csrf(AbstractHttpConfigurer::disable)
				.headers(AbstractHttpConfigurer::disable)
				.requestCache(AbstractHttpConfigurer::disable)
				.formLogin(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				.logout(AbstractHttpConfigurer::disable)
				.sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(c -> c.anyRequest().permitAll());
		return http.build();
	}
}