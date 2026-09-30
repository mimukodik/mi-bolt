package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import com.example.mi_bolt_backend.test.IntegrationTest;

@IntegrationTest
@TestPropertySource(properties = {
		"mibolt.smoke.enabled=false",
		"spring.datasource.url=jdbc:h2:mem:archived-canary;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class SmokeCanaryArchivedCatalogTest {

	@Autowired
	private ProductRepository products;
	@Autowired
	private CatalogImageRepository images;
	@Autowired
	private JdbcTemplate jdbc;
	@Autowired
	private PlatformTransactionManager transactionManager;

	@Test
	void storedImageBootstrapsCanaryEvenWhenEveryNormalProductIsArchived() {
		assertThat(products.count()).isEqualTo(3);
		jdbc.update("update product set archived_at = CURRENT_TIMESTAMP");
		assertThat(products.findAllWithColors()).isEmpty();
		String imageId = images.findFirstByOrderByIdAsc().orElseThrow().getId();

		new SmokeCanaryBootstrap(products, images, transactionManager, true).run(null);

		assertThat(products.count()).isEqualTo(4);
		assertThat(products.existsBySlug(SmokeCanaryBootstrap.PRODUCT_SLUG)).isTrue();
		assertThat(jdbc.queryForObject("select count(*) from product where archived_at is not null", Integer.class))
				.isEqualTo(3);
		assertThat(jdbc.queryForObject("select image_id from product_color c join product p on p.id = c.product_id where p.slug = ?",
				String.class, SmokeCanaryBootstrap.PRODUCT_SLUG)).isEqualTo(imageId);
	}
}
