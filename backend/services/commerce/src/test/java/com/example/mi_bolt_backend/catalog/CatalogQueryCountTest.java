package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.example.mi_bolt_backend.api.model.ProductSort;
import com.example.mi_bolt_backend.test.IntegrationTest;

import jakarta.persistence.EntityManagerFactory;

@IntegrationTest
class CatalogQueryCountTest {

	@Autowired
	private EntityManagerFactory entityManagerFactory;

	@Autowired
	private CatalogService catalogService;

	private Statistics statistics() {
		Statistics stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
		stats.clear();
		return stats;
	}

	@Test
	void listRunsFiveQueries() {
		Statistics stats = statistics();
		catalogService.listProducts(null, null, null, null, null, null, null, null, null, null,
				ProductSort.RECOMMENDED, 1, 12);
		assertThat(stats.getPrepareStatementCount()).isEqualTo(5);
	}

	@Test
	void detailRunsSixQueries() {
		Statistics stats = statistics();
		catalogService.getProduct("samsung-galaxy-s25");
		assertThat(stats.getPrepareStatementCount()).isEqualTo(6);
	}

	@Test
	void relatedRunsFiveQueries() {
		Statistics stats = statistics();
		catalogService.listRelatedProducts("samsung-galaxy-s25");
		assertThat(stats.getPrepareStatementCount()).isEqualTo(5);
	}
}
