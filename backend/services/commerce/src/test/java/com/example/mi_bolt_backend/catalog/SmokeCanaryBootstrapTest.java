package com.example.mi_bolt_backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

class SmokeCanaryBootstrapTest {

	private ProductRepository products;
	private CatalogImageRepository images;
	private SmokeCanaryBootstrap bootstrap;

	@BeforeEach
	void setUp() {
		products = mock(ProductRepository.class);
		images = mock(CatalogImageRepository.class);
		PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
		when(manager.getTransaction(any())).thenReturn(mock(TransactionStatus.class));
		bootstrap = new SmokeCanaryBootstrap(products, images, manager, true);
	}

	@Test
	void disabledFlagDoesNotReadOrWriteCatalogue() {
		new SmokeCanaryBootstrap(products, images, mock(PlatformTransactionManager.class), false).run(null);
		verify(products, never()).existsBySlug(any());
		verify(products, never()).saveAndFlush(any());
		verify(images, never()).findFirstByOrderByIdAsc();
	}

	@Test
	void existingFixtureIsNeverReset() {
		when(products.existsBySlug(SmokeCanaryBootstrap.PRODUCT_SLUG)).thenReturn(true);
		bootstrap.run(null);
		verify(products, never()).findAllWithColors();
		verify(products, never()).saveAndFlush(any());
		verify(images, never()).findFirstByOrderByIdAsc();
	}

	@Test
	void populatedCatalogueProvidesImageForIndependentSyntheticProduct() {
		CatalogImage source = new CatalogImage();
		when(images.findFirstByOrderByIdAsc()).thenReturn(Optional.of(source));
		bootstrap.run(null);
		ArgumentCaptor<Product> saved = ArgumentCaptor.forClass(Product.class);
		verify(products).saveAndFlush(saved.capture());
		Product canary = saved.getValue();
		assertThat(canary.getSlug()).isEqualTo(SmokeCanaryBootstrap.PRODUCT_SLUG);
		assertThat(canary.getColors()).hasSize(1);
		assertThat(canary.getColors().getFirst().getImage()).isSameAs(source);
		assertThat(canary.getVariants()).hasSize(1);
		ProductVariant variant = canary.getVariants().getFirst();
		assertThat(variant.getId()).isEqualTo(SmokeCanaryBootstrap.VARIANT_ID);
		assertThat(variant.getStock()).isEqualTo(5);
		assertThat(variant.getPriceHuf()).isEqualTo(10_000L);
		assertThat(variant.getProduct()).isSameAs(canary);
		assertThat(variant.getColor().getProduct()).isSameAs(canary);
		verify(products, never()).findAllWithColors();
	}

	@Test
	void archivedCatalogueDoesNotPreventCanaryBootstrap() {
		when(images.findFirstByOrderByIdAsc()).thenReturn(Optional.of(new CatalogImage()));
		assertThatCode(() -> bootstrap.run(null)).doesNotThrowAnyException();
		verify(products).saveAndFlush(any());
		verify(products, never()).findAllWithColors();
	}

	@Test
	void missingCatalogueImageRefusesStartup() {
		when(images.findFirstByOrderByIdAsc()).thenReturn(Optional.empty());
		assertThatThrownBy(() -> bootstrap.run(null)).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void committedCompetingBootstrapMakesCollisionHarmless() {
		when(products.existsBySlug(SmokeCanaryBootstrap.PRODUCT_SLUG)).thenReturn(false, true);
		when(images.findFirstByOrderByIdAsc()).thenReturn(Optional.of(new CatalogImage()));
		doThrow(new DataIntegrityViolationException("duplicate fixture")).when(products).saveAndFlush(any());
		bootstrap.run(null);
	}

	@Test
	void unrelatedIntegrityFailureIsNotSwallowed() {
		when(images.findFirstByOrderByIdAsc()).thenReturn(Optional.of(new CatalogImage()));
		doThrow(new DataIntegrityViolationException("invalid fixture")).when(products).saveAndFlush(any());
		assertThatThrownBy(() -> bootstrap.run(null)).isInstanceOf(DataIntegrityViolationException.class);
	}
}
