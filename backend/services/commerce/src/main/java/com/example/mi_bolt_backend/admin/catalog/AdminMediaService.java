package com.example.mi_bolt_backend.admin.catalog;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.example.mi_bolt_backend.api.model.FieldError;
import com.example.mi_bolt_backend.catalog.CatalogImage;
import com.example.mi_bolt_backend.catalog.CatalogImageRepository;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * Stores an uploaded catalogue image. The type and the size come from the bytes
 * ({@link ImageInspector}), never from the part's declared type or file name. The id
 * is the SHA-256 hex of the bytes, so the same bytes uploaded again return the stored
 * row and an old media URL never serves new bytes. Unreferenced images are kept.
 */
@Service
public class AdminMediaService {

	private final ImageInspector imageInspector;
	private final CatalogImageRepository catalogImageRepository;

	public AdminMediaService(ImageInspector imageInspector, CatalogImageRepository catalogImageRepository) {
		this.imageInspector = imageInspector;
		this.catalogImageRepository = catalogImageRepository;
	}

	/** The stored image, and whether this call created it. */
	public record Stored(CatalogImage image, boolean created) {
	}

	/**
	 * Stores {@code bytes} unless they are already stored. The lookup and the save each
	 * run in the repository's own transaction, so a concurrent upload of the same bytes
	 * surfaces as a {@link DataIntegrityViolationException} from the save and is answered
	 * with the row the other upload stored.
	 */
	public Stored upload(byte[] bytes) {
		InspectedImage inspected = inspect(bytes);
		String id = sha256Hex(bytes);
		Optional<CatalogImage> existing = catalogImageRepository.findById(id);
		if (existing.isPresent()) {
			return new Stored(existing.get(), false);
		}
		CatalogImage image = new CatalogImage();
		image.setId(id);
		image.setContentType(inspected.contentType());
		image.setWidth(inspected.width());
		image.setHeight(inspected.height());
		image.setBytes(bytes);
		try {
			return new Stored(catalogImageRepository.save(image), true);
		}
		catch (DataIntegrityViolationException ex) {
			return new Stored(catalogImageRepository.findById(id).orElseThrow(() -> ex), false);
		}
	}

	private InspectedImage inspect(byte[] bytes) {
		try {
			return imageInspector.inspect(bytes);
		}
		catch (ImageRejectedException ex) {
			throw new DomainException(ErrorCode.VALIDATION_FAILED, "One or more supplied fields are not acceptable",
					null, List.of(new FieldError("/file", ex.reason().name())), ex);
		}
	}

	private static String sha256Hex(byte[] bytes) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 not available", ex);
		}
	}
}