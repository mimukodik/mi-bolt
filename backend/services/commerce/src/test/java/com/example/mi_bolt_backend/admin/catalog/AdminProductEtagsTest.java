package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.example.mi_bolt_backend.catalog.Product;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

class AdminProductEtagsTest {

	private final Product product = mock(Product.class);

	AdminProductEtagsTest() {
		when(product.getVersion()).thenReturn(4L);
	}

	@Test
	void etagQuotesTheVersion() {
		// Fails if AdminProductEtags.etag stops quoting the version.
		assertThat(AdminProductEtags.etag(7)).isEqualTo("\"7\"");
	}

	@Test
	void missingIfMatchIs428() {
		// Fails if the null check in AdminProductEtags.expectVersion is removed.
		assertThatThrownBy(() -> AdminProductEtags.expectVersion(product, null))
				.isInstanceOf(DomainException.class)
				.extracting(ex -> ((DomainException) ex).code())
				.isEqualTo(ErrorCode.PRECONDITION_REQUIRED);
	}

	@Test
	void blankIfMatchIs428() {
		// Fails if the isBlank() check in AdminProductEtags.expectVersion is removed.
		assertThatThrownBy(() -> AdminProductEtags.expectVersion(product, "  "))
				.isInstanceOf(DomainException.class)
				.extracting(ex -> ((DomainException) ex).code())
				.isEqualTo(ErrorCode.PRECONDITION_REQUIRED);
	}

	@Test
	void staleIfMatchIs412WithExpectedAndReceived() {
		// Fails if the received != product.getVersion() check in AdminProductEtags.expectVersion is removed.
		assertThatThrownBy(() -> AdminProductEtags.expectVersion(product, "\"3\""))
				.isInstanceOf(DomainException.class)
				.satisfies(ex -> {
					DomainException domainException = (DomainException) ex;
					assertThat(domainException.code()).isEqualTo(ErrorCode.PRODUCT_VERSION_CONFLICT);
					assertThat(domainException.params()).isEqualTo(Map.of("expected", 4L, "received", 3L));
				});
	}

	@Test
	void overflowingIfMatchIs412WithReceivedZero() {
		// Fails if the NumberFormatException catch block in AdminProductEtags.expectVersion is removed.
		assertThatThrownBy(() -> AdminProductEtags.expectVersion(product, "\"99999999999999999999\""))
				.isInstanceOf(DomainException.class)
				.satisfies(ex -> {
					DomainException domainException = (DomainException) ex;
					assertThat(domainException.code()).isEqualTo(ErrorCode.PRODUCT_VERSION_CONFLICT);
					assertThat(domainException.params()).isEqualTo(Map.of("expected", 4L, "received", 0L));
				});
	}

	@Test
	void matchingIfMatchPasses() {
		// Fails if the quote-stripping substring() in AdminProductEtags.expectVersion is removed.
		assertThatCode(() -> AdminProductEtags.expectVersion(product, "\"4\"")).doesNotThrowAnyException();
	}
}
