package com.example.mi_bolt_backend.catalog;

import java.util.Map;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

import com.example.mi_bolt_backend.api.MediaApi;
import com.example.mi_bolt_backend.problem.DomainException;
import com.example.mi_bolt_backend.problem.ErrorCode;

/**
 * Serves catalogue images. The image id is content-addressed: the SHA-256 hex
 * of the bytes is the file name, so an old URL never serves new bytes and
 * the response can carry a one-year immutable Cache-Control header. Public:
 * {@code /media/{imageId}} sits outside the scoped session-cookie prefixes.
 */
@RestController
public class MediaController implements MediaApi {

	private static final String CACHE_CONTROL = "public, max-age=31536000, immutable";

	private final CatalogImageRepository catalogImageRepository;

	public MediaController(CatalogImageRepository catalogImageRepository) {
		this.catalogImageRepository = catalogImageRepository;
	}

	@Override
	public ResponseEntity<Resource> getMedia(String imageId) {
		return catalogImageRepository.findById(imageId)
				.map(image -> {
					HttpHeaders headers = new HttpHeaders();
					headers.setContentType(MediaType.parseMediaType(image.getContentType()));
					headers.setContentLength(image.getBytes().length);
					headers.setCacheControl(CACHE_CONTROL);
					return ResponseEntity.ok()
							.headers(headers)
							.body((Resource) new ByteArrayResource(image.getBytes()));
				})
				.orElseThrow(() -> new DomainException(
						ErrorCode.NOT_FOUND,
						"image not found: " + imageId,
						Map.of("imageId", imageId)));
	}
}
