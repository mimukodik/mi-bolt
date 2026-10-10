package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.hibernate.Hibernate;
import org.mockito.AdditionalAnswers;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import com.example.mi_bolt_backend.test.IntegrationTest;

/**
 * Shares one Spring context with every other {@code @IntegrationTest} class
 * so Liquibase runs once, the loader loads the fixture once, and every
 * catalogue test reads the same 3 products / 4 images / 10 variants. The
 * fixture deliberately has two samsung colours (navy and navy-alt)
 * referencing the same image bytes with different alt texts, so the
 * alt-per-colour rule is exercised on every boot. The skip behaviour of
 * {@link CatalogLoader} is exercised by calling {@code CatalogLoader#run}
 * again and asserting the counts are unchanged. Invalid-fixture cases
 * build a temp-dir copy of the shared fixture; the loader validates the
 * WHOLE catalogue before the first repository save and persists inside a
 * {@code TransactionTemplate}, so a failed load leaves the shared
 * catalogue rows untouched.
 */
@IntegrationTest
class CatalogLoaderTest {

	@Autowired
	private CatalogLoader loader;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private CatalogImageRepository imageRepository;

	@Autowired
	private CatalogValidator validator;

	@Autowired
	private JsonMapper jsonMapper;

	@Autowired
	private PlatformTransactionManager transactionManager;

	@Autowired
	private JdbcTemplate jdbcTemplate;


	@Test
	void loaderReadsPromotionAndSalePricesWithoutInventingLegacyDefaults(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Path file = tmp.resolve("catalog.json");
		String json = Files.readString(file).replaceFirst("\"featured\": true", "\"featured\": true, \"promotion\": {\"enabled\": true,"
				+ "\"text\": \" Offer \",\"startsAt\":\"2026-10-10T01:00:00+01:00\",\"endsAt\":\"2026-10-11T00:00:00Z\"}")
				.replaceFirst("\"priceHuf\": [0-9]+", "\"priceHuf\": 399990, \"salePriceHuf\": 1");
		Files.writeString(file, json);
		ProductRepository capturedProducts = Mockito.mock(ProductRepository.class);
		CatalogImageRepository capturedImages = Mockito.mock(CatalogImageRepository.class);
		Mockito.when(capturedImages.save(ArgumentMatchers.any(CatalogImage.class))).thenAnswer(AdditionalAnswers.returnsFirstArg());
		CatalogLoader isolated = new CatalogLoader(capturedProducts, capturedImages, validator, jsonMapper, transactionManager, tmp);
		isolated.load();
		ArgumentCaptor<Product> captor = ArgumentCaptor.forClass(Product.class);
		Mockito.verify(capturedProducts, Mockito.times(3)).save(captor.capture());
		Product promoted = captor.getAllValues().get(0);
		assertThat(promoted.getPromotionEnabled()).isTrue();
		assertThat(promoted.getPromotionText()).isEqualTo("Offer");
		assertThat(promoted.getPromotionStartsAt().toInstant()).hasToString("2026-10-10T00:00:00Z");
		assertThat(promoted.getPromotionEndsAt().toInstant()).hasToString("2026-10-11T00:00:00Z");
		assertThat(promoted.getVariants().get(0).getSalePriceHuf()).isEqualTo(1L);
		Product legacy = captor.getAllValues().get(1);
		assertThat(legacy.getPromotionEnabled()).isNull();
		assertThat(legacy.getVariants().get(0).getSalePriceHuf()).isNull();
	}


	@Test
	void loaderRejectsFractionalSalePrice(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Path file = tmp.resolve("catalog.json");
		Files.writeString(file, Files.readString(file).replaceFirst("\"priceHuf\": [0-9]+",
				"\"priceHuf\": 399990, \"salePriceHuf\": 1.5"));
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository, validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load).isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("cannot parse catalog.json");
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderPopulatesFixtureOnSharedContext() {
		assertThat(productRepository.count()).isEqualTo(3);
		assertThat(imageRepository.count()).isEqualTo(4);
	}

	@Test
	void loaderSkipsWhenCatalogueAlreadyPresent() {
		long before = productRepository.count();
		long imagesBefore = imageRepository.count();
		loader.run(new DefaultApplicationArguments());
		assertThat(productRepository.count()).isEqualTo(before);
		assertThat(imageRepository.count()).isEqualTo(imagesBefore);
	}

	// Fails if the DataIntegrityViolationException catch in CatalogLoader#run is removed, or if the
	// real duplicate insert surfaces as another exception type than the one it catches.
	@Test
	void aRealDuplicateFirstCatalogueInsertIsSkipped() {
		long before = productRepository.count();
		ProductRepository zeroCount = Mockito.mock(ProductRepository.class,
				AdditionalAnswers.delegatesTo(productRepository));
		Mockito.doReturn(0L).when(zeroCount).count();
		CatalogLoader isolated = new CatalogLoader(zeroCount, imageRepository,
				validator, jsonMapper, transactionManager, Path.of("src/test/resources/catalog"));

		assertThatCode(() -> isolated.run(null)).doesNotThrowAnyException();

		assertThat(productRepository.count()).isEqualTo(before);
	}

	@Test
	void loaderRejectsMissingImageFile(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Files.delete(tmp.resolve("images").resolve(firstImageName(tmp)));
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load)
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("not found");
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderRejectsHashMismatch(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Path imagePath = tmp.resolve("images").resolve(firstImageName(tmp));
		byte[] bytes = Files.readAllBytes(imagePath);
		byte[] corrupted = new byte[bytes.length + 1];
		System.arraycopy(bytes, 0, corrupted, 0, bytes.length);
		corrupted[bytes.length] = 0;
		Files.write(imagePath, corrupted);
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load)
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("SHA-256 mismatch")
				.hasMessageContaining(firstImageName(tmp));
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderRejectsUnknownColorCode(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Path catalogFile = tmp.resolve("catalog.json");
		String json = Files.readString(catalogFile).replace(
				"\"colorCode\": \"navy\"", "\"colorCode\": \"phantom\"");
		Files.writeString(catalogFile, json);
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load)
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("unknown colorCode");
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderRejectsDuplicateVariantSlug(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Path catalogFile = tmp.resolve("catalog.json");
		String json = Files.readString(catalogFile).replace(
				"\"slug\": \"sotetkek-256gb\"", "\"slug\": \"sotetkek-128gb\"");
		Files.writeString(catalogFile, json);
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load)
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("duplicate variant slug")
				.hasMessageContaining("samsung-galaxy-s25");
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderRejectsMissingCatalogFile(@TempDir Path tmp) {
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load)
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("catalogue file not found");
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderRejectsMalformedCatalogJson(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Files.writeString(tmp.resolve("catalog.json"), "{not json");
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load)
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("cannot parse catalog.json");
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderRejectsImageFileThatIsADirectory(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		Path imagePath = tmp.resolve("images").resolve(firstImageName(tmp));
		Files.delete(imagePath);
		Files.createDirectory(imagePath);
		CatalogLoader isolated = new CatalogLoader(productRepository, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		assertThatThrownBy(isolated::load)
				.isInstanceOf(CatalogValidationException.class)
				.hasMessageContaining("cannot read image file");
		assertThat(productRepository.count()).isEqualTo(3);
	}

	@Test
	void loaderRollsBackTransactionWhenSaveFails(@TempDir Path tmp) throws IOException {
		copyFixture(tmp);
		jdbcTemplate.execute("DELETE FROM cart_item");
		jdbcTemplate.execute("DELETE FROM cart");
		jdbcTemplate.execute("DELETE FROM product_variant");
		jdbcTemplate.execute("DELETE FROM product_color");
		jdbcTemplate.execute("DELETE FROM product");
		jdbcTemplate.execute("DELETE FROM catalog_image");
		assertThat(productRepository.count()).isZero();
		assertThat(imageRepository.count()).isZero();

		ProductRepository failing = Mockito.mock(ProductRepository.class,
				AdditionalAnswers.delegatesTo(productRepository));
		AtomicInteger saves = new AtomicInteger();
		Mockito.doAnswer(invocation -> {
			if (saves.incrementAndGet() == 2) {
				throw new IllegalStateException("boom");
			}
			return productRepository.save(invocation.getArgument(0));
		}).when(failing).save(ArgumentMatchers.any(Product.class));

		CatalogLoader isolated = new CatalogLoader(failing, imageRepository,
				validator, jsonMapper, transactionManager, tmp);
		try {
			assertThatThrownBy(isolated::load)
					.isInstanceOf(IllegalStateException.class)
					.hasMessage("boom");

			assertThat(productRepository.count()).isZero();
			assertThat(imageRepository.count()).isZero();
		}
		finally {
			loader.run(new DefaultApplicationArguments());
			assertThat(productRepository.count()).isEqualTo(3);
			assertThat(imageRepository.count()).isEqualTo(4);
		}
	}

	@Test
	@Transactional
	void loaderExposesPersistedProductScalarsAndCollections() {
		List<Product> products = productRepository.findAll(Sort.by("slug"));
		assertThat(products).extracting(Product::getSlug)
				.containsExactly("apple-iphone-16", "nokia-105", "samsung-galaxy-s25");

		Product apple = products.get(0);
		assertThat(apple.getBrand()).isEqualTo("Apple");
		assertThat(apple.getName()).isEqualTo("iPhone 16");
		assertThat(apple.getDescription())
				.isEqualTo("Az Apple iPhone 16 a 2024-es iPhone generáció alapmodellje.");
		assertThat(apple.getReleasedAt()).isEqualTo(LocalDate.parse("2024-09-20"));
		assertThat(apple.getRank()).isEqualTo(18);
		assertThat(apple.getPopularityScore()).isEqualTo(92);
		assertThat(apple.isIs5g()).isTrue();
		assertThat(apple.isFeatured()).isFalse();
		assertThat(apple.getId()).isNotNull();
		assertThat(apple.getHighlights()).extracting(ProductHighlight::getText)
				.containsExactly("6,1\" Super Retina XDR", "A18 chip", "48 MP Fusion kamera");
		ProductHighlight firstHighlight = apple.getHighlights().get(0);
		assertThat(firstHighlight.getId()).isNotNull();
		assertThat(firstHighlight.getProduct()).isSameAs(apple);
		assertThat(firstHighlight.getPosition()).isZero();
		assertThat(apple.getSpecGroups()).extracting(SpecGroup::getTitle)
				.containsExactly("Kijelző", "Processzor");
		SpecGroup display = apple.getSpecGroups().get(0);
		assertThat(display.getId()).isNotNull();
		assertThat(display.getProduct()).isSameAs(apple);
		assertThat(display.getPosition()).isZero();
		assertThat(display.getRows()).extracting(SpecRow::getLabel, SpecRow::getRowValue)
				.containsExactly(tuple("Méret", "6,1\""), tuple("Felbontás", "2556×1179"));
		SpecRow sizeRow = display.getRows().get(0);
		assertThat(sizeRow.getId()).isNotNull();
		assertThat(sizeRow.getSpecGroup()).isSameAs(display);
		assertThat(sizeRow.getPosition()).isZero();
		assertThat(apple.getColors()).extracting(ProductColor::getCode)
				.containsExactly("midnight");
		ProductColor midnight = apple.getColors().get(0);
		assertThat(midnight.getId()).isNotNull();
		assertThat(midnight.getProduct()).isSameAs(apple);
		assertThat(midnight.getPosition()).isZero();
		assertThat(midnight.getName()).isEqualTo("Éjfekete");
		assertThat(midnight.getSwatchHex()).isEqualTo("#14141E");
		assertThat(Hibernate.unproxy(midnight.getImage(), CatalogImage.class).getId())
				.isEqualTo("071b4f5e6090cfe2a70515bdcf2b72ecc5f21ed6d39ad6dcb9b510e39e24a5a3");
		assertThat(midnight.getImage().getContentType()).isEqualTo("image/png");
		assertThat(midnight.getImage().getWidth()).isEqualTo(300);
		assertThat(midnight.getImage().getHeight()).isEqualTo(600);
		assertThat(midnight.getAlt()).isEqualTo("Apple iPhone 16 éjfekete");
		assertThat(midnight.getImage().getBytes()).hasSize(62839);

		Product samsung = products.get(2);
		assertThat(samsung.getColors()).extracting(ProductColor::getCode)
				.containsExactly("navy", "silver", "navy-alt");
		ProductColor navy = samsung.getColors().get(0);
		ProductColor navyAlt = samsung.getColors().get(2);
		assertThat(navy.getAlt()).isEqualTo("Samsung Galaxy S25 sötétkék");
		assertThat(navyAlt.getAlt()).isEqualTo("Samsung Galaxy S25 sötétkék alternatív");
		assertThat(Hibernate.unproxy(navy.getImage(), CatalogImage.class).getId())
				.isEqualTo(Hibernate.unproxy(navyAlt.getImage(), CatalogImage.class).getId());
		assertThat(apple.getVariants()).extracting(v -> v.getColor().getCode())
				.containsExactly("midnight", "midnight");
		assertThat(apple.getVariants().get(0).getProduct()).isSameAs(apple);
		assertThat(apple.getVariants()).extracting(
				ProductVariant::getId, ProductVariant::getSlug,
				ProductVariant::getStorageGb, ProductVariant::getPriceHuf, ProductVariant::getStock)
				.containsExactly(
						tuple("apple-iphone-16--midnight--128", "ejszaka-128gb", 128, 399990L, 8),
						tuple("apple-iphone-16--midnight--256", "ejszaka-256gb", 256, 449990L, 5));

		assertThat(products.get(2).isFeatured()).isTrue();
	}

	private String firstImageName(Path tmp) throws IOException {
		try (Stream<Path> stream = Files.list(tmp.resolve("images"))) {
			return stream.findFirst().orElseThrow().getFileName().toString();
		}
	}

	private void copyFixture(Path tmp) throws IOException {
		Path sourceImages = Path.of("src/test/resources/catalog/images");
		Path sourceCatalog = Path.of("src/test/resources/catalog/catalog.json");
		Path targetImages = tmp.resolve("images");
		Files.createDirectories(targetImages);
		try (Stream<Path> stream = Files.list(sourceImages)) {
			stream.forEach(p -> {
				try {
					Files.copy(p, targetImages.resolve(p.getFileName()));
				}
				catch (IOException e) {
					throw new UncheckedIOException(e);
				}
			});
		}
		Files.copy(sourceCatalog, tmp.resolve("catalog.json"));
	}
}
