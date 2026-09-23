package com.example.mi_bolt_backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import com.example.mi_bolt_backend.catalog.ProductRepository;
import com.example.mi_bolt_backend.test.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Readiness is not UP until the catalogue loader has run (MIM-414). Two test-only runners
 * bracket the production runners: one runs before {@code CatalogLoader} (order -1), one after
 * every production runner (order LOWEST_PRECEDENCE - 1). The context gets its own H2 database, so the loader always loads the
 * three-product test fixture here instead of finding a catalogue another context loaded.
 */
@IntegrationTest
@Import(ReadinessBeforeRunnersTest.ProbeRunners.class)
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:readiness;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1")
class ReadinessBeforeRunnersTest {

	static final AtomicReference<ReadinessState> BEFORE_LOADER_STATE = new AtomicReference<>();
	static final AtomicLong BEFORE_LOADER_PRODUCTS = new AtomicLong(-1);
	static final AtomicInteger BEFORE_LOADER_HTTP_STATUS = new AtomicInteger(-1);
	static final AtomicReference<String> BEFORE_LOADER_HTTP_BODY = new AtomicReference<>();
	static final AtomicReference<ReadinessState> AFTER_RUNNERS_STATE = new AtomicReference<>();
	static final AtomicLong AFTER_RUNNERS_PRODUCTS = new AtomicLong(-1);

	@Test
	void readinessRefusesTrafficBeforeTheCatalogueLoaderRuns() {
		assertThat(BEFORE_LOADER_STATE.get()).isEqualTo(ReadinessState.REFUSING_TRAFFIC);
		assertThat(BEFORE_LOADER_PRODUCTS.get()).isZero();
		assertThat(BEFORE_LOADER_HTTP_STATUS.get()).isEqualTo(503);
		assertThat(BEFORE_LOADER_HTTP_BODY.get()).contains("\"status\":\"OUT_OF_SERVICE\"");
	}

	@Test
	void theCatalogueIsLoadedWhileReadinessStillRefusesTraffic() {
		assertThat(AFTER_RUNNERS_PRODUCTS.get()).isEqualTo(3L);
		assertThat(AFTER_RUNNERS_STATE.get()).isEqualTo(ReadinessState.REFUSING_TRAFFIC);
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
				BEFORE_LOADER_STATE.set(availability.getReadinessState());
				BEFORE_LOADER_PRODUCTS.set(products.count());
				MvcResult result = mockMvc.getObject().perform(get("/actuator/health/readiness")).andReturn();
				BEFORE_LOADER_HTTP_STATUS.set(result.getResponse().getStatus());
				BEFORE_LOADER_HTTP_BODY.set(result.getResponse().getContentAsString());
			}

			@Override
			public int getOrder() {
				return -1;
			}
		}

		static class AfterEveryRunner implements ApplicationRunner, Ordered {

			private final ApplicationAvailability availability;
			private final ProductRepository products;

			AfterEveryRunner(ApplicationAvailability availability, ProductRepository products) {
				this.availability = availability;
				this.products = products;
			}

			@Override
			public void run(ApplicationArguments args) {
				AFTER_RUNNERS_STATE.set(availability.getReadinessState());
				AFTER_RUNNERS_PRODUCTS.set(products.count());
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
		AfterEveryRunner afterEveryRunner(ApplicationAvailability availability, ProductRepository products) {
			return new AfterEveryRunner(availability, products);
		}
	}
}
