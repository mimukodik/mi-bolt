package com.example.mi_bolt_backend.admin.catalog;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.example.mi_bolt_backend.api.AdminMediaApi;
import com.example.mi_bolt_backend.api.model.UploadedImage;
import com.example.mi_bolt_backend.catalog.CatalogImage;
import com.example.mi_bolt_backend.catalog.CatalogService;

/** The AdminMedia operation; delegation only. 201 with a Location for new bytes, 200 for bytes already stored. */
@RestController
public class AdminMediaController implements AdminMediaApi {

	private final AdminMediaService adminMediaService;

	public AdminMediaController(AdminMediaService adminMediaService) {
		this.adminMediaService = adminMediaService;
	}

	@Override
	public ResponseEntity<UploadedImage> uploadAdminMedia(MultipartFile file) {
		AdminMediaService.Stored stored = adminMediaService.upload(bytesOf(file));
		CatalogImage image = stored.image();
		UploadedImage body = new UploadedImage(image.getId(), CatalogService.MEDIA_SRC_PREFIX + image.getId(),
				UploadedImage.ContentTypeEnum.fromValue(image.getContentType()), image.getWidth(), image.getHeight(),
				image.getBytes().length);
		if (stored.created()) {
			return ResponseEntity.created(URI.create(body.getSrc())).body(body);
		}
		return ResponseEntity.ok(body);
	}

	private static byte[] bytesOf(MultipartFile file) {
		try {
			return file.getBytes();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}
}