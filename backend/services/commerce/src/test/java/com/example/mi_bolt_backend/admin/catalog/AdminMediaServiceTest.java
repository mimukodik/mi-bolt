package com.example.mi_bolt_backend.admin.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Optional;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import com.example.mi_bolt_backend.catalog.CatalogImage;
import com.example.mi_bolt_backend.catalog.CatalogImageRepository;

/** The concurrent-upload branch of {@link AdminMediaService}, which the API test cannot reach. */
class AdminMediaServiceTest {

	private final CatalogImageRepository repository = mock(CatalogImageRepository.class);
	private final AdminMediaService service = new AdminMediaService(new ImageInspector(), repository);

	// Fails if the DataIntegrityViolationException catch around the save is removed.
	@Test
	void losingTheInsertRaceAnswersTheStoredRow() throws IOException {
		CatalogImage stored = new CatalogImage();
		when(repository.findById(anyString())).thenReturn(Optional.empty(), Optional.of(stored));
		when(repository.save(any(CatalogImage.class))).thenThrow(new DataIntegrityViolationException("duplicate key"));

		AdminMediaService.Stored result = service.upload(png(3, 2));

		assertThat(result.created()).isFalse();
		assertThat(result.image()).isSameAs(stored);
	}

	// Fails if the catch answers a violation that no stored row explains.
	@Test
	void aViolationWithoutAStoredRowIsRethrown() throws IOException {
		DataIntegrityViolationException violation = new DataIntegrityViolationException("other constraint");
		when(repository.findById(anyString())).thenReturn(Optional.empty());
		when(repository.save(any(CatalogImage.class))).thenThrow(violation);
		byte[] png = png(3, 2);

		assertThatThrownBy(() -> service.upload(png)).isSameAs(violation);
	}

	private static byte[] png(int width, int height) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}
}