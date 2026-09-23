package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import tools.jackson.databind.json.JsonMapper;

import com.example.mi_bolt_backend.api.model.AdminProductInput;
import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.cart.CartItemRepository;
import com.example.mi_bolt_backend.catalog.CatalogImage;
import com.example.mi_bolt_backend.catalog.CatalogImageRepository;
import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.catalog.ProductColor;
import com.example.mi_bolt_backend.catalog.ProductVariant;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

class AdminProductCommandServiceTest {

	private static final JsonMapper MAPPER = JsonMapper.builder().build();
	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-09-23T00:00Z");

	private final AdminProductRepository repository = mock(AdminProductRepository.class);
	private final CatalogImageRepository images = mock(CatalogImageRepository.class);
	private final CartItemRepository cartItems = mock(CartItemRepository.class);
	private final AdminProductCommandService service = new AdminProductCommandService(repository, images,
			new AdminProductValidator(), Clock.fixed(Instant.parse("2026-09-23T00:00:00Z"), ZoneOffset.UTC),
			cartItems);

	@Test
	// Fails if the DataIntegrityViolationException catch in create is removed.
	void createLosingTheSlugUniqueConstraintIs422SlugTaken() {
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b11-race", false), AdminProductInput.class);
		when(repository.existsBySlug("b11-race")).thenReturn(false);
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		when(repository.saveAndFlush(any(Product.class)))
				.thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));

		assertThatThrownBy(() -> service.create(input))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
					assertThat(e.detail()).isEqualTo("One or more supplied fields are not acceptable");
					assertThat(e.fieldErrors()).containsExactly(new FieldError("/slug", "SLUG_TAKEN"));
					assertThat(e.getCause()).isInstanceOf(DataIntegrityViolationException.class);
				});
	}

	@Test
	// Fails if featuredLimitReached stops locking the featured rows before it counts them.
	void createFeaturedLocksBeforeCounting() {
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b11-lock", true), AdminProductInput.class);
		when(repository.existsBySlug("b11-lock")).thenReturn(false);
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		when(repository.lockFeaturedLimit()).thenReturn(1);
		when(repository.countByFeaturedTrueAndArchivedAtIsNull()).thenReturn(4L);

		assertThatThrownBy(() -> service.create(input))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
					assertThat(e.fieldErrors()).containsExactly(new FieldError("/featured", "FEATURED_LIMIT")
							.putParamsItem("max", AdminProductCommandService.FEATURED_LIMIT));
				});

		InOrder inOrder = inOrder(repository);
		inOrder.verify(repository).lockFeaturedLimit();
		inOrder.verify(repository).countByFeaturedTrueAndArchivedAtIsNull();
	}

	@Test
	// Fails if create takes the featured lock for a product that is not featured.
	void createNotFeaturedTakesNoLock() {
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b11-nolock", false), AdminProductInput.class);
		when(repository.existsBySlug("b11-nolock")).thenReturn(false);
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		Product saved = mock(Product.class);
		when(saved.getId()).thenReturn(5L);
		when(repository.saveAndFlush(any(Product.class))).thenReturn(saved);

		assertThat(service.create(input)).isEqualTo(5L);

		verify(repository, never()).lockFeaturedLimit();
		verify(repository, never()).countByFeaturedTrueAndArchivedAtIsNull();
	}

	@Test
	// Fails if featuredLimitReached stops locking the featured rows before it counts them.
	void restoreOfAFeaturedProductLocksBeforeCounting() {
		Product product = new Product();
		product.setFeatured(true);
		product.setArchivedAt(OffsetDateTime.parse("2026-09-01T00:00:00Z"));
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(repository.lockFeaturedLimit()).thenReturn(1);
		when(repository.countByFeaturedTrueAndArchivedAtIsNull()).thenReturn(4L);

		assertThatThrownBy(() -> service.restore(7, "\"0\""))
				.isInstanceOfSatisfying(DomainException.class,
						e -> assertThat(e.code()).isEqualTo(ErrorCode.FEATURED_LIMIT));

		InOrder inOrder = inOrder(repository);
		inOrder.verify(repository).lockFeaturedLimit();
		inOrder.verify(repository).countByFeaturedTrueAndArchivedAtIsNull();
	}

	@Test
	// Fails if the ObjectOptimisticLockingFailureException catch in replace is removed.
	void replaceLosingTheVersionRaceIs412() {
		Product product = new Product();
		product.setSlug("b12-unit");
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b12-unit", false), AdminProductInput.class);
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		when(repository.saveAndFlush(any(Product.class)))
				.thenThrow(new ObjectOptimisticLockingFailureException(Product.class, 7L));

		assertThatThrownBy(() -> service.replace(7, "\"0\"", input))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.PRODUCT_VERSION_CONFLICT);
					assertThat(e.params()).containsExactlyEntriesOf(Map.of("received", 0L));
					assertThat(e.getCause()).isInstanceOf(ObjectOptimisticLockingFailureException.class);
				});
	}

	@Test
	// Fails if the DataIntegrityViolationException catch in replace is removed.
	void replaceHittingAUniqueConstraintIs409() {
		Product product = new Product();
		product.setSlug("b12-unit");
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b12-unit", false), AdminProductInput.class);
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		when(repository.saveAndFlush(any(Product.class)))
				.thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));

		assertThatThrownBy(() -> service.replace(7, "\"0\"", input))
				.isInstanceOfSatisfying(DomainException.class,
						e -> assertThat(e.code()).isEqualTo(ErrorCode.CATALOG_CONSTRAINT_CONFLICT));
	}

	@Test
	// Fails if replace stops locking the featured rows before it counts them.
	void replaceMakingAProductFeaturedLocksBeforeCounting() {
		Product product = new Product();
		product.setSlug("b12-unit");
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b12-unit", true), AdminProductInput.class);
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		when(repository.lockFeaturedLimit()).thenReturn(1);
		when(repository.countByFeaturedTrueAndArchivedAtIsNull()).thenReturn(4L);

		assertThatThrownBy(() -> service.replace(7, "\"0\"", input))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
					assertThat(e.fieldErrors()).containsExactly(new FieldError("/featured", "FEATURED_LIMIT")
							.putParamsItem("max", AdminProductCommandService.FEATURED_LIMIT));
				});

		InOrder inOrder = inOrder(repository);
		inOrder.verify(repository).lockFeaturedLimit();
		inOrder.verify(repository).countByFeaturedTrueAndArchivedAtIsNull();
	}

	@Test
	// Fails if replace takes the featured lock for a product that is already featured.
	void replaceKeepingAFeaturedProductTakesNoLock() {
		Product product = new Product();
		product.setSlug("b12-unit");
		product.setFeatured(true);
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b12-unit", true), AdminProductInput.class);
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));

		service.replace(7, "\"0\"", input);

		verify(repository, never()).lockFeaturedLimit();
		verify(repository, never()).countByFeaturedTrueAndArchivedAtIsNull();
		verify(repository).saveAndFlush(product);
	}

	/** A product whose only variants, both white, are not kept by {@code AdminProductInputs.body("b12-unit", false)}. */
	private static Product productDroppingWhiteVariants() {
		Product product = new Product();
		product.setSlug("b12-unit");
		ProductColor white = new ProductColor();
		white.setCode("white");
		product.getColors().add(white);
		ProductVariant white256 = new ProductVariant();
		white256.setId("b12-unit--white--256");
		white256.setColor(white);
		white256.setStorageGb(256);
		product.getVariants().add(white256);
		ProductVariant white128 = new ProductVariant();
		white128.setId("b12-unit--white--128");
		white128.setColor(white);
		white128.setStorageGb(128);
		product.getVariants().add(white128);
		return product;
	}

	@Test
	// Fails if the VARIANT_IN_CART check in replace is removed, or the held ids stop being sorted.
	void replaceDroppingCartHeldVariantsIs409WithSortedIds() {
		Product product = productDroppingWhiteVariants();
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b12-unit", false), AdminProductInput.class);
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		when(cartItems.findVariantIdsInLiveCarts(List.of("b12-unit--white--128", "b12-unit--white--256"), NOW))
				.thenReturn(List.of("b12-unit--white--256", "b12-unit--white--128"));

		assertThatThrownBy(() -> service.replace(7, "\"0\"", input))
				.isInstanceOfSatisfying(DomainException.class, e -> {
					assertThat(e.code()).isEqualTo(ErrorCode.VARIANT_IN_CART);
					assertThat(e.params()).containsExactlyEntriesOf(
							Map.of("variantIds", List.of("b12-unit--white--128", "b12-unit--white--256")));
				});

		verify(cartItems, never()).deleteLinesInExpiredCarts(any(), any());
		verify(repository, never()).saveAndFlush(any());
	}

	@Test
	// Fails if the deleteLinesInExpiredCarts call in replace is removed, or runs after dropVariants/flush.
	void replaceDeletesExpiredCartLinesBeforeDroppingVariants() {
		Product product = productDroppingWhiteVariants();
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b12-unit", false), AdminProductInput.class);
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));
		when(cartItems.findVariantIdsInLiveCarts(List.of("b12-unit--white--128", "b12-unit--white--256"), NOW))
				.thenReturn(List.of());

		service.replace(7, "\"0\"", input);

		InOrder inOrder = inOrder(cartItems, repository);
		inOrder.verify(cartItems).deleteLinesInExpiredCarts(List.of("b12-unit--white--128", "b12-unit--white--256"), NOW);
		inOrder.verify(repository).flush();
		inOrder.verify(repository).saveAndFlush(product);
		assertThat(product.getVariants()).noneMatch(v -> v.getId().contains("white"));
	}

	@Test
	// Fails if replace asks the carts about a replace that drops nothing.
	void replaceDroppingNothingNeverAsksTheCarts() {
		Product product = new Product();
		product.setSlug("b12-unit");
		ProductColor black = new ProductColor();
		black.setCode("black");
		product.getColors().add(black);
		ProductVariant black128 = new ProductVariant();
		black128.setId("b12-unit--black--128");
		black128.setColor(black);
		black128.setStorageGb(128);
		product.getVariants().add(black128);
		AdminProductInput input = MAPPER.readValue(AdminProductInputs.body("b12-unit", false), AdminProductInput.class);
		when(repository.findById(7L)).thenReturn(Optional.of(product));
		when(images.findById(AdminProductInputs.IMAGE_ID)).thenReturn(Optional.of(new CatalogImage()));

		service.replace(7, "\"0\"", input);

		verifyNoInteractions(cartItems);
	}
}
