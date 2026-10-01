package com.example.mi_bolt_backend.catalog;

import java.time.LocalDate;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Demo-only fixture; never alters a normal catalogue product or its stock. */
@Component
@Order(3)
public class SmokeCanaryBootstrap implements ApplicationRunner {

	public static final String PRODUCT_SLUG = "mi-bolt-smoke-canary";
	public static final String VARIANT_ID = PRODUCT_SLUG + "--fekete--128";
	public static final int STOCK = CatalogService.MAX_PER_LINE;

	private final ProductRepository products;
	private final CatalogImageRepository images;
	private final TransactionTemplate transaction;
	private final boolean enabled;

	public SmokeCanaryBootstrap(ProductRepository products, CatalogImageRepository images,
			PlatformTransactionManager transactionManager,
			@Value("${mibolt.smoke.enabled:false}") boolean enabled) {
		this.products = products;
		this.images = images;
		this.transaction = new TransactionTemplate(transactionManager);
		this.enabled = enabled;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (!enabled) {
			return;
		}
		try {
			transaction.executeWithoutResult(status -> bootstrap());
		}
		catch (DataIntegrityViolationException ex) {
			// Only a completed competing bootstrap makes a unique-key collision harmless.
			if (!products.existsBySlug(PRODUCT_SLUG)) {
				throw ex;
			}
		}
	}

	private void bootstrap() {
		if (products.existsBySlug(PRODUCT_SLUG)) {
			return;
		}
		CatalogImage image = images.findFirstByOrderByIdAsc()
				.orElseThrow(() -> new IllegalStateException("Smoke canary requires a loaded catalogue image"));
		Product product = new Product();
		product.setSlug(PRODUCT_SLUG);
		product.setBrand("MiBolt");
		product.setName("Smoke canary");
		product.setDescription("Synthetic demo product for hosted smoke checks.");
		product.setReleasedAt(LocalDate.of(2026, 9, 30));
		product.setRank(Integer.MAX_VALUE);
		product.setPopularityScore(0);
		ProductHighlight highlight = new ProductHighlight();
		highlight.setProduct(product);
		highlight.setPosition(0);
		highlight.setText("Synthetic demo fixture");
		product.getHighlights().add(highlight);
		SpecGroup group = new SpecGroup();
		group.setProduct(product);
		group.setPosition(0);
		group.setTitle("Demo");
		SpecRow row = new SpecRow();
		row.setSpecGroup(group);
		row.setPosition(0);
		row.setLabel("Purpose");
		row.setRowValue("Hosted smoke checks");
		group.getRows().add(row);
		product.getSpecGroups().add(group);
		ProductColor color = new ProductColor();
		color.setProduct(product);
		color.setCode("fekete");
		color.setName("Fekete");
		color.setSwatchHex("#000000");
		color.setAlt("MiBolt smoke canary");
		color.setPosition(0);
		color.setImage(image);
		product.getColors().add(color);
		ProductVariant variant = new ProductVariant();
		variant.setId(VARIANT_ID);
		variant.setSlug("fekete-128");
		variant.setProduct(product);
		variant.setColor(color);
		variant.setStorageGb(128);
		variant.setPriceHuf(10_000L);
		variant.setStock(STOCK);
		product.getVariants().add(variant);
		products.saveAndFlush(product);
	}
}
