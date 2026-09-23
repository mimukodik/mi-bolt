package com.example.mi_bolt_backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.List;
import java.util.Map;

import com.example.mi_bolt_backend.catalog.ProductRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.AnnotationAwareOrderComparator;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Readiness is not UP until the catalogue loader has run (MIM-414). Two test-only runners
 * bracket the production runners: one runs before {@code CatalogLoader} (order -1), one after
 * every production runner (order LOWEST_PRECEDENCE - 1), which
 * {@code everyProductionRunnerIsOrderedBeforeTheAfterProbe} guards. The context gets its own H2
 * database, so the loader loads the three-product test fixture here instead of finding a
 * catalogue another context loaded; the assertions hold while this context is created once per
 * JVM, because {@code DB_CLOSE_DELAY=-1} keeps that database populated for the JVM's lifetime.
 */
@IntegrationTest
@Import(ReadinessBeforeRunnersTest.ProbeRunners.class)
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:readiness;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1")
class ReadinessBeforeRunnersTest {

	/** Written by the probe runners during startup and read by the tests, both on the same thread. */
	static ReadinessState beforeLoaderState;
	static long beforeLoaderProducts = -1;
	static int beforeLoaderHttpStatus = -1;
	static String beforeLoaderHttpBody;
	static ReadinessState afterRunnersState;
	static long afterRunnersProducts = -1;
	static int afterRunnersHttpStatus = -1;

	@Autowired
	private ApplicationContext context;

	@Test
	void readinessRefusesTrafficBeforeTheCatalogueLoaderRuns() {
		assertThat(beforeLoaderState).isEqualTo(ReadinessState.REFUSING_TRAFFIC);
		assertThat(beforeLoaderProducts).isZero();
		assertThat(beforeLoaderHttpStatus).isEqualTo(503);
		assertThat(beforeLoaderHttpBody).contains("\"status\":\"OUT_OF_SERVICE\"");
	}

	@Test
	void theCatalogueIsLoadedWhileReadinessStillRefusesTraffic() {
		assertThat(afterRunnersProducts).isEqualTo(3L);
		assertThat(afterRunnersState).isEqualTo(ReadinessState.REFUSING_TRAFFIC);
		assertThat(afterRunnersHttpStatus).isEqualTo(503);
	}

	/**
	 * The after-probe's {@code LOWEST_PRECEDENCE - 1} order brackets the runners that exist
	 * today only: a production runner declared without an {@code @Order} sorts at
	 * {@code LOWEST_PRECEDENCE} and runs after the probe, so the bracket the class documents
	 * would stop covering it without any test going red. A production runner appears only after
	 * a decision, so this guard fails loudly and asks for one: give the runner an order below
	 * the probe's.
	 */
	@Test
	void everyProductionRunnerIsOrderedBeforeTheAfterProbe() {
		Map<String, ApplicationRunner> runners = context.getBeansOfType(ApplicationRunner.class);
		ApplicationRunner afterProbe = runners.values().stream()
				.filter(ProbeRunners.AfterEveryRunner.class::isInstance)
				.findFirst()
				.orElseThrow();
		List<String> production = runners.entrySet().stream()
				.filter(entry -> entry.getValue().getClass().getPackageName().startsWith("com.example.mi_bolt_backend"))
				.filter(entry -> !(entry.getValue() instanceof ProbeRunners.BeforeCatalogLoader))
				.filter(entry -> !(entry.getValue() instanceof ProbeRunners.AfterEveryRunner))
				.map(Map.Entry::getKey)
				.toList();
		assertThat(production).as("the production runners the after-probe has to bracket").isNotEmpty();
		production.forEach(name -> assertThat(AnnotationAwareOrderComparator.INSTANCE.compare(runners.get(name), afterProbe))
				.as("production runner '%s' must be ordered before the after-probe", name)
				.isNegative());
	}

	@TestConfiguration
	static class ProbeRunners {

		static class BeforeCatalogLoader implements ApplicationRunner, Ordered {

			private final ApplicationAvailability availability;
			private final ProductRepository products;
			private final ObjectProvider<MockMvc> mockMvc;

			BeforeCatalogLoader(ApplicationAvailability availability, ProductRepository products,
					ObjectProvider<MockMvc> mockMvc) {
				this.availability = availability;
				this.products = products;
				this.mockMvc = mockMvc;
			}

			@Override
			public void run(ApplicationArguments args) throws Exception {
				beforeLoaderState = availability.getReadinessState();
				beforeLoaderProducts = products.count();
				MvcResult result = mockMvc.getObject().perform(get("/actuator/health/readiness")).andReturn();
				beforeLoaderHttpStatus = result.getResponse().getStatus();
				beforeLoaderHttpBody = result.getResponse().getContentAsString();
			}

			@Override
			public int getOrder() {
				return -1;
			}
		}

		static class AfterEveryRunner implements ApplicationRunner, Ordered {

			private final ApplicationAvailability availability;
			private final ProductRepository products;
			private final ObjectProvider<MockMvc> mockMvc;

			AfterEveryRunner(ApplicationAvailability availability, ProductRepository products,
					ObjectProvider<MockMvc> mockMvc) {
				this.availability = availability;
				this.products = products;
				this.mockMvc = mockMvc;
			}

			@Override
			public void run(ApplicationArguments args) throws Exception {
				afterRunnersState = availability.getReadinessState();
				afterRunnersProducts = products.count();
				MvcResult result = mockMvc.getObject().perform(get("/actuator/health/readiness")).andReturn();
				afterRunnersHttpStatus = result.getResponse().getStatus();
			}

			@Override
			public int getOrder() {
				return LOWEST_PRECEDENCE - 1;
			}
		}

		@Bean
		BeforeCatalogLoader beforeCatalogLoader(ApplicationAvailability availability, ProductRepository products,
				ObjectProvider<MockMvc> mockMvc) {
			return new BeforeCatalogLoader(availability, products, mockMvc);
		}

		@Bean
		AfterEveryRunner afterEveryRunner(ApplicationAvailability availability, ProductRepository products,
				ObjectProvider<MockMvc> mockMvc) {
			return new AfterEveryRunner(availability, products, mockMvc);
		}
	}
}
