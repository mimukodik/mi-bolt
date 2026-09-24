package com.example.mi_bolt_backend.catalog;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.json.JsonMapper;

/**
 * Loads the catalogue from {@code mibolt.catalog.path}/catalog.json at
 * startup, after Liquibase has applied the schema. Runs exactly once per
 * empty database: if the product table is not empty the loader logs and
 * skips, so a restart does not re-load. On any rule violation the loader
 * throws and the application refuses to start.
 *
 * <p>The persist step runs inside a {@link TransactionTemplate} so that any
 * failure (validation gap or JPA constraint violation) rolls back and the
 * shared catalogue rows are never partially written.
 */
@Component
@Order(0)
public class CatalogLoader implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(CatalogLoader.class);

	private final ProductRepository productRepository;
	private final CatalogImageRepository catalogImageRepository;
	private final CatalogValidator validator;
	private final Path catalogPath;
	private final JsonMapper objectMapper;
	private final TransactionTemplate transactionTemplate;

	@Autowired
	public CatalogLoader(ProductRepository productRepository,
			CatalogImageRepository catalogImageRepository,
			CatalogValidator validator,
			JsonMapper objectMapper,
			PlatformTransactionManager transactionManager,
			@Value("${mibolt.catalog.path:../../../data/catalog}") String catalogPath) {
		this(productRepository, catalogImageRepository, validator, objectMapper, transactionManager,
				Path.of(catalogPath));
	}

	/** Package-private constructor for tests that drive {@link #load()} against a {@code @TempDir}. */
	CatalogLoader(ProductRepository productRepository,
			CatalogImageRepository catalogImageRepository,
			CatalogValidator validator,
			JsonMapper objectMapper,
			PlatformTransactionManager transactionManager,
			Path catalogPath) {
		this.productRepository = productRepository;
		this.catalogImageRepository = catalogImageRepository;
		this.validator = validator;
		this.objectMapper = objectMapper;
		this.catalogPath = catalogPath;
		this.transactionTemplate = new TransactionTemplate(transactionManager);
	}

	@Override
	public void run(ApplicationArguments args) {
		long existing = productRepository.count();
		if (existing > 0) {
			log.info("catalogue present, {} products, loader skipped", existing);
			return;
		}
		load();
	}

	void load() {
		Path catalogFile = catalogPath.resolve("catalog.json");
		Path imagesDir = catalogPath.resolve("images");
		if (!Files.isRegularFile(catalogFile)) {
			throw new CatalogValidationException(
					"catalogue file not found: " + catalogFile);
		}

		CatalogDto catalog;
		try {
			catalog = objectMapper.readValue(catalogFile.toFile(), CatalogDto.class);
		}
		catch (Exception e) {
			throw new CatalogValidationException(
					"cannot parse catalog.json: " + e.getMessage(), e);
		}

		CatalogValidator.ValidatedCatalog validated = validator.validate(catalog, imagesDir);

		try {
			transactionTemplate.executeWithoutResult(status -> persist(validated));
		}
		catch (DataIntegrityViolationException ex) {
			if (log.isInfoEnabled()) {
				log.info("catalogue already loaded by another instance, loader skipped");
			}
		}
	}

	private void persist(CatalogValidator.ValidatedCatalog validated) {
		Map<String, CatalogImage> imagesBySha = new LinkedHashMap<>();
		for (Map.Entry<String, byte[]> entry : validated.getImagesBySha().entrySet()) {
			String sha = entry.getKey();
			CatalogImage image = new CatalogImage();
			image.setId(sha);
			image.setContentType(validated.getContentTypeBySha().get(sha));
			image.setWidth(validated.getWidthBySha().get(sha));
			image.setHeight(validated.getHeightBySha().get(sha));
			image.setBytes(entry.getValue());
			imagesBySha.put(sha, catalogImageRepository.save(image));
		}

		int products = 0;
		int variants = 0;
		int featured = 0;
		for (ProductDto productDto : validated.getProducts()) {
			Product product = new Product();
			product.setSlug(productDto.getSlug());
			product.setBrand(productDto.getBrand());
			product.setName(productDto.getName());
			product.setDescription(productDto.getDescription());
			product.setIs5g(productDto.isIs5g());
			product.setReleasedAt(LocalDate.parse(productDto.getReleasedAt()));
			product.setRank(productDto.getRank());
			product.setPopularityScore(productDto.getPopularityScore());
			product.setFeatured(productDto.isFeatured());

			int pos = 0;
			for (String text : productDto.getHighlights()) {
				ProductHighlight h = new ProductHighlight();
				h.setProduct(product);
				h.setPosition(pos);
				pos++;
				h.setText(text);
				product.getHighlights().add(h);
			}

			Map<String, ProductColor> colorByCode = new HashMap<>();
			int cpos = 0;
			for (ColorDto colorDto : productDto.getColors()) {
				ProductColor color = new ProductColor();
				color.setProduct(product);
				color.setCode(colorDto.getCode());
				color.setName(colorDto.getName());
				color.setSwatchHex(colorDto.getSwatchHex());
				color.setAlt(colorDto.getImage().getAlt());
				color.setImage(imagesBySha.get(stripExt(colorDto.getImage().getFile())));
				color.setPosition(cpos);
				cpos++;
				product.getColors().add(color);
				colorByCode.put(color.getCode(), color);
			}

			int spos = 0;
			for (SpecGroupDto sg : productDto.getSpecGroups()) {
				SpecGroup group = new SpecGroup();
				group.setProduct(product);
				group.setPosition(spos);
				spos++;
				group.setTitle(sg.getLabel());
				int rpos = 0;
				for (SpecRowDto row : sg.getRows()) {
					SpecRow sr = new SpecRow();
					sr.setSpecGroup(group);
					sr.setPosition(rpos);
					rpos++;
					sr.setLabel(row.getLabel());
					sr.setRowValue(row.getValue());
					group.getRows().add(sr);
				}
				product.getSpecGroups().add(group);
			}

			for (VariantDto variantDto : productDto.getVariants()) {
				ProductVariant variant = new ProductVariant();
				variant.setId(variantDto.getId());
				variant.setProduct(product);
				variant.setSlug(variantDto.getSlug());
				variant.setColor(colorByCode.get(variantDto.getColorCode()));
				variant.setStorageGb(variantDto.getStorageGb());
				variant.setPriceHuf(variantDto.getPriceHuf());
				variant.setStock(variantDto.getStock());
				product.getVariants().add(variant);
				variants++;
			}

			productRepository.save(product);
			products++;
			if (productDto.isFeatured()) {
				featured++;
			}
		}

		if (log.isInfoEnabled()) {
			log.info("catalogue loaded: {} products, {} variants, {} images, {} featured",
					products, variants, imagesBySha.size(), featured);
		}
	}

	private static String stripExt(String file) {
		int dot = file.lastIndexOf('.');
		return dot < 0 ? file : file.substring(0, dot);
	}
}
